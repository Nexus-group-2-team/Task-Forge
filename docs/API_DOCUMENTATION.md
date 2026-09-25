# TaskForge — API Specification & Architecture Reference

This document provides complete technical documentation for the modules maintained by **Bekam Yoseph**:
- **Authentication & User Lifecycle** (`/api/auth`)
- **Profiles & Skills** (`/api/profiles`)
- **Projects & Milestones** (`/api/projects`)
- **Security Integration, Session Invalidation & IDOR Protections**

---

## 1. Authentication & Security Architecture

### Token Strategy
- **Access Tokens**: Short-lived JWTs (15m expiry) containing `{ userId, email, role, sessionId }`. Passed in the HTTP `Authorization: Bearer <token>` header.
- **Refresh Tokens**: Cryptographically secure random tokens stored hashed (`SHA-256`) in PostgreSQL `AuthSession`. Passed via HTTP-only cookie (`refreshToken`) or JSON body.
- **Session Revocation**: Every session row contains `revokedAt`. Authenticated routes verify both that `user.accountStatus === "ACTIVE"` and `session.revokedAt === null`.

### Global Error Response Format
All endpoints return a uniform error structure:
```json
{
  "success": false,
  "error": {
    "message": "Error description message",
    "statusCode": 401,
    "details": {}
  }
}
```

---

## 2. API Endpoints Reference

### 2.1 Authentication Module (`/api/auth`)

#### `POST /api/auth/register`
Creates an account and returns an access token with a refresh cookie.
- **Access**: Public
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "Password123!",
    "fullName": "Jane Doe",
    "role": "FREELANCER"
  }
  ```
- **Response** (`201 Created`): Returns user entity, `token`, and `refreshToken`.

#### `POST /api/auth/login`
Authenticates credentials and establishes an active session.
- **Access**: Public
- **Request Body**: `{ "email": "user@example.com", "password": "Password123!" }`
- **Response** (`200 OK`): Returns user data, `accessToken`, and `refreshToken`.

#### `POST /api/auth/refresh`
Rotates the refresh token and issues a new access token.
- **Access**: Public (valid refresh cookie or body payload required)

#### `POST /api/auth/logout`
Revokes current session (`revokedAt = now()`) and clears refresh cookie.
- **Access**: Public / Authenticated

#### `GET /api/auth/me`
Retrieves authenticated user profile and account details.
- **Access**: Authenticated (`Bearer <token>`)

#### `PATCH /api/auth/users/:id/status` (Admin Moderation & Logout-All)
Updates user status. If set to `SUSPENDED` or `DEACTIVATED`, atomically invalidates all active sessions for that user across all devices.
- **Access**: Restricted (`Role.ADMIN`)

### 2.2 Profiles Module (`/api/profiles`)

#### `GET /api/profiles/me`
Fetches the profile and skill set of the authenticated user.
- **Access**: Authenticated

#### `PATCH /api/profiles/me`
Updates profile details (fullName, bio, headline, location, portfolioUrl, experienceYears).
- **Access**: Authenticated

#### `PUT /api/profiles/me/skills`
Replaces the user's skill set with the provided array of skill names (upserts skills globally and connects to the user).
- **Access**: Authenticated
- **Request Body**: `{ "skills": ["TypeScript", "Node.js", "PostgreSQL"] }`

#### `GET /api/profiles/freelancers`
Lists all active freelancers with search filtering across name, bio, and skills.
- **Access**: Public
- **Query Params**: `?search=typescript`

#### `GET /api/profiles/:userId` (Privacy Enforcement)
Retrieves public profile information.
- **Access**: Public / Optional Authenticated
- **Privacy Enforcement**:
  - Unauthenticated visitors or third parties: `email` and `accountStatus` are withheld.
  - Profile owner or Admin: full metadata (including `email` and `accountStatus`) is returned.

---

### 2.3 Projects Module (`/api/projects`)

#### `GET /api/projects`
Lists projects relevant to the caller.
- **Access**: Authenticated
- **Access Filtering**:
  - `CLIENT`: Returns projects where caller is `clientId`.
  - `FREELANCER`: Returns projects where caller is `freelancerId`.
  - `ADMIN`: Returns all projects platform-wide.
- **Query Params**: `?status=ACTIVE` (`ACTIVE`, `COMPLETED`, `CANCELLED`)

#### `GET /api/projects/:id` (IDOR Protection)
Fetches a single project with participants, milestones, and reviews.
- **Access**: Authenticated
- **IDOR Protection**: If the caller is not the `clientId`, `freelancerId`, or `ADMIN`, the API returns `404 Not Found` (preventing resource enumeration attacks).

#### `PATCH /api/projects/:id/status`
Updates project lifecycle status.
- **Access**: Authenticated (`CLIENT` owner or `ADMIN`)
- **Request Body**: `{ "status": "COMPLETED" }`
- **Authorization**: Freelancers or non-owners attempting to update status receive `403 Forbidden`.

---

## 3. Automated Contract Testing Suite

The test suite runs against PostgreSQL (Neon) using Vitest and Supertest:
- `tests/e2e/auth.test.ts`:
  - Registration, login, and Zod input validation.
  - Profile retrieval, profile updates, and skills management.
  - Refresh token rotation, cookie handling, and logout.
  - IDOR & privacy boundaries (unauthenticated email masking).
  - Admin suspension, atomic session invalidation ("logout-all"), immediate access token rejection, and refresh rejection across devices.
- `tests/e2e/projects.test.ts`:
  - User and project setup with dependencies (`Job`, `Application`).
  - Listing projects scoped to client and freelancer roles.
  - Query parameter status filtering.
  - IDOR isolation returning 404 for unauthorized users.
  - Role-based transition permissions (`403` for freelancer, `200` for client owner).

Run all tests:
```bash
npm test
```

- **Request Body**: `{ "status": "SUSPENDED" }`
- **Response** (`200 OK`): Returns updated status and `revokedSessionsCount`.
