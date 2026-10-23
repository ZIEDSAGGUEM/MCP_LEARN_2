import { ResourceNotFoundError, ResourceTemplate, type AuthInfo, type McpServer } from "@modelcontextprotocol/server";
import { canSeeStudent, suggestStudents } from "../access.js";
import { principal } from "../auth.js";
import { hintFor } from "../cachePolicy.js";
import { campusUser, withUser } from "../db.js";

const PREFIX = "campus://students/";

/**
 * campus://students/{student}/grades: the client fills in {student}, so the client chooses the name.
 * The address says WHAT is wanted; the token says WHO asks; this checks they match. (Attack C1)
 */
export function registerGrades(server: McpServer, authInfo: AuthInfo | undefined) {
  server.registerResource(
    "grades",
    new ResourceTemplate(`${PREFIX}{student}/grades`, {
      // Autocomplete for {student} (attack C4). The SDK's callback receives only the typed text, never the caller,
      // so it's bound here to THIS request's verified token: the server is built fresh for every request.
      complete: {
        student: async (typed) => {
          const me = await campusUser(principal(authInfo));
          return withUser(me, (db) => suggestStudents(db, me, typed));
        },
      },
      // resources/list: ONLY the grade sheets the caller may read (attack C2)
      list: async (ctx) => {
        const me = await campusUser(principal(ctx.http?.authInfo));
        const students =
          me.role === "student"
            ? [{ id: me.id, name: me.name }]
            : (await withUser(me, (db) =>
                db.query<{ id: string; name: string }>(
                  "SELECT DISTINCT u.id, u.name FROM enrollments e JOIN users u ON u.id = e.student_id ORDER BY u.id",
                ))).rows;
        return {
          resources: students.map((s) => ({ uri: `${PREFIX}${s.id}/grades`, name: `grades-${s.id}`, title: `Grades of ${s.name}`, mimeType: "application/json" })),
        };
      },
    }),
    {
      title: "Grades",
      description: "Grades of one student. Students see their own published grades; teachers see their courses' grades.",
      mimeType: "application/json",
      cacheHint: hintFor("campus://students/*"), // always private
    },
    async (uri, { student }, ctx) => {
      const me = await campusUser(principal(ctx.http?.authInfo));
      const studentId = String(student);
      return withUser(me, async (db) => {
        // Same answer for "doesn't exist" and "not yours": nothing to learn by guessing names
        if (!(await canSeeStudent(db, me, studentId))) throw new ResourceNotFoundError(uri.href);
        // RLS adds the rest: students only see PUBLISHED grades, teachers only their own courses
        const { rows } = await db.query(
          `SELECT a.course_code AS course, a.title AS assignment, g.score::float AS score, g.feedback, g.status
             FROM grades g JOIN submissions s ON s.id = g.submission_id JOIN assignments a ON a.id = s.assignment_id
            WHERE s.student_id = $1 ORDER BY a.course_code, a.title`,
          [studentId],
        );
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ student: studentId, grades: rows }) }] };
      });
    },
  );
}
