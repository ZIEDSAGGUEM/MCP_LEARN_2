import type { McpServer } from "@modelcontextprotocol/server";
import { hintFor } from "../cachePolicy.js";
import { pool } from "../db.js";

const URI = "campus://catalog";

/** The course catalog: identical for every user, so it's the one resource shared caches may keep. */
export function registerCatalog(server: McpServer) {
  server.registerResource(
    "catalog",
    URI,
    {
      title: "Course catalog",
      description: "Every course offered this term: code, title, description and schedule.",
      mimeType: "application/json",
      cacheHint: hintFor(URI),
    },
    async (uri) => {
      // Explicit columns: teacher_notes is private and must never end up in a public, cached resource
      const { rows } = await pool.query("SELECT code, title, description, schedule FROM courses ORDER BY code");
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ courses: rows }) }] };
    },
  );
}
