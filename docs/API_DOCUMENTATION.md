# TaskForge — API Specification & Architecture Reference

This document provides complete technical documentation for the modules maintained by **Bekam Yoseph**:
- **Authentication & User Lifecycle** (`/api/auth`)
- **Profiles & Skills** (`/api/profiles`)
- **Projects & Milestones** (`/api/projects`)
- **Security Integration, Session Invalidation & IDOR Protections**

---

## 1. Authentication & Security Architecture

### Token Strategy
- **Access Tokens**: Short-lived JWTs (15m expiry) containing the claims `{ id, email, role, sessionId }`. Passed in the HTTP `Authorization: Bearer <token>` header. The `sessionId` claim must match an unrevoked `AuthSession` row, so banned or logged-out tokens stop working immediately.
- **Refresh Tokens**: Cryptographically secure random tokens stored hashed (`SHA-256`) in PostgreSQL `AuthSession` (looked up by an indexed digest). Passed via an HTTP-only, `SameSite=strict` cookie (`taskforge_refresh_token`, scoped to `/api/auth`) or a JSON body. Refresh **rotates**: the presented token is revoked and a new pair is issued.
- **Session Revocation**: Every session row contains `revokedAt`. Authenticated routes verify both that `user.accountStatus === "ACTIVE"` and `session.revokedAt === null`.

### Password Policy (enforced on register & reset-password)
- **Length**: 8–128 characters.
- **No account data**: must not be, or contain, the account email address (its local part is checked when ≥3 characters).
- **Not the current password**: on reset, re-using the password you currently sign in with is rejected.
- **Breach screening**: candidates are checked against known breach corpora through the Have I Been Pwned k-anonymity range API — only a 5-character SHA-1 prefix ever leaves the server. Matches are rejected with `400`. The check fails open (and is logged) when the API is unreachable, so authentication availability never depends on a third party.

### Security Headers
Every response carries Helmet's hardening headers: `Content-Security-Policy` (same-origin resources only, `frame-ancestors 'none'`, `script-src 'self'`, inline event handlers blocked), `Referrer-Policy: no-referrer` (keeps `#token=` fragments out of Referer headers), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, and `Strict-Transport-Security` (production).

### Rate Limits
| Scope | Limit |
|---|---|
| Global (all routes) | 100 requests / 15 min / IP |
| `/api/auth/*` | 20 requests / 15 min / IP |
| `POST /api/auth/forgot-password` | 5 requests / 15 min / IP |

### Global Error Response Format
All endpoints return a uniform error structure (flat `message` — there is no nested `error` object):
```json
{
  "success": false,
  "message": "Error description message"
}
```
Zod validation failures add field-level details:
```json
{
  "success": false,
  "message": "Validation Error",
  "errors": [
    { "path": "password", "message": "Password must be at least 8 characters" }
  ]
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
    "password": "Str0ng&Vivid-Kite-2026!",
    "fullName": "Jane Doe",
    "role": "FREELANCER"
  }
  ```
- **Response** (`201 Created`): Returns user entity, `token`, and `refreshToken`.
> **Password policy**: 8–128 characters, must not contain your email, and is screened against known breach corpora — common passwords like `Password123!` are rejected with `400`.

#### `POST /api/auth/login`
Authenticates credentials and establishes an active session.
- **Access**: Public
- **Request Body**: `{ "email": "user@example.com", "password": "Str0ng&Vivid-Kite-2026!" }`
- **Response** (`200 OK`): Returns user data, `accessToken`, and `refreshToken`.

#### `POST /api/auth/refresh`
Rotates the refresh token and issues a new access token.
- **Access**: Public (valid refresh cookie or body payload required)

#### `POST /api/auth/logout`
Revokes current session (`revokedAt = now()`) and clears refresh cookie.
- **Access**: Public / Authenticated

#### `POST /api/auth/logout/all`
Revokes **every** active session for the authenticated user across all devices and clears the refresh cookie.
- **Access**: Authenticated (`Bearer <token>`)

