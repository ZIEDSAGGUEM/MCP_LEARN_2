import { ResourceNotFoundError, ResourceTemplate, type McpServer } from "@modelcontextprotocol/server";
import { canSeeCourse } from "../access.js";
import { principal } from "../auth.js";
import { hintFor } from "../cachePolicy.js";
import { campusUser, withUser } from "../db.js";
import { readFile } from "../files.js";

/** campus://courses/{course}/syllabus: the course PDF, for its students and teachers only. */
export function registerSyllabus(server: McpServer) {
  server.registerResource(
    "syllabus",
    new ResourceTemplate("campus://courses/{course}/syllabus", {
      list: async (ctx) => {
        const me = await campusUser(principal(ctx.http?.authInfo));
        const sql =
          me.role === "teacher"
            ? "SELECT course_code FROM teaches WHERE teacher_id = $1 ORDER BY 1"
            : "SELECT course_code FROM enrollments WHERE student_id = $1 ORDER BY 1";
        const { rows } = await withUser(me, (db) => db.query<{ course_code: string }>(sql, [me.id]));
        return {
          resources: rows.map((r) => ({
            uri: `campus://courses/${r.course_code}/syllabus`,
            name: `syllabus-${r.course_code}`,
            title: `${r.course_code} syllabus`,
            mimeType: "application/pdf",
          })),
        };
      },
    }),
    { title: "Course syllabus", description: "The syllabus PDF of a course you attend or teach.", mimeType: "application/pdf", cacheHint: hintFor("campus://courses/*") },
    async (uri, { course }, ctx) => {
      const me = await campusUser(principal(ctx.http?.authInfo));
      const code = String(course);
      const allowed = await withUser(me, (db) => canSeeCourse(db, me, code));
      if (!allowed) throw new ResourceNotFoundError(uri.href);
      // the file key is built from a validated course code (canSeeCourse checked its shape): never from raw input
      const pdf = await readFile(`syllabi/${code}.pdf`);
      return { contents: [{ uri: uri.href, mimeType: "application/pdf", blob: pdf.toString("base64") }] };
    },
  );
}
