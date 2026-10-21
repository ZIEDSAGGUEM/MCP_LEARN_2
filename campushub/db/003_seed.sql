-- A small fake university. Emails use .test, so nothing can ever reach a real inbox.
-- Fixed IDs so tests and the MinIO files (scripts/setup.sh) can refer to them.

INSERT INTO users (id, name, email, role) VALUES
  ('sara',    'Sara Ben Ali',   'sara@campus.test',    'student'),
  ('bilal',   'Bilal Haddad',   'bilal@campus.test',   'student'),
  ('mallory', 'Mallory Grant',  'mallory@campus.test', 'student'),
  ('tom',     'Prof. Tom Weber','tom@campus.test',     'teacher'),
  ('lina',    'Prof. Lina Saidi','lina@campus.test',   'teacher');

INSERT INTO courses (code, title, description, teacher_notes) VALUES
  ('CS101',   'Introduction to Programming', 'Variables, loops, functions and a first project in TypeScript.',
              'Bilal struggled with recursion in week 3; offer extra help.'),
  ('MATH201', 'Linear Algebra',              'Vectors, matrices, determinants and eigenvalues.',
              'Midterm average was low; consider a curve.');

INSERT INTO teaches (teacher_id, course_code) VALUES ('tom', 'CS101'), ('lina', 'MATH201');

INSERT INTO enrollments (student_id, course_code) VALUES
  ('sara', 'CS101'), ('sara', 'MATH201'),
  ('bilal', 'CS101'),
  ('mallory', 'CS101');

INSERT INTO assignments (id, course_code, title, deadline) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'CS101',   'Essay: Why recursion matters', now() + interval '14 days'),
  ('a0000000-0000-4000-8000-000000000002', 'CS101',   'Project 1: To-do app',          now() + interval '30 days'),
  ('a0000000-0000-4000-8000-000000000003', 'MATH201', 'Problem set 1',                 now() + interval '7 days');

-- object_key points at a file scripts/setup.sh uploads to MinIO
INSERT INTO submissions (id, assignment_id, student_id, object_key, size_bytes, mime_type) VALUES
  ('50000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'sara',
     'submissions/50000000-0000-4000-8000-000000000001.pdf', 1200, 'application/pdf'),
  ('50000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'bilal',
     'submissions/50000000-0000-4000-8000-000000000002.pdf', 1100, 'application/pdf'),
  ('50000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'mallory',
     'submissions/50000000-0000-4000-8000-000000000003.pdf', 1500, 'application/pdf'),  -- the booby-trapped one (C12)
  ('50000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000003', 'sara',
     'submissions/50000000-0000-4000-8000-000000000004.pdf', 900,  'application/pdf');

INSERT INTO grades (submission_id, score, feedback, status, graded_by) VALUES
  ('50000000-0000-4000-8000-000000000001', 15.5, 'Clear structure, good examples.',        'published', 'tom'),
  ('50000000-0000-4000-8000-000000000002', 12.0, 'Good start; the base case needs work.',  'published', 'tom'),
  ('50000000-0000-4000-8000-000000000004', 17.0, 'Excellent, one small slip in Q3.',       'draft',     'lina');
-- Mallory's submission is not graded yet: that's the step 08 scenario
