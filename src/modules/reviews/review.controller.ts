import type { Request, Response } from "express";
import { ApiResponse } from "../../shared/utils/api-response.js";
import { ReviewService } from "./review.service.js";
import type { CreateReviewInput, ReviewListQuery, UpdateReviewInput } from "./review.schema.js";

const requireUserId = (req: Request): string => {
  // `authenticate` guarantees req.user; this keeps TypeScript honest.
  return req.user!.id;
};

export const createReview = async (req: Request, res: Response): Promise<void> => {
  const review = await ReviewService.createReview({
    reviewerId: requireUserId(req),
    data: req.body as CreateReviewInput,
  });

  ApiResponse.created(res, review, "Review created successfully");
};

export const getProjectReviews = async (req: Request, res: Response): Promise<void> => {
  const result = await ReviewService.getReviewsByProject(
    req.params.projectId as string,
    requireUserId(req),
    req.query as ReviewListQuery
  );

  ApiResponse.success(res, result.data, "Project reviews retrieved successfully", 200, result.meta);
};

export const getUserReviews = async (req: Request, res: Response): Promise<void> => {
  const result = await ReviewService.getReviewsByUser(req.params.userId as string, req.query as ReviewListQuery);

  ApiResponse.success(res, result.data, "User reviews retrieved successfully", 200, result.meta);
};

export const updateReview = async (req: Request, res: Response): Promise<void> => {
  const review = await ReviewService.updateReview({
    reviewId: req.params.id as string,
    requesterId: requireUserId(req),
    data: req.body as UpdateReviewInput,
  });

  ApiResponse.success(res, review, "Review updated successfully");
};

export const deleteReview = async (req: Request, res: Response): Promise<void> => {
  await ReviewService.deleteReview({
    reviewId: req.params.id as string,
    requesterId: requireUserId(req),
    requesterRole: req.user!.role,
  });

  ApiResponse.noContent(res);
};
