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
npm run setup     # creates random secrets, starts the lab, creates the Keycloak realm and the files
npm test          # step 00: 18 checks
```

Stop InsureBot first if it runs (8 GB Macs): `docker compose stop` in its folder.

| Service | URL | Login |
|---|---|---|
| Keycloak | http://localhost:8090 | `admin` / `KEYCLOAK_ADMIN_PASSWORD` in `.env` |
| MinIO console | http://localhost:9011 | `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` in `.env` |
| Mailpit | http://localhost:8026 | none |
| Postgres | 127.0.0.1:5434, database `campus` | `postgres` (setup) or `campus_app` (the app) |
| Redis | 127.0.0.1:6382 | none |

Lab users (passwords in `.env.test`): `sara`, `bilal`, `mallory` (students), `tom`, `lina` (teachers).

## Status

| Step | What | Status |
|---|---|---|
| 00 | Lab, data model, Keycloak realm, MinIO files | ✅ 18 tests |
| 01 | First resources: public vs private caching | next |

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
