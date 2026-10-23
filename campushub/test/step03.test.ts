// Step 03: autocomplete (completion/complete) only ever suggests what the caller could read anyway.
import { describe, expect, test } from "vitest";
import { mcp, token, type LabUser } from "./helpers.js";

const STUDENTS = "campus://students/{student}/grades";
const COURSES = "campus://courses/{course}/syllabus";

async function complete(user: LabUser, uri: string, name: string, value: string) {
  return mcp(await token(user), "completion/complete", { ref: { type: "ref/resource", uri }, argument: { name, value } });
}
const values = async (user: LabUser, uri: string, name: string, value: string) =>
  (await complete(user, uri, name, value)).body.result.completion.values as string[];

describe("Step 03: suggesting students (attack C4)", () => {
  test("C4: Sara types 'B' → no suggestions (she can't read Bilal's grades, so she can't learn he exists)", async () => {
    expect(await values("sara", STUDENTS, "student", "B")).toEqual([]);
    expect(await values("sara", STUDENTS, "student", "m")).toEqual([]);
  });

  test("Sara with an empty box → only herself, never the whole list", async () => {
    expect(await values("sara", STUDENTS, "student", "")).toEqual(["sara"]);
  });

  test("Prof. Tom types 'Bi' → Bilal (he teaches him); empty → his 3 CS101 students", async () => {
    expect(await values("tom", STUDENTS, "student", "Bi")).toEqual(["bilal"]);
    expect(await values("tom", STUDENTS, "student", "")).toEqual(["bilal", "mallory", "sara"]);
  });

  test("Prof. Tom can type an ID or a first name (prefix match)", async () => {
    expect(await values("tom", STUDENTS, "student", "Mallory")).toEqual(["mallory"]);
    expect(await values("tom", STUDENTS, "student", "ha")).toEqual([]); // a family name in the middle doesn't match a prefix
  });

  test("Prof. Lina never sees CS101-only students (Bilal, Mallory)", async () => {
    expect(await values("lina", STUDENTS, "student", "")).toEqual(["sara"]);
    expect(await values("lina", STUDENTS, "student", "b")).toEqual([]);
  });

  test("% and _ are plain characters, not 'match everything'", async () => {
    expect(await values("tom", STUDENTS, "student", "%")).toEqual([]);
    expect(await values("tom", STUDENTS, "student", "_")).toEqual([]);
  });

  test("a suggestion is never a key: every suggested student can actually be read by the caller", async () => {
    for (const s of await values("tom", STUDENTS, "student", "")) {
      const r = await mcp(await token("tom"), "resources/read", { uri: `campus://students/${s}/grades` });
      expect(r.body.result, s).toBeDefined();
    }
  });
});

describe("Step 03: suggesting courses", () => {
  test("Sara: her 2 courses; Bilal typing 'M': nothing (MATH201 isn't his)", async () => {
    expect(await values("sara", COURSES, "course", "")).toEqual(["CS101", "MATH201"]);
    expect(await values("bilal", COURSES, "course", "M")).toEqual([]);
  });

  test("Prof. Lina: only the course she teaches", async () => {
    expect(await values("lina", COURSES, "course", "")).toEqual(["MATH201"]);
  });
});

describe("Step 03: a script guessing names letter by letter is slowed down", () => {
  test("130 autocomplete requests in a few seconds → 429 Too Many Requests with Retry-After", async () => {
    // 130 > 2 × 60, so the limit is hit even if the requests straddle two one-minute windows.
    // Mallory floods: no other test uses her for autocomplete, so the limit she hits can't break them.
    const t = await token("mallory");
    const statuses: number[] = [];
    for (let i = 0; i < 13; i++) {
      const batch = await Promise.all(
        Array.from({ length: 10 }, () =>
          mcp(t, "completion/complete", { ref: { type: "ref/resource", uri: STUDENTS }, argument: { name: "student", value: "a" } }),
        ),
      );
      statuses.push(...batch.map((r) => r.status));
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    const limited = await mcp(t, "completion/complete", { ref: { type: "ref/resource", uri: STUDENTS }, argument: { name: "student", value: "a" } });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  test("the limit is per user: Sara still gets her suggestion while Mallory is limited", async () => {
    expect(await values("sara", STUDENTS, "student", "")).toEqual(["sara"]);
  });

  test("reading resources isn't affected by the autocomplete limit", async () => {
    const r = await mcp(await token("mallory"), "resources/read", { uri: "campus://students/mallory/grades" });
    expect(r.status).toBe(200);
  });
});
