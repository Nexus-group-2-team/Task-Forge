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
- **Jest / Supertest** automated tests

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

## Environment Variables

Copy `.env.example` to `.env` and fill in real values (never commit real secrets):

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET`, `JWT_EXPIRES_IN`
- `PORT`, `NODE_ENV`, `CORS_ORIGIN`

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
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Profiles | `GET /api/users/:id`, `PATCH /api/users/me` |
| Skills | `GET /api/skills`, `POST/PATCH/DELETE /api/skills/:id` |
| Jobs | `POST /api/jobs`, `GET /api/jobs`, `GET/PATCH/DELETE /api/jobs/:id` |
| Applications | `POST /api/jobs/:jobId/applications`, `GET /api/jobs/:jobId/applications`, `PATCH /api/applications/:id` |
| Projects | `GET /api/projects`, `GET/PATCH /api/projects/:id` |
| Milestones | `POST /api/projects/:projectId/milestones`, `PATCH /api/milestones/:id` |
| Reviews | `POST /api/projects/:projectId/reviews`, `GET /api/users/:id/reviews` |
| Reports | `POST /api/reports`, `GET/PATCH /api/admin/reports/...` |
| Health | `GET /api/health` |

Query conventions: `?page=1&limit=20` (bounded), `?search=`, `?status=`, `?skillId=`, `?minBudget=`, `?maxBudget=`, sorting via an allow-list of fields.

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
