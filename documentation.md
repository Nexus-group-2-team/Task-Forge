# TaskForge — My Contribution

## 1. Project Overview

TaskForge is a project and task management platform designed to help teams organize projects, manage work, track progress, and collaborate through a centralized system.

The project includes backend modules such as authentication, projects, milestones, reviews, reports, jobs, and other supporting functionality.

My main contribution focused on:

- Milestones
- Reviews
- Reports
- Jobs

I also contributed to backend integration, authorization, error handling, testing, and final verification.

---

## 2. Milestones

The Milestones module allows a project to divide larger work into smaller, trackable stages.

### Main Features

- Create project milestones
- Add milestone titles and descriptions
- Set milestone due dates
- Track milestone status
- Associate milestones with projects

### Milestone Status

- `PENDING`
- `IN_PROGRESS`
- `COMPLETED`

### My Contribution

I worked on implementing and integrating the Milestones functionality with the existing TaskForge backend and database structure.

The module was integrated into the main development branch so that it works with the other project modules.

### Important Code

The Milestone model and its status enum live in `prisma/schema.prisma`:

```prisma
model Milestone {
  id          String          @id @default(cuid())
  projectId   String
  title       String
  description String?
  status      MilestoneStatus @default(PENDING)
  dueDate     DateTime?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  project     Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@index([status])
  @@map("milestones")
}

enum MilestoneStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
}
```

Every milestone operation is gated by a shared access check in
`src/modules/milestones/milestone.service.ts`, so only the project's client,
its freelancer, or an admin can read or change its milestones:

```ts
async function requireProjectAccess(projectId: string, userId: string, userRole: Role): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true, freelancerId: true },
  });

  if (!project) throw new NotFoundError("Project not found");
  if (userRole === "ADMIN") return;
  if (project.clientId !== userId && project.freelancerId !== userId) {
    throw new ForbiddenError("You do not have access to this project");
  }
}
```

---

## 3. Reviews

The Reviews module provides functionality for reviewing project or work-related activities and handling feedback.

### Main Features

- Review relevant project/work information
- Validate review requests
- Apply authentication and authorization
- Return structured API responses
- Handle invalid requests and errors

### My Contribution

I worked on the Reviews implementation and its integration with the existing backend architecture.

This included validation, authorization, API responses, and testing.

### Important Code

The Routes in `src/modules/reviews/review.routes.ts` show the pattern used across
the modules: authenticate, validate the incoming payload, then hand off to the
controller through `asyncHandler`:

```ts
router.post(
  "/",
  authenticate,
  validate({ body: createReviewSchema }),
  asyncHandler(createReview)
);
```

---

## 4. Reports

The Reports module organizes project information into useful report data.

### Main Features

- Retrieve project-related information
- Organize project data for reporting
- Apply authorization rules
- Integrate reports with the existing API

### My Contribution

I worked on implementing and integrating the Reports functionality with the rest of TaskForge.

The reporting functionality follows the same backend conventions used throughout the project.

### Important Code

In `src/modules/reports/report.service.ts`, a single report is only returned to an
admin or to the user who filed it:

```ts
// Admins moderate every report; a reporter may only follow their own.
const isAdmin = requesterRole === Role.ADMIN;
if (!isAdmin && report.reporterId !== requesterId) {
  throw new ForbiddenError("You do not have access to this report");
}
```

---

## 5. Jobs

The Jobs module was my major recent implementation.

It provides functionality for creating, viewing, filtering, and managing jobs in TaskForge.

### Main Features

- Public job listing
- Job creation
- Job retrieval
- Job updates
- Job deletion
- Job pagination
- Job filtering
- Budget range filtering
- Draft visibility
- Skills and categories
- Skill attachment to jobs
- Admin-only skill/category management
- Owner/admin authorization
- Job status management
- Validation and error handling

### Authorization

Different operations require different permissions.

For example:

- Public users can view available jobs.
- Authenticated clients can create jobs.
- Job owners can manage their own jobs.
- Administrators have additional management permissions.
- Skill and category management is restricted to administrators.

