// ONE place decides what may be cached by shared caches. Both the MCP result (cacheScope, ttlMs)
// and the HTTP header (Cache-Control) are derived from it, so they can never disagree.
//
// "public" means public for real: a shared cache may hand it to ANYONE, even to a request with no token,
// without asking the server. Only data that is identical for every user and not secret belongs here.
import type { CacheHint } from "@modelcontextprotocol/server";

const PUBLIC_RESOURCES: Record<string, number> = {
  "campus://catalog": 60 * 60 * 1000, // 1 hour: the course catalog is the same for everyone
};

export function hintFor(uri: string): CacheHint {
  const ttl = PUBLIC_RESOURCES[uri];
  return ttl ? { cacheScope: "public", ttlMs: ttl } : { cacheScope: "private", ttlMs: 0 };
}

/** The HTTP header for one MCP request body. Anything that isn't a read of a public resource: no shared caching. */
export function cacheControlFor(body: unknown): { cacheControl: string; vary?: string } {
  const b = body as { method?: string; params?: { uri?: unknown } } | undefined;
  const uri = b?.method === "resources/read" && typeof b.params?.uri === "string" ? b.params.uri : undefined;
  const ttl = uri ? PUBLIC_RESOURCES[uri] : undefined;
  if (ttl) return { cacheControl: `public, max-age=${ttl / 1000}` };
  return { cacheControl: "private, no-store", vary: "Authorization" };
}
