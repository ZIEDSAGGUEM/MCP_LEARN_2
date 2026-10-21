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
export const RESOURCE_URL = "http://localhost:4000/mcp";
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

/** Expect a query to fail, and return the Postgres error message. */
export async function refused(db: pg.Client, sql: string, params: unknown[] = []) {
  try {
    await db.query(sql, params);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`expected this query to be refused: ${sql}`);
}
