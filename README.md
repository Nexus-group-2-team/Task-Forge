# TaskForge — Freelance Marketplace Backend API

RESTful backend for a freelance marketplace connecting **clients** who need work done with **freelancers** who provide professional skills. Built with Node.js, Express, TypeScript, PostgreSQL, and Prisma.

## Overview

TaskForge manages identity, profiles, skills, jobs, applications, projects, milestones, reviews, and abuse reports through secure, validated, documented APIs.

### Roles

| Role | Purpose |
|---|---|
| CLIENT | Publishes work, reviews applications, hires, manages projects, reviews freelancers |
| FREELANCER | Manages profile/skills, browses jobs, applies, completes work |
| ADMIN | Moderates users/content, resolves reports, manages global skills |

## Tech Stack

- **Node.js + Express + TypeScript**
- **PostgreSQL + Prisma ORM** (schema, migrations, seed)
- **JWT** authentication, **bcrypt** password hashing
- **Zod** runtime validation
- **Vitest / Supertest** automated tests

## Architecture

```
src/
├── app.ts            # Express app wiring
├── server.ts         # HTTP listener + graceful shutdown
├── config/           # Environment configuration
├── routes/           # HTTP method/path mapping
├── controllers/      # HTTP in → service calls
├── services/         # Business rules & transactions
├── middleware/       # Auth, roles, validation, errors
├── modules/          # Domain modules (auth, jobs, profiles, etc.)
├── validators/       # Zod schemas
├── utils/            # Shared helpers
├── errors/           # Typed HTTP errors
└── types/            # Shared TypeScript types
prisma/
├── schema.prisma     # Data model
├── migrations/       # SQL migrations
└── seed.ts           # Reproducible seed
```

Request lifecycle: HTTP → middleware → validation → route → controller → service → Prisma/PostgreSQL → centralized error handler.

## Database Schema

The data model (`prisma/schema.prisma`) covers the full marketplace domain:

| Model | Purpose |
|---|---|
| `User` | Account, role (CLIENT / FREELANCER / ADMIN), status, auth |
| `Profile` | Full name, bio, headline, portfolio, experience |
| `Skill` / `UserSkill` / `JobSkill` | Shared skill catalogue, linked to users and jobs |
| `Job` | Work posted by clients: title, description, budget range, deadline, status |
| `Application` | Freelancer bid on a job (cover letter + proposed bid), one per job per freelancer |
| `Project` | Created automatically when an application is accepted; links client + freelancer |
| `Milestone` | Trackable deliverables inside a project |
| `Reviews` | Bidirectional ratings on completed projects, one per reviewer per project |
| `Report` | Abuse reports with an admin moderation workflow |

Business rules enforced by the schema and services:

- Unique email; one application per (job, freelancer); one review per (project, reviewer)
- Cascade deletes: removing a user/job/project cleans up all dependent rows
- Indexed lookup paths: email, status, budget range, foreign keys
- Status enums for every lifecycle: `JobStatus`, `ApplicationStatus`, `ProjectStatus`, `MilestoneStatus`, `ReportStatus`, `AccountStatus`

Seed data (`npm run seed`) creates one admin, one client, one freelancer and six starter skills. See `.env.example` for required environment variables.

## Setup (clean clone)

```bash
npm install
npx prisma generate
npx prisma migrate dev        # applies migrations to a fresh database
npm run seed
npm run dev                   # start in watch mode
```

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Development server (watch mode) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run typecheck` / `npm run lint` | Type-check |
| `npm test` | Run Jest test suite |
| `npm run prisma:migrate` | Create/apply a migration |
| `npm run seed` | Seed the database |

## API Scope

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Profiles | `GET/PATCH /api/profile`, `POST /api/profile/skills`, `DELETE /api/profile/skills/:skillId`, `GET /api/users/:userId/profile` |
| Skills | `GET /api/skills`, `POST /api/skills` |
| Jobs | `POST /api/jobs`, `GET /api/jobs`, `GET/PATCH/DELETE /api/jobs/:id` |
| Applications | `POST /api/applications`, `GET /api/applications`, `GET/PATCH/DELETE /api/applications/:id` |
| Projects | `GET /api/projects`, `GET/PATCH /api/projects/:id` |
| Milestones | `POST /api/projects/:id/milestones`, `PATCH/DELETE /api/projects/milestones/:milestoneId` |
| Reviews | `GET/POST /api/projects/:id/reviews` |
| Reports | `POST /api/projects/reports`, `GET/PATCH /api/projects/reports/:id` (admin) |
| Health | `GET /api/health` |

Query conventions: `?page=1&limit=20` (bounded), `?search=`, `?status=`, `?skillId=`, `?minBudget=`, `?maxBudget=`, sorting via an allow-list of fields.

## Testing

```bash
npm test
```

20 integration tests across 5 suites (health, auth, profiles & skills, jobs & applications, full project lifecycle). Tests run against the real PostgreSQL database, exercising register → login → post job → apply → accept → milestone → complete → review → report → admin resolve end to end.

## Error Shape

```json
{
  "success": false,
  "error": { "message": "…", "statusCode": 400, "details": {} }
}
```

## Known Limitations / Future Features

Payments/escrow, real-time messaging, notifications, file uploads, OAuth, analytics — intentionally out of MVP scope.

## Team

Group 2 — Bekam Yoseph, Beka Solomon, Hermela Kassahun, Elyas Demamu.
