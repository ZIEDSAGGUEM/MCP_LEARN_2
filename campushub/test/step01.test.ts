// Step 01: the first MCP resources. One is public (the catalog), one is private (my timetable).
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { contentOf, mcp, token } from "./helpers.js";

const CATALOG = "campus://catalog";
const TIMETABLE = "campus://me/timetable";
const GOOD_CACHE = "http://127.0.0.1:4103/mcp";
const BROKEN_CACHE = "http://127.0.0.1:4104/mcp";
const read = (user: Parameters<typeof token>[0], uri: string, url?: string, run?: string) =>
  token(user).then((t) => mcp(t, "resources/read", { uri }, { url, headers: run ? { "x-lab-run": run } : {} }));

describe("Step 01: resources exist and need a token", () => {
  test("resources/list shows the catalog and my timetable, and the list itself is private", async () => {
    const r = await mcp(await token("sara"), "resources/list");
    expect(r.body.result.resources.map((x: { uri: string }) => x.uri).sort()).toEqual([CATALOG, TIMETABLE]);
    expect(r.body.result.cacheScope).toBe("private");
  });

  test("no token → 401, even for the public catalog", async () => {
    const r = await mcp(undefined, "resources/read", { uri: CATALOG });
    expect(r.status).toBe(401);
  });

  test("an unknown resource is an error, not an empty answer", async () => {
    const r = await mcp(await token("sara"), "resources/read", { uri: "campus://nope" });
    expect(r.body.error?.code).toBeDefined();
  });

  test("no sessions: reads are answered by both pods", async () => {
    const pods = new Set<string>();
    for (let i = 0; i < 8; i++) pods.add(String((await read("sara", CATALOG)).headers.get("x-upstream")));
    expect(pods.size).toBe(2);
  });
});

describe("Step 01: the catalog is public, and only public data is in it", () => {
  test("the same courses for everyone, with no teacher notes", async () => {
    const sara = contentOf(await read("sara", CATALOG));
    const tom = contentOf(await read("tom", CATALOG));
    expect(sara).toEqual(tom);
    expect(sara.courses.map((c: { code: string }) => c.code)).toEqual(["CS101", "MATH201"]);
    expect(JSON.stringify(sara)).not.toMatch(/teacher_notes|recursion in week 3|curve/);
  });

  test("cacheScope public + ttl 1 h, and the HTTP header says exactly the same", async () => {
    const r = await read("sara", CATALOG);
    expect(r.body.result).toMatchObject({ cacheScope: "public", ttlMs: 3_600_000 });
    expect(r.headers.get("cache-control")).toBe("public, max-age=3600");
  });
});

describe("Step 01: my timetable is private", () => {
  test("each user gets their own: Sara 2 courses, Bilal 1, Prof. Tom his CS101", async () => {
    expect(contentOf(await read("sara", TIMETABLE)).courses.map((c: { code: string }) => c.code)).toEqual(["CS101", "MATH201"]);
    expect(contentOf(await read("bilal", TIMETABLE)).courses.map((c: { code: string }) => c.code)).toEqual(["CS101"]);
    const tom = contentOf(await read("tom", TIMETABLE));
    expect(tom).toMatchObject({ role: "teacher", courses: [{ code: "CS101" }] });
  });

  test("cacheScope private, and HTTP says private, no-store + Vary: Authorization", async () => {
    const r = await read("sara", TIMETABLE);
    expect(r.body.result).toMatchObject({ cacheScope: "private", ttlMs: 0 });
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("vary")).toBe("Authorization");
  });
});

describe("Step 01: a shared cache in front of CampusHub (attack C3)", () => {
  test("a cache that obeys the headers keeps the catalog: the 2nd read is a HIT", async () => {
    const run = randomUUID();
    expect((await read("sara", CATALOG, GOOD_CACHE, run)).headers.get("x-cache-status")).toBe("MISS");
    const second = await read("bilal", CATALOG, GOOD_CACHE, run);
    expect(second.headers.get("x-cache-status")).toBe("HIT");
    expect(contentOf(second).courses).toHaveLength(2);
  });

  test("…and never keeps a timetable: Bilal gets his own, not Sara's", async () => {
    const run = randomUUID();
    await read("sara", TIMETABLE, GOOD_CACHE, run);
    const bilal = await read("bilal", TIMETABLE, GOOD_CACHE, run);
    expect(bilal.headers.get("x-cache-status")).not.toBe("HIT");
    expect(contentOf(bilal).for).toBe("Bilal Haddad");
  });

  test("LAB, the leak: a cache that ignores the headers serves Sara's timetable to Bilal", async () => {
    const run = randomUUID();
    await read("sara", TIMETABLE, BROKEN_CACHE, run);
    const bilal = await read("bilal", TIMETABLE, BROKEN_CACHE, run);
    expect(bilal.headers.get("x-cache-status")).toBe("HIT");
    expect(contentOf(bilal).for).toBe("Sara Ben Ali"); // C3: what a misconfigured CDN does
  });

  test("'public' really means public: a cached catalog is served even WITHOUT a token", async () => {
    const run = randomUUID();
    await read("sara", CATALOG, GOOD_CACHE, run);
    const anonymous = await mcp(undefined, "resources/read", { uri: CATALOG }, { url: GOOD_CACHE, headers: { "x-lab-run": run } });
    // The cache answers without asking CampusHub, so the token check never runs.
    // That's acceptable ONLY because the catalog is truly public. Never mark anything else public.
    expect(anonymous.headers.get("x-cache-status")).toBe("HIT");
    expect(anonymous.status).toBe(200);
  });
});
