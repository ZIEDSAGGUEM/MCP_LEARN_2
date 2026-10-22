// The pods connect as campus_app: not the owner, not a superuser (step 00).
import pg from "pg";
import type { Principal } from "./auth.js";
import { config } from "./config.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });

export type CampusUser = { id: string; name: string; role: "student" | "teacher" };

/** Map the token's Keycloak id (sub) to the CampusHub user. Unknown → no access. */
export async function campusUser(who: Principal): Promise<CampusUser> {
  const { rows } = await pool.query<CampusUser>("SELECT id, name, role FROM users WHERE kc_sub = $1", [who.sub]);
  if (!rows[0]) throw new Error("This account isn't a CampusHub user");
  return rows[0];
}

/**
 * Run queries AS this campus user: Postgres row-level security (db/005_rls.sql) then filters every row.
 * set_config(..., true) = SET LOCAL: erased at COMMIT, so a pooled connection never keeps the user.
 */
export async function withUser<T>(user: CampusUser, fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT set_config('app.user_id', $1, true)", [user.id]);
    const out = await fn(db);
    await db.query("COMMIT");
    return out;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
