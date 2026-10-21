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

## Status

Step 00 (lab and data model) is next. See the build guide for the 12 steps and 14 attacks (C1–C14).

> This repository is public: secrets live only in `.env` / `.env.test`, which are git-ignored.