#### `GET /api/auth/me`
Retrieves authenticated user profile and account details.
- **Access**: Authenticated (`Bearer <token>`)

#### `POST /api/auth/forgot-password`
Requests a password-reset link. **Always** returns the same generic `200` response whether or not the account exists (anti-enumeration: identical status, body, *and* response timing). The emailed link carries the token in the URL fragment (`/reset-password#token=…`), so the token never appears in server or proxy logs.
- **Access**: Public — rate-limited to 5 requests / 15 min / IP
- **Request Body**: `{ "email": "user@example.com" }`
- **Response** (`200 OK`): `{ "success": true, "message": "If an account with that email exists, a password reset link has been sent." }`

#### `POST /api/auth/reset-password`
Sets a new password using a valid, unexpired (15 minutes), single-use token. On success, all sessions are revoked — the user must sign in again with the new password.
- **Access**: Public
- **Request Body**: `{ "token": "<token from the email link>", "newPassword": "Str0ng&Vivid-Kite-2026!" }`
- **Response** (`200 OK`): success message. `400` for invalid, expired, or already-used tokens, or for password-policy rejections (see §1 Password Policy).

#### `PATCH /api/auth/users/:id/status` (Admin Moderation & Logout-All)
Updates user status. If set to `SUSPENDED` or `DEACTIVATED`, atomically invalidates all active sessions for that user across all devices.
- **Access**: Restricted (`Role.ADMIN`)
- **Request Body**: `{ "status": "SUSPENDED" }`
- **Response** (`200 OK`): Returns updated status and `revokedSessionsCount`.

### 2.2 Profiles Module (`/api/profiles`)

#### `GET /api/profiles/me`
Fetches the profile and skill set of the authenticated user.
- **Access**: Authenticated

#### `PATCH /api/profiles/me`
Updates profile details (fullName, bio, headline, location, portfolioUrl, experienceYears). Optional fields can be set to `null` to clear them.
- **Access**: Authenticated

#### `PUT /api/profiles/me/skills`
Replaces the user's skill set with the provided array of skill names (upserts skills globally and connects to the user). Empty array `[]` clears all skills.
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

#### `PATCH /api/projects/:id`
Updates project metadata (e.g. `title`).
- **Access**: Authenticated (`CLIENT` owner or `ADMIN`)
- **Request Body**: `{ "title": "Updated Project Title" }`
- **Authorization**: Freelancers or non-owners receive `403 Forbidden`; non-participants receive `404 Not Found`.

#### `PATCH /api/projects/:id/status`
Updates project lifecycle status.
- **Access**: Authenticated (`CLIENT` owner or `ADMIN`)
- **Request Body**: `{ "status": "COMPLETED" }`
- **Authorization**: Freelancers or non-owners attempting to update status receive `403 Forbidden`.

---

### 2.4 Applications Module (`/api/applications`)

#### `POST /api/applications`
Submits a job proposal/application for an open job posting.
- **Access**: Authenticated (`FREELANCER`)
- **Request Body**: `{ "jobId": "job-id", "coverLetter": "Detailed cover letter...", "proposedBid": 1200, "estimatedDays": 14, "resumeUrl": "https://...", "attachmentUrls": ["https://..."] }`
- **Rules**: Rejects duplicate applications for the same job (`409 Conflict`) and prevents job owners from applying to their own postings (`403 Forbidden`). Proposals cannot be edited after submission — withdraw and re-apply to submit a new one.
- **File workflow**: `resumeUrl` and `attachmentUrls` are public URLs returned by the Uploads Module (`/api/uploads/*`). Files are uploaded to cloud storage first, then the application is submitted as plain JSON. Validated to `http(s)` URLs only, with at most **5 attachments**. External (non-bucket) links are allowed by default; set `STRICT_UPLOAD_URLS=true` to require every file URL to live in the project's own storage bucket (fails closed with `400` if storage is unconfigured).

