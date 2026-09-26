# Individual Contribution Report — TaskForge Backend API

**Developer:** Bekam Yoseph  
**Role:** Backend & Security Engineer  
**Primary Ownership:** Authentication, User Lifecycle, Profiles, Projects, Core Security Middleware & Contract Testing  
**Tech Stack:** Node.js, Express, TypeScript, PostgreSQL, Prisma ORM, Argon2id, JWT, Zod, Helmet, Express-Rate-Limit, Vitest  

---

## Part 1 — My Contributions (What I Built)

### 1. Authentication & Session Management Module (`/api/auth`)
* **What it does:** Provides secure end-to-end user onboarding, password authentication, access token rotation, single-device logout, and multi-device session revocation (`logoutAll`).
* **Key Technologies Used:** Node.js, Express, TypeScript, Argon2id (`argon2`), JSON Web Tokens (`jsonwebtoken`), Prisma ORM, PostgreSQL.
* **Notable Design Decisions & Challenges Solved:** 
  - **Dual-Token Architecture with Hashed Refresh Tokens:** Designed a secure token lifecycle pairing short-lived access JWTs with 40-byte cryptographically random opaque refresh tokens. Refresh tokens are stored in the database as SHA-256 digests (`hashRefreshToken`), preventing token hijack in case of database leaks.
  - **Argon2id Password Security:** Selected Argon2id over legacy bcrypt for superior resistance against GPU/ASIC hardware brute-force attacks.
  - **Session Revocation (`logoutAll`):** Implemented multi-device session revocation capable of invalidating all active `AuthSession` DB records simultaneously upon user request, password change, or admin account suspension.

---

### 2. User Lifecycle & Profile Management Module (`/api/profiles`)
* **What it does:** Enables freelancers and clients to retrieve and update personal profile details (bio, headline, portfolio URL, experience), manage skill tags, search active freelancers, and view public vs. private profile views.
* **Key Technologies Used:** Express, TypeScript, Zod, Prisma ORM, PostgreSQL.
* **Notable Design Decisions & Challenges Solved:**
  - **Privacy-Aware Data Projection:** Designed conditional field selection in `ProfileService.getProfileByUserId` to automatically obscure sensitive account details (e.g., email address, account status) from public viewers while exposing them exclusively to profile owners and administrators.
  - **Atomic Skill Synchronization:** Built a relational upsert pipeline in `PUT /api/profiles/me/skills` that standardizes skill names to lowercase, links existing global skills, creates missing catalog entries, and replaces user-skill associations within a single operation.

---

### 3. Project Management & Lifecycle Module (`/api/projects`)
* **What it does:** Handles project state management (`ACTIVE`, `COMPLETED`, `CANCELLED`), allows participants (clients and freelancers) to query their active/past projects, and exposes project details including milestone progress and reviews.
* **Key Technologies Used:** Express, TypeScript, Zod, Prisma ORM, PostgreSQL.
* **Notable Design Decisions & Challenges Solved:**
  - **IDOR / BOLA Protection:** Implemented strict resource ownership authorization checks in `ProjectService.getProjectById`. Unauthorized users attempting to probe another user's project ID receive a `404 Not Found` response instead of `403 Forbidden`, preventing malicious resource enumeration attacks.
  - **Role-Gated State Transitions:** Restricted project state changes (`COMPLETED` / `CANCELLED`) to client owners or administrators only, enforcing business logic contracts.

---

### 4. Core Security Infrastructure & Middleware (`src/shared/middleware/`)
* **What it does:** Provides centralized request authentication (`authenticate`), role-based access control (`authorize`), security response headers (`helmet`), and IP-based rate limiting (`globalRateLimiter` & `authRateLimiter`).
* **Key Technologies Used:** Express, Helmet, Express-Rate-Limit, Zod.
* **Notable Design Decisions & Challenges Solved:**
  - **Defense-in-Depth Layering:** Integrated HTTP header hardening (`helmet()`), brute-force throttling (20 req/15 min on `/api/auth`), and input validation (`validate({ body: schema })`) at the global Express app level before requests hit business logic controllers.
  - **Test Environment Bypass:** Configured rate-limiter skip functions during automated test runs (`NODE_ENV === "test"`) to prevent false-positive `429 Too Many Requests` errors during high-throughput unit/E2E test runs.

---

## Part 2 — Integration Points (What Teammates Used From Me)

### 1. Authentication & Authorization Middleware (`authenticate` & `authorize`)
* **What was shared:** Centralized Express middleware functions (`src/shared/middleware/auth.middleware.ts`) and `req.user` context interface.
* **Who used it:** **Beka Solomon** (Jobs & Applications) and **Elyas Demamu** (Milestones, Reviews, Reports & Admin).
* **How it was consumed:** 
  - Beka Solomon wrapped all protected job endpoints (`POST /api/jobs`, `POST /api/jobs/:id/applications`) with `authenticate` and `authorize(Role.CLIENT)` / `authorize(Role.FREELANCER)` to extract `req.user.id`.
  - Elyas Demamu used `authenticate` across milestone management, review submissions, and admin moderation routes.

---

### 2. User & Project Data Models (`User`, `Profile`, `Project`, `AuthSession`)
* **What was shared:** Primary Prisma database schema models and TypeScript data interfaces.
* **Who used it:** **Beka Solomon** and **Elyas Demamu**.
* **How it was consumed:**
  - **Beka Solomon** linked `Job.ownerId` and `Application.freelancerId` directly to my `User` model, and initialized new `Project` records upon application acceptance.
  - **Elyas Demamu** built `Milestone` (`milestones.projectId -> Project.id`), `Reviews` (`reviews.projectId -> Project.id`), and `Report` (`reports.reporterId -> User.id`) tables on top of my primary keys.

---

### 3. User Suspension & Session Revocation API (`PATCH /api/auth/users/:id/status`)
* **What was shared:** Admin lifecycle endpoint and `AuthService.updateUserStatus` service method.
* **Who used it:** **Elyas Demamu** (Admin Moderation & Violation Reports module).
* **How it was consumed:**
  - When Elyas’s Admin module resolves a user policy violation report, it calls my `updateUserStatus` endpoint to set `accountStatus = SUSPENDED`, which automatically triggers a full `logoutAll` session invalidation across all user devices.

---

### 4. API Endpoints, OpenAPI Contracts & End-to-End Test Suite
* **What was shared:** 14 REST API endpoints, JSON request/response schemas, and Vitest contract test suite (`tests/e2e/auth.test.ts` & `tests/e2e/projects.test.ts`).
* **Who used it:** Frontend developers, API testing clients (Thunder Client / Postman), and team QA.
* **How it was consumed:**
  - Frontend developers called `/api/auth/register`, `/api/auth/login`, and `/api/auth/refresh` to establish user sessions, and `/api/profiles/me` / `/api/projects` to render client/freelancer dashboards.
