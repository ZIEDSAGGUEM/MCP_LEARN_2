-- Step 01: when each course meets (for the timetable resource)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS schedule text;
UPDATE courses SET schedule = 'Mon 09:00-11:00, Wed 14:00-16:00, Room B12' WHERE code = 'CS101';
UPDATE courses SET schedule = 'Tue 10:00-12:00, Thu 10:00-12:00, Room A03' WHERE code = 'MATH201';
