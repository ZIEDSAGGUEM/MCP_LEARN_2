// Per-user request budget in Redis, shared by every pod (a limit kept in one pod's memory would be ×2 with 2 pods).
import type express from "express";
import { createClient } from "redis";
import { principal } from "./auth.js";
import { config } from "./config.js";

export const redis = createClient({ url: config.redisUrl });
redis.on("error", (e) => console.error("redis error:", e.message));
await redis.connect();

/** Only for completion/complete: autocomplete is the easiest way to enumerate names one letter at a time. */
export async function limitCompletions(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.body?.method !== "completion/complete") return next();
  const who = principal(req.auth);
  const window = Math.floor(Date.now() / 60_000);
  const key = `rl:complete:${who.sub}:${window}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 120);
  if (n > config.completionsPerMinute) {
    const retry = 60 - (Math.floor(Date.now() / 1000) % 60);
    res.set("Retry-After", String(retry));
    return res.status(429).json({ jsonrpc: "2.0", id: req.body?.id ?? null, error: { code: -32000, message: `Too many autocomplete requests. Try again in ${retry} s.` } });
  }
  next();
}
