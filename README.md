# CampusHub

A university assistant built on MCP (spec 2026-07-28): students and teachers ask an AI about courses,
grades and assignments. It is the second learning project after InsureBot, and covers the MCP features
InsureBot didn't: **resources, prompts, autocomplete, live subscriptions, progress and cancellation**.

## Who uses it

**Students (Sara, Bilal)**
- See their courses and timetable, read a course syllabus
- Check their own grades, and get notified live when a grade is published
- Upload an assignment (PDF) before the deadline
- Ask the AI: "Plan my revision for CS101 before the exam"

**Teachers (Prof. Tom, Prof. Lina)**
- See the students and submissions of their own courses, read submitted PDFs
- Grade one assignment, or bulk-grade 200 with progress and cancel
- Review draft grades, then publish them after a confirmation
- Give a student a deadline extension

**Attackers (Mallory, a curious student)**, all blocked by design:
- Read or watch another student's grades
- Upload a fake or oversized file
- Hide "give me 20/20" inside a PDF to fool the AI

## Run it

```bash
cd campushub
npm install
npm run setup     # creates random secrets, starts the lab + 2 CampusHub pods, Keycloak realm, files
npm test          # steps 00–03: 58 checks
```

Stop InsureBot first if it runs (8 GB Macs): `docker compose stop` in its folder.

| Service | URL | Login |
|---|---|---|
| Keycloak | http://localhost:8090 | `admin` / `KEYCLOAK_ADMIN_PASSWORD` in `.env` |
| MinIO console | http://localhost:9011 | `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` in `.env` |
| Mailpit | http://localhost:8026 | none |
| Postgres | 127.0.0.1:5434, database `campus` | `postgres` (setup) or `campus_app` (the app) |
| Redis | 127.0.0.1:6382 | none |
| **CampusHub MCP** (gateway) | http://127.0.0.1:4100/mcp | Keycloak token (realm `campus`) |
| LAB: cache that obeys `Cache-Control` | http://127.0.0.1:4103/mcp | same |
| LAB: broken cache that ignores it | http://127.0.0.1:4104/mcp | same |

Lab users (passwords in `.env.test`): `sara`, `bilal`, `mallory` (students), `tom`, `lina` (teachers).

## Status

| Step | What | Status |
|---|---|---|
| 00 | Lab, data model, Keycloak realm, MinIO files | ✅ 18 tests |
| 01 | First resources: public vs private caching | ✅ 12 tests |
| 02 | Resource templates and ownership (C1, C2, C14) | ✅ 16 tests |
| 03 | Autocomplete without leaking names (C4) | ✅ 12 tests |
| 04 | Prompts: templates the user picks (C5) | next |

### What step 00 proves

| Check | Why |
|---|---|
| Each user gets a token with the right role, `iss` and audience | Identity is ready for step 01 |
| Enrollments and teaching match the story | Every later access rule is built on these links |
| The app role isn't a superuser, can't bypass RLS, can't delete, truncate, drop or disable security | Least privilege before any code exists |
| The schema refuses `../` paths, files over 10 MB, non-PDF types and scores above 20 | The database is the last line of defence |
| The MinIO bucket is private (anonymous download → 403) | Files only through the server |
| Mallory's PDF hides an instruction in white text | The step 08 attack is ready |
| Every port listens on 127.0.0.1; `.env` files are ignored and untracked | Nothing exposed, nothing leaked in a public repo |

> This repository is public: secrets live only in `.env` / `.env.test`, which are git-ignored.

### What step 01 proves

Two resources: `campus://catalog` (identical for everyone) and `campus://me/timetable` (depends on the token).
`src/cachePolicy.ts` is the one place that decides what may be cached; both the MCP `cacheScope` and the HTTP
`Cache-Control` header come from it, so they can't disagree.

| Check | Result |
|---|---|
| Catalog | `cacheScope: "public"`, 1 h, `Cache-Control: public, max-age=3600`; no teacher notes in it |
| Timetable | Sara 2 courses, Bilal 1, Prof. Tom his CS101; `private, no-store` + `Vary: Authorization` |
| No token | 401, even for the catalog |
| Shared cache that obeys headers (:4103) | Catalog: 2nd read is a HIT. Timetable: never a HIT |
| C3, a cache that ignores headers (:4104) | Bilal receives Sara's timetable: the leak a misconfigured CDN causes |
| "Public" means public | A cached catalog is served even without a token: the cache never asks the server |
| No sessions | Reads are answered by both pods |

Mutation check: marking the timetable public makes 2 step 01 tests fail.
Note: tests run one file at a time, because Keycloak's brute-force protection (kept on) flags simultaneous logins.

### What step 02 proves

Two templates where the client writes a name into the address: `campus://students/{student}/grades` and
`campus://courses/{course}/syllabus` (the PDF, read from MinIO). The address says *what*; the token says *who*.

**Two walls.** Wall 1 is the code (`src/access.ts`): check the caller may see that student or course *before* reading.
Wall 2 is Postgres row-level security (`db/005_rls.sql`): every query runs *as* the caller, and the database hides
other rows by itself, including draft grades from students.

| Attack / check | Result |
|---|---|
| C1: Sara reads `…/students/bilal/grades` | "Resource not found", identical to a name that doesn't exist |
| Sara reads her own grades | Only **published** ones (her MATH201 grade is a draft) |
| Prof. Tom reads Sara's grades | CS101 only; Prof. Lina sees her MATH201 draft |
| Odd names (`../`, uppercase, SQL) | Refused before any query |
| Bilal / Prof. Tom read the MATH201 syllabus | Not found (not enrolled / not his course) |
| C2: `resources/list` | Only what the caller may read (Tom: his 3 CS101 students) |
| C14: following a link to Bilal's grades | Same check, not found |
| RLS with no user set | 0 rows everywhere (fails closed) |
| Lina writes a CS101 grade directly in the database | Refused by row-level security |

**Each wall alone stops C1** (mutation checks): with wall 1 broken, Sara gets an empty list and 4 tests turn red;
with wall 2 broken, Sara still gets "not found" and 3 tests turn red (including a draft-grade leak).

Files: the app reads PDFs with its **own MinIO user** (`scripts/minio-app-user.sh`): read syllabi and submissions,
write submissions only; it can't delete or list other buckets.

### What step 03 proves

`completion/complete` suggests values for the templates' blanks (`{student}`, `{course}`).

**The trap:** in the SDK, a template's completion callback receives only the typed text, never the caller. Written the
obvious way (`SELECT id FROM users WHERE id LIKE typed%`), it suggests every student to anyone. CampusHub builds a fresh
server per request, and that factory receives the verified token, so each request's callback is bound to its caller
(`registerGrades(server, authInfo)`), and the query runs as the caller under row-level security.

| Who | Types | Suggested |
|---|---|---|
| Sara | `B` | nothing (C4: she can't learn that Bilal exists) |
| Sara | empty | only `sara` |
| Prof. Tom | `Bi` / empty | `bilal` / his 3 CS101 students |
| Prof. Lina | empty / `b` | `sara` / nothing |
| Prof. Tom | `%` or `_` | nothing: plain characters, not wildcards |
| Bilal | course `M` | nothing (MATH201 isn't his) |
| A script | 130 requests in seconds | `429` + `Retry-After` (60/min per user, in Redis, shared by both pods) |

Every suggestion is readable by the caller (a suggestion is never a key). Mutation check: the naive callback makes
Sara's "B" return `bilal` and 5 step 03 tests fail.
