import type { McpServer } from "@modelcontextprotocol/server";
import { principal } from "../auth.js";
import { hintFor } from "../cachePolicy.js";
import { campusUser, withUser } from "../db.js";

const URI = "campus://me/timetable";

/** My timetable: "me" is whoever the token says, so it's different for every caller and never shareable. */
export function registerTimetable(server: McpServer) {
  server.registerResource(
    "my-timetable",
    URI,
    {
      title: "My timetable",
      description: "The courses you attend (students) or teach (teachers), with their schedule.",
      mimeType: "application/json",
      cacheHint: hintFor(URI),
    },
    async (uri, ctx) => {
      const me = await campusUser(principal(ctx.http?.authInfo));
      const sql =
        me.role === "teacher"
          ? "SELECT c.code, c.title, c.schedule FROM teaches t JOIN courses c ON c.code = t.course_code WHERE t.teacher_id = $1 ORDER BY c.code"
          : "SELECT c.code, c.title, c.schedule FROM enrollments e JOIN courses c ON c.code = e.course_code WHERE e.student_id = $1 ORDER BY c.code";
      // enrollments has row-level security since step 02: query as the caller
      const { rows } = await withUser(me, (db) => db.query(sql, [me.id]));
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ for: me.name, role: me.role, courses: rows }) }],
      };
    },
  );
}
