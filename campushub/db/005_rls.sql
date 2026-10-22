-- Step 02: row-level security. The SECOND wall: even if the code forgets a check, Postgres refuses.
-- The app says who it acts for at the start of each transaction:
--   SELECT set_config('app.user_id', 'sara', true)        -- true = SET LOCAL: erased at COMMIT
-- No user set → campus_user() is NULL → every policy below matches nothing (fails closed).

CREATE OR REPLACE FUNCTION campus_user() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;
ALTER FUNCTION campus_user() OWNER TO campus_owner;

-- enrollments: a student sees their own; a teacher sees the enrollments of the courses they teach
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS enrollments_read ON enrollments;
CREATE POLICY enrollments_read ON enrollments FOR SELECT USING (
  student_id = campus_user()
  OR EXISTS (SELECT 1 FROM teaches t WHERE t.teacher_id = campus_user() AND t.course_code = enrollments.course_code)
);

-- submissions: the author, or a teacher of the assignment's course
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS submissions_read ON submissions;
CREATE POLICY submissions_read ON submissions FOR SELECT USING (
  student_id = campus_user()
  OR EXISTS (SELECT 1 FROM assignments a JOIN teaches t ON t.course_code = a.course_code
             WHERE a.id = submissions.assignment_id AND t.teacher_id = campus_user())
);
DROP POLICY IF EXISTS submissions_insert ON submissions;
CREATE POLICY submissions_insert ON submissions FOR INSERT WITH CHECK (   -- used from step 05
  student_id = campus_user()
  AND EXISTS (SELECT 1 FROM assignments a JOIN enrollments e ON e.course_code = a.course_code
              WHERE a.id = submissions.assignment_id AND e.student_id = campus_user())
);

-- grades: a student sees their own PUBLISHED grades; a teacher sees (and later writes) every grade of their courses
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS grades_student_read ON grades;
CREATE POLICY grades_student_read ON grades FOR SELECT USING (
  status = 'published'
  AND EXISTS (SELECT 1 FROM submissions s WHERE s.id = grades.submission_id AND s.student_id = campus_user())
);
DROP POLICY IF EXISTS grades_teacher_all ON grades;
CREATE POLICY grades_teacher_all ON grades FOR ALL USING (
  EXISTS (SELECT 1 FROM submissions s JOIN assignments a ON a.id = s.assignment_id JOIN teaches t ON t.course_code = a.course_code
          WHERE s.id = grades.submission_id AND t.teacher_id = campus_user())
) WITH CHECK (
  graded_by = campus_user()
  AND EXISTS (SELECT 1 FROM submissions s JOIN assignments a ON a.id = s.assignment_id JOIN teaches t ON t.course_code = a.course_code
              WHERE s.id = grades.submission_id AND t.teacher_id = campus_user())
);
