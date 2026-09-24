import { prisma } from "../../shared/db/prisma.js";
import { NotFoundError } from "../../shared/errors/app-error.js";
import type { UpdateProfileInput, UpdateSkillsInput } from "./profile.schema.js";

export class ProfileService {
  static async getProfileByUserId(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        accountStatus: true,
        createdAt: true,
        profile: true,
        userSkills: {
          include: {
            skill: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError("User profile not found");
    }

    return user;
  }

  static async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (input.fullName) {
      // Keep fullName synced if user record stores it or profile stores it
    }

    const updatedProfile = await prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        fullName: input.fullName || "User",
        bio: input.bio,
        headline: input.headline,
        location: input.location,
        portfolioUrl: input.portfolioUrl,
        experienceYears: input.experienceYears ?? 0,
      },
      update: {
        ...(input.fullName && { fullName: input.fullName }),
        ...(input.bio !== undefined && { bio: input.bio }),
        ...(input.headline !== undefined && { headline: input.headline }),
        ...(input.location !== undefined && { location: input.location }),
        ...(input.portfolioUrl !== undefined && { portfolioUrl: input.portfolioUrl }),
        ...(input.experienceYears !== undefined && { experienceYears: input.experienceYears }),
      },
    });

    return updatedProfile;
  }

  static async updateSkills(userId: string, input: UpdateSkillsInput) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Delete existing user skills
    await prisma.userSkill.deleteMany({
      where: { userId },
    });

    // Create or find skills and link to user
    const skillRecords = await Promise.all(
      input.skills.map((name) =>
        prisma.skill.upsert({
          where: { name: name.trim().toLowerCase() },
          create: { name: name.trim().toLowerCase() },
          update: {},
        })
      )
    );

    await prisma.userSkill.createMany({
      data: skillRecords.map((s) => ({
        userId,
        skillId: s.id,
      })),
    });

    return this.getProfileByUserId(userId);
  }

  static async listFreelancers(search?: string) {
    const freelancers = await prisma.user.findMany({
      where: {
        role: "FREELANCER",
        accountStatus: "ACTIVE",
        ...(search && {
          OR: [
            { profile: { fullName: { contains: search, mode: "insensitive" } } },
            { profile: { headline: { contains: search, mode: "insensitive" } } },
            { profile: { bio: { contains: search, mode: "insensitive" } } },
            {
              userSkills: {
                some: {
                  skill: {
                    name: { contains: search, mode: "insensitive" },
                  },
                },
              },
            },
          ],
        }),
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        profile: true,
        userSkills: {
          include: {
            skill: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return freelancers;
  }
}