### Technical Implementation

The Jobs module uses the existing TaskForge backend architecture:

- Express
- Prisma
- PostgreSQL
- Request validation
- Authentication
- Role-based authorization
- Async error handling
- End-to-end testing

I worked on:

- Validators
- Services
- Controllers
- Routes
- Pagination integration
- Authorization logic
- Prisma queries
- E2E tests

### Important Code

#### 1. Validation

`src/modules/jobs/jobs.validator.ts` defines the accepted job status and the create
schema. The body is `.strict()`, so any unexpected key — including `ownerId` — is
rejected instead of being silently ignored:

```ts
/** Mirrors the `JobStatus` enum declared in prisma/schema.prisma. */
const jobStatusSchema = z.enum(["DRAFT", "OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

const baseJobSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Title should be at least 3 characters long!")
      .max(100, "Title must not exceed 100 characters!"),
    description: z.string().trim().min(25, "Description should be at least 25 characters long!"),
    status: jobStatusSchema.default("DRAFT"),
    skillIds: z.array(z.string().trim().min(1)).max(20, "You can attach at most 20 skills").optional(),
    minBudget: z.number().int().positive().optional(),
    maxBudget: z.number().int().positive().optional(),
    deadline: z
      .coerce.date()
      .refine((date) => date > new Date(), { message: "Deadline cannot be a past date!" })
      .optional(),
  })
  .strict();

const budgetRangeIsOrdered = (data: {
  minBudget?: number;
  maxBudget?: number;
}): boolean => !data.minBudget || !data.maxBudget || data.minBudget <= data.maxBudget;

export const createJobSchema = baseJobSchema.refine(budgetRangeIsOrdered, {
  message: "minBudget must be less than or equal to maxBudget",
  path: ["minBudget"],
});
```

#### 2. Route + Authorization

`src/modules/jobs/jobs.routes.ts`. Creating a job requires a logged-in client or
admin, and the validation and error-handling middleware wrap the controller:

```ts
// Publishing is restricted to clients (and admins for moderation/testing). The
// owner is always taken from the token, never from the request body.
router.post(
  "/",
  authenticate,
  authorize(Role.CLIENT, Role.ADMIN),
  validate({ body: createJobSchema }),
  asyncHandler(postJob)
);
```

Skill and category management is admin-only:

```ts
router.post(
  "/skills",
  authenticate,
  authorize(Role.ADMIN),
  validate({ body: createSkillSchema }),
  asyncHandler(createSkill)
);
```

#### 3. Service / Database Logic

`src/modules/jobs/jobs.services.ts`. Creating a job validates that every attached
skill really exists, then writes the job and its skill links in one operation:

```ts
export async function PostJob(body: CreateJobInput, ownerId: string) {
  const { skillIds, minBudget, maxBudget, deadline } = body;

  if (skillIds?.length) {
    await assertSkillsExist(skillIds);
  }

  return prisma.job.create({
    data: {
      ownerId,
      title: body.title,
      description: body.description,
      status: body.status,
      budgetMin: minBudget ?? null,
      budgetMax: maxBudget ?? null,
      deadline: deadline ?? null,
      ...(skillIds?.length && {
        jobSkills: { create: skillIds.map((skillId) => ({ skillId })) },
      }),
    },
    include: jobInclude,
  });
}
```

Ownership is enforced against the stored row before an update is allowed:

```ts
if (actor.role !== "ADMIN" && existing.ownerId !== actor.id) {
  throw new ForbiddenError("Only the job owner or an administrator can update this job");
}
```

#### 4. Filtering / Pagination

`src/modules/jobs/jobs.services.ts`. Listing applies the filters, counts and
fetches in parallel, and returns the standard pagination envelope:

