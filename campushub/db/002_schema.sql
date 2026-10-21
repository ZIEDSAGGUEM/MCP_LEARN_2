-- CampusHub data model (step 00).
-- Every access rule later is a question about these links:
-- "is Sara enrolled in CS101?", "does Tom teach the course of this submission?"
-- Row-level security comes in step 02; the grants below already give the app the least it needs.

CREATE TABLE users (
  id        text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{1,30}$'), -- matches the Keycloak username
  kc_sub    uuid UNIQUE,                                             -- Keycloak's user id, filled by scripts/setup.sh
  name      text NOT NULL,
  email     text NOT NULL UNIQUE,
  role      text NOT NULL CHECK (role IN ('student', 'teacher'))
);

CREATE TABLE courses (
  code          text PRIMARY KEY CHECK (code ~ '^[A-Z]{2,5}[0-9]{3}$'),
  title         text NOT NULL,
  description   text NOT NULL,
  teacher_notes text                      -- private to the course's teachers (leaks in C2 if listed carelessly)
);

CREATE TABLE teaches (
  teacher_id  text REFERENCES users(id),
  course_code text REFERENCES courses(code),
  PRIMARY KEY (teacher_id, course_code)
);

CREATE TABLE enrollments (
  student_id  text REFERENCES users(id),
  course_code text REFERENCES courses(code),
  PRIMARY KEY (student_id, course_code)
);

CREATE TABLE assignments (
  id          uuid PRIMARY KEY,
  course_code text NOT NULL REFERENCES courses(code),
  title       text NOT NULL,
  deadline    timestamptz NOT NULL
);

CREATE TABLE submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id),
  student_id    text NOT NULL REFERENCES users(id),
  object_key    text NOT NULL UNIQUE CHECK (object_key ~ '^submissions/[0-9a-f-]{36}\.pdf$'), -- server-chosen, never a filename
  size_bytes    integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),           -- 10 MB
  mime_type     text NOT NULL CHECK (mime_type = 'application/pdf'),
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

CREATE TABLE grades (
  submission_id uuid PRIMARY KEY REFERENCES submissions(id),
  score         numeric(3,1) NOT NULL CHECK (score >= 0 AND score <= 20),
  feedback      text,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  graded_by     text NOT NULL REFERENCES users(id),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON enrollments (course_code);
CREATE INDEX ON teaches (course_code);
CREATE INDEX ON submissions (student_id);

-- Ownership and least privilege
ALTER TABLE users       OWNER TO campus_owner;
ALTER TABLE courses     OWNER TO campus_owner;
ALTER TABLE teaches     OWNER TO campus_owner;
ALTER TABLE enrollments OWNER TO campus_owner;
ALTER TABLE assignments OWNER TO campus_owner;
ALTER TABLE submissions OWNER TO campus_owner;
ALTER TABLE grades      OWNER TO campus_owner;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO campus_app;
GRANT SELECT ON users, courses, teaches, enrollments, assignments, submissions, grades TO campus_app;
GRANT INSERT ON submissions TO campus_app;          -- students upload (step 05)
GRANT INSERT, UPDATE ON grades TO campus_app;       -- teachers grade (steps 07–08)
-- no DELETE anywhere, no UPDATE on submissions, no access to change ownership or RLS
