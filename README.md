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
npm test          # steps 00–01: 30 checks
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
| 02 | Resource templates and ownership (C1, C2, C14) | next |

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
