import { Router } from "express";
import { authenticate } from "../../shared/middleware/auth.middleware.js";
import { validate } from "../../shared/middleware/validate.middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import {
  createReview,
  deleteReview,
  getProjectReviews,
  getUserReviews,
  updateReview,
} from "./review.controller.js";
import {
  createReviewSchema,
  projectReviewsParamSchema,
  reviewIdParamSchema,
  reviewListQuerySchema,
  updateReviewSchema,
  userReviewsParamSchema,
} from "./review.schema.js";

const router = Router();

router.post(
  "/",
  authenticate,
  validate({ body: createReviewSchema }),
  asyncHandler(createReview)
);

router.get(
  "/project/:projectId",
  authenticate,
  validate({ params: projectReviewsParamSchema, query: reviewListQuerySchema }),
  asyncHandler(getProjectReviews)
);

router.get(
  "/user/:userId",
  authenticate,
  validate({ params: userReviewsParamSchema, query: reviewListQuerySchema }),
  asyncHandler(getUserReviews)
);

router.patch(
  "/:id",
  authenticate,
  validate({ params: reviewIdParamSchema, body: updateReviewSchema }),
  asyncHandler(updateReview)
);

router.delete(
  "/:id",
  authenticate,
  validate({ params: reviewIdParamSchema }),
  asyncHandler(deleteReview)
);

export default router;