```ts
export async function GetJobs(query: JobListQuery) {
  // Drafts are a private owner state: they only surface when asked for by name.
  const where: Prisma.JobWhereInput = {
    status: query.status ?? { not: "DRAFT" },
  };

  if (query.title) {
    where.title = { contains: query.title, mode: "insensitive" };
  }
  if (query.description) {
    where.description = { contains: query.description, mode: "insensitive" };
  }
  if (query.minBudget !== undefined) {
    where.budgetMin = { gte: query.minBudget };
  }
  if (query.maxBudget !== undefined) {
    where.budgetMax = { lte: query.maxBudget };
  }

  const { page, limit, skip } = parsePagination(query);

  const [total, jobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      skip,
      take: limit,
      include: jobInclude,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return paginated(jobs, page, limit, total);
}
```

Draft jobs stay private — a non-owner is told the job does not exist rather than
that it is forbidden:

```ts
const isOwner = viewer?.id === job.ownerId;
const isAdmin = viewer?.role === "ADMIN";
// Answering 404 rather than 403 keeps drafts from leaking to strangers.
if (job.status === "DRAFT" && !isOwner && !isAdmin) {
  throw new NotFoundError("Job not found");
}
```

---

## 6. Testing and Verification

Before pushing the completed Jobs work, I verified the implementation.

| Verification         | Result           |
| -------------------- | ---------------- |
| TypeScript typecheck | PASS             |
| Jobs E2E tests       | **62/62 PASS**   |
| Full test suite      | **192/192 PASS** |
| Production build     | PASS             |

The completed work was pushed to the shared `dev` branch.

### Commits

- Jobs implementation: `df1f762`
- Prisma/shared backend changes: `8cd0b52`

The final repository was synchronized with `origin/dev` and the working tree was clean.

---

## 7. Additional Work

Besides the four main areas, I also contributed to:

- Backend module integration
- Authentication and authorization
- Request validation
- Error handling
- Prisma client consistency
- Cross-module functionality
- End-to-end testing
- Final project verification

---

## 8. Important Code Concepts

**Data modeling** — Prisma models describe each table and the relationships between
tables, such as a Job belonging to one User.

**Input validation** — Zod schemas check incoming data before it reaches the
database, so invalid input produces a clear 400 error instead of a database crash.

**Authentication** — `authenticate` verifies the request's token and attaches the
user to `req.user`. `optionalAuthenticate` allows the request to continue even with
no token, which lets public pages personalize themselves.

**Authorization** — `authorize(...roles)` checks the user's role, and services make
a second ownership check against the stored record. Two layers matter: the route
blocks obviously wrong callers, and the service protects the data itself.

**Business logic** — Rules that are not just "read or write" live in the service,
for example "the job owner or an admin may edit this job" and "minBudget cannot be
larger than maxBudget".

**Database operations** — Prisma queries are typed, and awaited writes guarantee the
response is only sent after the data is safely stored.

**Filtering** — Query parameters such as status, title, or budget are translated into
a typed `where` clause, so the database returns only matching rows.

**Pagination** — `skip` and `take` return one page at a time instead of the whole
table, and the response carries `meta` with `page`, `limit`, `total`, and
`totalPages` for the frontend.

**Error handling** — Modules throw typed errors such as `NotFoundError`,
`ForbiddenError`, and `BadRequestError`. A single global error handler converts them
into consistent JSON responses.

**API architecture** — Each module is split into routes, controllers, services,
validators, and pagination helpers. Routes define URLs and middleware, controllers
handle HTTP, and services own the business logic and database work.

**End-to-end testing** — Vitest and Supertest send real HTTP requests to the Express
app and assert on status codes and response bodies, covering authentication,
authorization, validation, and CRUD behaviour end to end.

---

## 9. Presentation Summary

"My contribution to TaskForge focused mainly on Milestones, Reviews, Reports, and Jobs.

Milestones provide a way to track project stages. Reviews handle project or work feedback. Reports organize project information for reporting. Jobs provide a complete workflow for creating, viewing, filtering, and managing job opportunities.

I also worked on integrating these modules with the existing authentication, authorization, validation, Prisma, and error-handling systems.

The Jobs implementation was fully verified with 62 out of 62 Jobs tests passing and 192 out of 192 tests passing across the full project, together with a successful TypeScript check and production build.

The completed work was pushed to the shared `dev` branch."