#### `GET /api/applications`
Lists applications filtered by caller role and status.
- **Access**: Authenticated
- **Access Filtering**:
  - `FREELANCER`: Returns applications submitted by the caller.
  - `CLIENT`: Returns applications for jobs owned by the caller.
  - `ADMIN`: Returns all platform applications.
- **Query Params**: `?status=PENDING` (`PENDING`, `ACCEPTED`, `REJECTED`, `WITHDRAWN`), `?jobId=...`

#### `GET /api/applications/:id` (IDOR Protection)
Retrieves a single application.
- **Access**: Authenticated
- **IDOR Protection**: Returns `404 Not Found` if the caller is not the applicant freelancer, job owner client, or an admin.

#### `PATCH /api/applications/:id/withdraw`
Withdraws a pending application. The proposal is **removed from the system** (hard delete), freeing the applicant to re-apply to the same job later with a fresh proposal.
- **Access**: Authenticated (`FREELANCER` applicant or `ADMIN`)
- **Response**: `200` with the withdrawn snapshot (`status: "WITHDRAWN"`); a subsequent `GET` returns `404`.

#### `PATCH /api/applications/:id/reject`
Rejects a pending application.
- **Access**: Authenticated (`CLIENT` owner or `ADMIN`)

#### `PATCH /api/applications/:id/accept`
Accepts a pending application and creates a project contract.
- **Access**: Authenticated (`CLIENT` owner or `ADMIN`)
- **Atomic Transaction**:
  1. Sets application status to `ACCEPTED`.
  2. Sets all competing pending applications for the job to `REJECTED`.
  3. Transitions job status to `IN_PROGRESS`.
  4. Calls `ProjectService.createProjectFromApplication(...)` to instantiate the `Project` entity.

---

### 2.5 Uploads Module (`/api/uploads`)

Cloud file uploads (Supabase Storage) using `multipart/form-data`. Files are streamed into server memory by Multer (never written to local disk), validated with Zod, then uploaded to the configured Supabase bucket under a collision-proof `<folder>/<uuid><ext>` object path. The API returns a public URL that clients pass to `POST /api/applications` as `resumeUrl` / `attachmentUrls`.

- **Access**: All routes require authentication and the `FREELANCER` role.
- **Limits**: 5MB per file (Multer `LIMIT_FILE_SIZE` → `400`), max 5 attachments per request.
- **Errors**: wrong form-data field name → `400` (`LIMIT_UNEXPECTED_FILE`), missing file → `400`, disallowed MIME type → `400`, oversize → `400`.

#### `POST /api/uploads/resume`
Uploads a resume document to cloud storage.
- **Content-Type**: `multipart/form-data` — form-data field `resume` (File)
- **Accepted types**: `application/pdf`, `application/msword`, DOCX (`...wordprocessingml.document`)
- **Response (201)**: `{ "fileName", "fileSize", "mimetype", "url", "objectPath" }`

#### `POST /api/uploads/attachments`
Uploads portfolio links, case studies, or design previews (up to 5 files).
- **Content-Type**: `multipart/form-data` — form-data field `attachments` (File, repeatable)
- **Accepted types**: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`
- **Response (201)**: `{ "files": [{ "fileName", "fileSize", "mimetype", "url", "objectPath" }] }`

**Configuration**: requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (backend-only secret), and `SUPABASE_STORAGE_BUCKET` (default `taskforge-assets`, public bucket). If unset, upload routes fail with a clear `500` stating uploads are not configured.

**Orphan cleanup**: withdrawn applications are hard-deleted, which can leave their uploaded files unreferenced. Run `npm run cleanup:orphans` to sweep the bucket — it is a **dry-run by default** (pass `--prune` to delete) and honours a 24h grace period (`--grace-hours=N`) so in-flight uploads and quick re-applications are never destroyed. Only objects no application row references are eligible.

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
- `tests/e2e/applications.test.ts`:
  - Proposal submission, duplicate application rejection, and owner application prevention.
  - Role-scoped application listing.
  - Application withdrawal.
  - Atomic acceptance workflow & automatic `Project` contract creation.

Run all tests:
```bash
npm test
```
