// Shared test helpers. Secrets come from .env / .env.test (created by scripts/setup.sh, git-ignored).
import pg from "pg";

for (const f of [".env", ".env.test"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    // run scripts/setup.sh first
  }
}

export const KEYCLOAK = "http://127.0.0.1:8090";
export const ISSUER = "http://localhost:8090/realms/campus";
export const RESOURCE_URL = "http://localhost:4100/mcp";
// 127.0.0.1, not "localhost": localhost may resolve to IPv6, where other dev servers can listen
export const MCP_URL = process.env.MCP_URL ?? "http://127.0.0.1:4100/mcp";
export type LabUser = "sara" | "bilal" | "mallory" | "tom" | "lina";

export async function tokenFor(user: LabUser, password = process.env[`${user.toUpperCase()}_PASSWORD`]) {
  const res = await fetch(`${KEYCLOAK}/realms/campus/protocol/openid-connect/token`, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "password", client_id: "campushub-tests", username: user, password: password ?? "" }),
  });
  return { status: res.status, body: (await res.json()) as { access_token?: string; error?: string } };
}

/** Decode a JWT payload (tests only: the server will VERIFY signatures, never just decode). */
export const claims = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());

/** Connect as the app role: what the MCP pods will use from step 01. */
export const asApp = () =>
  new pg.Client({ host: "127.0.0.1", port: 5434, database: "campus", user: "campus_app", password: process.env.CAMPUS_APP_PASSWORD });

/** Connect as the Postgres superuser: to inspect the data itself, past row-level security (tests and setup only). */
export const asAdmin = () =>
  new pg.Client({ host: "127.0.0.1", port: 5434, database: "campus", user: "postgres", password: process.env.POSTGRES_PASSWORD });

/** Expect a query to fail, and return the Postgres error message. */
export async function refused(db: pg.Client, sql: string, params: unknown[] = []) {
  // inside a transaction, a savepoint keeps the transaction usable after the expected error
  const inTx = await db.query("SAVEPOINT refused").then(() => true, () => false);
  try {
    await db.query(sql, params);
  } catch (e) {
    if (inTx) await db.query("ROLLBACK TO SAVEPOINT refused");
    return (e as Error).message;
  }
  throw new Error(`expected this query to be refused: ${sql}`);
}

/** A raw MCP 2026-07-28 request, so tests see status codes and headers (Cache-Control, X-Cache-Status). */
export async function mcp(
  token: string | undefined,
  method: string,
  params: Record<string, unknown> = {},
  opts: { url?: string; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2026-07-28",
    "mcp-method": method,
    ...(typeof params.name === "string" ? { "mcp-name": params.name } : {}),
    ...(typeof params.uri === "string" ? { "mcp-name": params.uri } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...opts.headers,
  };
  const res = await fetch(opts.url ?? MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "campushub-tests", version: "1" },
        },
      },
    }),
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON (for example an nginx error page)
  }
  return { status: res.status, headers: res.headers, body };
}

const tokens = new Map<string, string>();
/** A cached access token for a lab user (they last 5 minutes). */
export async function token(user: LabUser) {
  if (!tokens.has(user)) tokens.set(user, (await tokenFor(user)).body.access_token!);
  return tokens.get(user)!;
}

/** The JSON text of a resource read. */
export const contentOf = (r: { body: any }) => JSON.parse(r.body.result.contents[0].text);
