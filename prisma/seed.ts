import { prisma } from '../src/shared/db/prisma.js';
import { Role, ProjectStatus, MilestoneStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 12);

  // 1. Users with Profiles
  const admin = await prisma.user.upsert({
    where: { email: 'admin@taskforge.dev' },
    update: {},
    create: {
      email: 'admin@taskforge.dev',
      passwordHash,
      role: Role.ADMIN,
      profile: { create: { fullName: 'TaskForge Admin', headline: 'Platform administrator' } },
    },
  });

  const client = await prisma.user.upsert({
    where: { email: 'client@taskforge.dev' },
    update: {},
    create: {
      email: 'client@taskforge.dev',
      passwordHash,
      role: Role.CLIENT,
      profile: { create: { fullName: 'Sample Client', headline: 'Hiring great talent' } },
    },
  });

  const freelancer = await prisma.user.upsert({
    where: { email: 'freelancer@taskforge.dev' },
    update: {},
    create: {
      email: 'freelancer@taskforge.dev',
      passwordHash,
      role: Role.FREELANCER,
      profile: { create: { fullName: 'Sample Freelancer', headline: 'Full-stack developer' } },
    },
  });

  // 2. Global Skills Catalog
  const skillNames = ['TypeScript', 'Node.js', 'React', 'PostgreSQL', 'Express', 'Python'];
  for (const name of skillNames) {
    await prisma.skill.upsert({ where: { name }, update: {}, create: { name } });
  }

  // 3. Attach Skills to Freelancer
  const tsSkill = await prisma.skill.findUnique({ where: { name: 'TypeScript' } });
  const nodeSkill = await prisma.skill.findUnique({ where: { name: 'Node.js' } });

  if (tsSkill) {
    await prisma.userSkill.upsert({
      where: { userId_skillId: { userId: freelancer.id, skillId: tsSkill.id } },
      update: {},
      create: { userId: freelancer.id, skillId: tsSkill.id },
    });
  }

  if (nodeSkill) {
    await prisma.userSkill.upsert({
      where: { userId_skillId: { userId: freelancer.id, skillId: nodeSkill.id } },
      update: {},
      create: { userId: freelancer.id, skillId: nodeSkill.id },
    });
  }

  // 4. Sample Job, Application, and Project with Milestones
  const job = await prisma.job.upsert({
    where: { id: 'cld_sample_job_001' },
    update: {},
    create: {
      id: 'cld_sample_job_001',
      title: 'E-Commerce Marketplace Backend',
      description: 'Design and build resilient order processing and payment webhooks.',
      budgetMin: 3000,
      budgetMax: 5000,
      ownerId: client.id,
      status: 'IN_PROGRESS',
    },
  });

  const application = await prisma.application.upsert({
    where: { jobId_freelancerId: { jobId: job.id, freelancerId: freelancer.id } },
    update: {},
    create: {
      id: 'cld_sample_app_001',
      jobId: job.id,
      freelancerId: freelancer.id,
      coverLetter: 'I have extensive experience with TypeScript, Node.js, and Stripe webhook flows.',
      proposedBid: 3500,
      status: 'ACCEPTED',
    },
  });

  await prisma.project.upsert({
    where: { id: 'cld_sample_project_001' },
    update: {},
    create: {
      id: 'cld_sample_project_001',
      title: 'E-Commerce Marketplace Backend',
      status: ProjectStatus.ACTIVE,
      clientId: client.id,
      freelancerId: freelancer.id,
      applicationId: application.id,
      milestones: {
        create: [
          { title: 'Schema & Database Setup', description: 'Setup database schema and Prisma models', status: MilestoneStatus.COMPLETED },
          { title: 'Stripe Integration & Webhooks', description: 'Implement payment webhook idempotency', status: MilestoneStatus.IN_PROGRESS },
        ],
      },
    },
  });

  console.log('Seed complete:', {
    admin: admin.id,
    client: client.id,
    freelancer: freelancer.id,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

