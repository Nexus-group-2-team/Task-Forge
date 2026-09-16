import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 12);

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

  const skillNames = ['TypeScript', 'Node.js', 'React', 'PostgreSQL', 'Express', 'Python'];
  for (const name of skillNames) {
    await prisma.skill.upsert({ where: { name }, update: {}, create: { name } });
  }

  console.log('Seed complete:', { admin: admin.id, client: client.id, freelancer: freelancer.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
