// Step 02: resource templates. The client writes the name in the URL; the token decides what it may see.
import { describe, expect, test } from "vitest";
import { asApp, contentOf, mcp, token, type LabUser } from "./helpers.js";

const grades = (s: string) => `campus://students/${s}/grades`;
const syllabus = (c: string) => `campus://courses/${c}/syllabus`;
const read = async (user: LabUser, uri: string) => mcp(await token(user), "resources/read", { uri });
const list = async (user: LabUser) =>
  ((await mcp(await token(user), "resources/list")).body.result.resources as { uri: string }[]).map((r) => r.uri).sort();
const notFound = (r: { body: any }) => {
  expect(r.body.error, JSON.stringify(r.body)).toBeDefined();
  expect(r.body.result).toBeUndefined();
  return r.body.error as { code: number; message: string };
};

describe("Step 02: the grades template (attack C1)", () => {
  test("Sara reads her own grades: only PUBLISHED ones (her MATH201 grade is still a draft)", async () => {
    const g = contentOf(await read("sara", grades("sara"))).grades;
    expect(g).toEqual([{ course: "CS101", assignment: "Essay: Why recursion matters", score: 15.5, feedback: "Clear structure, good examples.", status: "published" }]);
  });

  test("C1: Sara changes the URL to Bilal → not found, exactly like a name that doesn't exist", async () => {
    const stolen = notFound(await read("sara", grades("bilal")));
    const invented = notFound(await read("sara", grades("nobody")));
    expect(stolen.code).toBe(invented.code);
    expect(stolen.message.replace("bilal", "X")).toBe(invented.message.replace("nobody", "X"));
  });

  test("Prof. Tom reads Sara's grades → only CS101 (he doesn't teach her MATH201)", async () => {
    const g = contentOf(await read("tom", grades("sara"))).grades;
    expect(g.map((x: { course: string }) => x.course)).toEqual(["CS101"]);
  });

  test("Prof. Lina sees Sara's MATH201 grade even as a draft (she's its teacher)", async () => {
    const g = contentOf(await read("lina", grades("sara"))).grades;
    expect(g).toEqual([expect.objectContaining({ course: "MATH201", status: "draft", score: 17 })]);
  });

  test("Prof. Lina reads Bilal's grades → not found (Bilal isn't in her course)", async () => {
    notFound(await read("lina", grades("bilal")));
  });

  test("odd names are refused before any query: ../, uppercase, SQL", async () => {
    for (const s of ["..%2Fbilal", "BILAL", "bilal' OR '1'='1"]) notFound(await read("tom", grades(encodeURIComponent(s))));
  });
});

describe("Step 02: the syllabus template", () => {
  test("Sara reads the MATH201 syllabus: a real PDF", async () => {
    const r = await read("sara", syllabus("MATH201"));
    const c = r.body.result.contents[0];
    expect(c.mimeType).toBe("application/pdf");
    expect(Buffer.from(c.blob, "base64").subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("Bilal reads the MATH201 syllabus → not found (not enrolled)", async () => {
    notFound(await read("bilal", syllabus("MATH201")));
  });

  test("Prof. Tom reads MATH201 (not his) → not found; a made-up path → not found", async () => {
    notFound(await read("tom", syllabus("MATH201")));
    notFound(await read("tom", syllabus("..%2F..%2Fsubmissions%2Fx")));
  });
});

describe("Step 02: resources/list shows only what you may read (attack C2)", () => {
  test("Sara: her own grade sheet and her 2 syllabi, nothing else", async () => {
    expect(await list("sara")).toEqual([
      "campus://catalog",
      syllabus("CS101"),
      syllabus("MATH201"),
      "campus://me/timetable",
      grades("sara"),
    ].sort());
  });

  test("Bilal: no MATH201, nobody else's grades", async () => {
    expect(await list("bilal")).toEqual(["campus://catalog", syllabus("CS101"), "campus://me/timetable", grades("bilal")].sort());
  });

  test("Prof. Tom: the CS101 students only (Bilal, Mallory, Sara), never MATH201", async () => {
    expect(await list("tom")).toEqual([
      "campus://catalog",
      syllabus("CS101"),
      "campus://me/timetable",
      grades("bilal"),
      grades("mallory"),
      grades("sara"),
    ].sort());
  });
});

describe("Step 02: a link is not a key (attack C14)", () => {
  test("a resource link pointing at Bilal's grades, followed by Sara, is refused like any read", async () => {
    // a tool result could contain { type: "resource_link", uri: "campus://students/bilal/grades" }:
    // following it is just another resources/read, so it meets the same check
    const link = { type: "resource_link", uri: grades("bilal") };
    notFound(await read("sara", link.uri));
  });
});

describe("Step 02: wall 2, row-level security inside Postgres", () => {
  async function asUser(user: string | null, sql: string) {
    const db = asApp();
    await db.connect();
    try {
      await db.query("BEGIN");
      if (user) await db.query("SELECT set_config('app.user_id', $1, true)", [user]);
      return (await db.query(sql)).rows;
    } finally {
      await db.query("ROLLBACK");
      await db.end();
    }
  }

  test("no user set → zero grades, submissions, enrollments (fails closed)", async () => {
    expect(await asUser(null, "SELECT count(*)::int AS n FROM grades")).toEqual([{ n: 0 }]);
    expect(await asUser(null, "SELECT count(*)::int AS n FROM submissions")).toEqual([{ n: 0 }]);
    expect(await asUser(null, "SELECT count(*)::int AS n FROM enrollments")).toEqual([{ n: 0 }]);
  });

  test("a buggy query with no WHERE, as Sara → still only her own published grade", async () => {
    expect(await asUser("sara", "SELECT score::float AS score FROM grades")).toEqual([{ score: 15.5 }]);
  });

  test("as Prof. Lina, writing a grade in CS101 (not her course) → refused by the database", async () => {
    await expect(
      asUser("lina", "INSERT INTO grades (submission_id, score, status, graded_by) VALUES ('50000000-0000-4000-8000-000000000003', 20, 'published', 'lina')"),
    ).rejects.toThrow(/row-level security/);
  });
});
