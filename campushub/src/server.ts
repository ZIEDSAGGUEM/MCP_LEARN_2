import { createMcpExpressApp, getOAuthProtectedResourceMetadataUrl, requireBearerAuth } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import type express from "express";
import { verifier } from "./auth.js";
import { cacheControlFor } from "./cachePolicy.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { limitCompletions } from "./ratelimit.js";
import { registerCatalog } from "./resources/catalog.js";
import { registerGrades } from "./resources/grades.js";
import { registerSyllabus } from "./resources/syllabus.js";
import { registerTimetable } from "./resources/timetable.js";

// A fresh McpServer per request: nothing is kept in a pod's memory (stateless, like InsureBot)
const handler = createMcpHandler(
  // The factory receives the verified token: per-request callbacks that need the caller (autocomplete) close over it
  ({ authInfo }) => {
    const server = new McpServer(
      { name: "campushub", version: "0.3.0" },
      // The resource LIST will depend on who asks from step 02, so it's private from the start
      { cacheHints: { "resources/list": { cacheScope: "private", ttlMs: 0 } } },
    );
    registerCatalog(server);
    registerTimetable(server);
    registerGrades(server, authInfo);
    registerSyllabus(server, authInfo);
    return server;
  },
  { legacy: "reject", onerror: (err) => console.error("mcp error:", err.message) },
);

const app = createMcpExpressApp({ host: config.host, allowedHosts: config.allowedHosts });
const node = toNodeHandler(handler);
const resourceUrl = new URL(config.resourceUrl);

app.get("/healthz", async (_req, res) => {
  const ok = await pool.query("SELECT 1").then(() => true, () => false);
  res.status(ok ? 200 : 503).json({ ok, pod: config.podName });
});

// cacheScope lives inside the JSON body, which HTTP caches never read: say the same thing in HTTP
function cacheHeaders(req: express.Request, res: express.Response, next: express.NextFunction) {
  const { cacheControl, vary } = cacheControlFor(req.body);
  res.set("Cache-Control", cacheControl);
  if (vary) res.set("Vary", vary);
  next();
}

const auth = requireBearerAuth({ verifier, expectedResource: resourceUrl, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl) });
app.all("/mcp", auth, limitCompletions, cacheHeaders, (req, res) => void node(req, res, req.body));

app.listen(config.port, config.host, () => console.log(`campushub ${config.podName} on http://${config.host}:${config.port}/mcp`));
