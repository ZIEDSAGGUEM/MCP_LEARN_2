// WALL 1: explicit checks in the code, run BEFORE any data is read.
// WALL 2 is row-level security in Postgres (db/005_rls.sql): if this file ever has a bug, the database still refuses.
import type pg from "pg";
import type { CampusUser } from "./db.js";

// Template variables come from the client: validate their SHAPE before anything else
export const STUDENT_ID = /^[a-z][a-z0-9_]{1,30}$/;
export const COURSE_CODE = /^[A-Z]{2,5}[0-9]{3}$/;

/** May `me` see this student's grades? Themselves, or a teacher of one of the student's courses. */
export async function canSeeStudent(db: pg.PoolClient, me: CampusUser, studentId: string) {
  if (!STUDENT_ID.test(studentId)) return false;
  if (me.role === "student") return me.id === studentId;
  // as `me`, RLS only shows enrollments of courses `me` teaches
  const { rowCount } = await db.query("SELECT 1 FROM enrollments WHERE student_id = $1 LIMIT 1", [studentId]);
  return (rowCount ?? 0) > 0;
}

/** May `me` read this course's syllabus? Enrolled in it, or teaching it. */
export async function canSeeCourse(db: pg.PoolClient, me: CampusUser, course: string) {
  if (!COURSE_CODE.test(course)) return false;
  const sql =
    me.role === "teacher"
      ? "SELECT 1 FROM teaches WHERE teacher_id = $1 AND course_code = $2"
      : "SELECT 1 FROM enrollments WHERE student_id = $1 AND course_code = $2";
  return ((await db.query(sql, [me.id, course])).rowCount ?? 0) > 0;
}
