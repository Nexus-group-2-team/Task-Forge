import { Role } from "../../generated/prisma/enums.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../shared/db/prisma.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/app-error.js";
import { createPaginatedResponse, getPaginationOptions } from "../../shared/utils/pagination.js";
import type { CreateReviewInput, ReviewListQuery, UpdateReviewInput } from "./review.schema.js";

/**
 * Express 5 types route params as `string | string[]`. Every id reaching a
 * service has already been validated by the Zod param schema, so it is a string.
 */
const param = (value: string | string[]): string => (Array.isArray(value) ? value[0] : value);

/**
 * Public projection for the users attached to a review. `passwordHash`,
 * `accountStatus` and every auth-related field are deliberately excluded so a
 * review can never be used to leak credentials.
 */
const reviewUserSelect = {
  id: true,
  role: true,
  profile: {
    select: {
      fullName: true,
      headline: true,
    },
  },
} satisfies Prisma.UserSelect;

const reviewInclude = {
  reviewer: { select: reviewUserSelect },
  reviewee: { select: reviewUserSelect },
} satisfies Prisma.ReviewsInclude;

type ReviewWithUsers = Prisma.ReviewsGetPayload<{ include: typeof reviewInclude }>;

export interface CreateReviewParams {
  reviewerId: string;
  data: CreateReviewInput;
}

export interface UpdateReviewParams {
  reviewId: string;
  requesterId: string;
  data: UpdateReviewInput;
}

export interface DeleteReviewParams {
  reviewId: string;
  requesterId: string;
  requesterRole: Role;
}

export class ReviewService {
  /**
   * A review may only be exchanged between the two participants of a project, so
   * it resolves the reviewer's own participant identity first and derives the
   * only legitimate reviewee from it.
   */
  private static async getProjectParticipants(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true, freelancerId: true },
    });

    if (!project) {
      throw new NotFoundError("Project not found");
    }

    return project;
  }

  private static resolveReviewee(project: { clientId: string; freelancerId: string }, reviewerId: string): string {
    if (project.clientId === reviewerId) {
      return project.freelancerId;
    }
    if (project.freelancerId === reviewerId) {
      return project.clientId;
    }

    throw new ForbiddenError("Only project participants can review this project");
  }

  static async createReview({ reviewerId, data }: CreateReviewParams): Promise<ReviewWithUsers> {
    const { projectId, revieweeId, rating, comment } = data;

    if (reviewerId === revieweeId) {
      throw new BadRequestError("You cannot review yourself");
    }

    const project = await ReviewService.getProjectParticipants(projectId);
    const expectedRevieweeId = ReviewService.resolveReviewee(project, reviewerId);

    if (revieweeId !== expectedRevieweeId) {
      throw new BadRequestError("Reviewee must be the other participant of this project");
    }

    const existingReview = await prisma.reviews.findUnique({
      where: { projectId_reviewerId: { projectId, reviewerId } },
      select: { id: true },
    });

    if (existingReview) {
      throw new ConflictError("You have already reviewed this project");
    }

    try {
      return await prisma.reviews.create({
        data: {
          projectId,
          reviewerId,
          revieweeId,
          rating,
          comment: comment ?? null,
        },
        include: reviewInclude,
      });
    } catch (error) {
      // The database unique constraint is the source of truth; the pre-check
      // above only exists to return a friendlier error for the common case.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("You have already reviewed this project");
      }
      throw error;
    }
  }

  static async getReviewsByProject(rawProjectId: string, requesterId: string, query: ReviewListQuery) {
    const projectId = param(rawProjectId);
    const project = await ReviewService.getProjectParticipants(projectId);

    const isParticipant = project.clientId === requesterId || project.freelancerId === requesterId;
    if (!isParticipant) {
      // Mirrors the project's IDOR-hardening convention: 404 instead of 403 so
      // project existence cannot be probed.
      throw new NotFoundError("Project not found");
    }

    const { page, limit, skip } = getPaginationOptions(query as Record<string, unknown>);

    const [reviews, total] = await Promise.all([
      prisma.reviews.findMany({
        where: { projectId },
        include: reviewInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.reviews.count({ where: { projectId } }),
    ]);

    return createPaginatedResponse(reviews, total, page, limit);
  }

  static async getReviewsByUser(rawUserId: string, query: ReviewListQuery) {
    const userId = param(rawUserId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const { page, limit, skip } = getPaginationOptions(query as Record<string, unknown>);

    const [reviews, total] = await Promise.all([
      prisma.reviews.findMany({
        where: { revieweeId: userId },
        include: reviewInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.reviews.count({ where: { revieweeId: userId } }),
    ]);

    return createPaginatedResponse(reviews, total, page, limit);
  }

  private static async getReviewOrThrow(reviewId: string): Promise<ReviewWithUsers> {
    const review = await prisma.reviews.findUnique({
      where: { id: reviewId },
      include: reviewInclude,
    });

    if (!review) {
      throw new NotFoundError("Review not found");
    }

    return review;
  }

  static async updateReview({ reviewId, requesterId, data }: UpdateReviewParams): Promise<ReviewWithUsers> {
    const review = await ReviewService.getReviewOrThrow(reviewId);

    if (review.reviewerId !== requesterId) {
      throw new ForbiddenError("You can only update your own review");
    }

    return prisma.reviews.update({
      where: { id: reviewId },
      data: {
        ...(data.rating !== undefined ? { rating: data.rating } : {}),
        ...(data.comment !== undefined ? { comment: data.comment ?? null } : {}),
      },
      include: reviewInclude,
    });
  }

  static async deleteReview({ reviewId, requesterId, requesterRole }: DeleteReviewParams): Promise<void> {
    const review = await ReviewService.getReviewOrThrow(reviewId);

    const isAuthor = review.reviewerId === requesterId;
    const isAdmin = requesterRole === Role.ADMIN;

    if (!isAuthor && !isAdmin) {
      throw new ForbiddenError("You can only delete your own review");
    }

    await prisma.reviews.delete({ where: { id: reviewId } });
  }
}
