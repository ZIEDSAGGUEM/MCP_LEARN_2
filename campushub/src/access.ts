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

const MAX_SUGGESTIONS = 20;
/** LIKE treats % and _ as wildcards: escape them so a typed "%" means a percent sign, not "everything" */
const likePrefix = (typed: string) => typed.replace(/[\\%_]/g, (c) => "\\" + c) + "%";

/**
 * Autocomplete for {student}: suggest ONLY students the caller could read anyway (attack C4).
 * A student only ever gets themselves; a teacher gets the students of the courses they teach.
 * The query runs as the caller, so row-level security would hide everyone else even if this code were wrong.
 */
export async function suggestStudents(db: pg.PoolClient, me: CampusUser, typed: string): Promise<string[]> {
  const t = typed.slice(0, 40);
  if (me.role === "student") return me.id.startsWith(t.toLowerCase()) ? [me.id] : [];
  const { rows } = await db.query<{ id: string }>(
    `SELECT DISTINCT u.id FROM enrollments e JOIN users u ON u.id = e.student_id
      WHERE u.id ILIKE $1 OR u.name ILIKE $1 ORDER BY u.id LIMIT ${MAX_SUGGESTIONS}`,
    [likePrefix(t)],
  );
  return rows.map((r) => r.id);
}

/** Autocomplete for {course}: only courses the caller attends or teaches. */
export async function suggestCourses(db: pg.PoolClient, me: CampusUser, typed: string): Promise<string[]> {
  const sql =
    me.role === "teacher"
      ? "SELECT course_code AS c FROM teaches WHERE teacher_id = $1 AND course_code ILIKE $2 ORDER BY 1"
      : "SELECT course_code AS c FROM enrollments WHERE student_id = $1 AND course_code ILIKE $2 ORDER BY 1";
  const { rows } = await db.query<{ c: string }>(sql, [me.id, likePrefix(typed.slice(0, 10))]);
  return rows.map((r) => r.c);
}
