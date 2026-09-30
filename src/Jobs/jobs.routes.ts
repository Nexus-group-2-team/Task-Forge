import { Router } from "express";
import { 
    getJobs, 
    getJobsByID, 
    postJob, 
    patchJobs, 
    deleteJobs, 
    createSkill, 
    createCategory 
} from "./jobs.controllers.js";

// ⚠️ IMPORT BEKAM'S AUTH MIDDLEWARE HERE
// import { authenticate, requireRole } from "../middleware/auth.middleware.js"; 

const router = Router();

// ==========================================
// JOB ROUTES
// ==========================================
// Public routes
router.get("/", getJobs);
router.get("/:id", getJobsByID);

// Protected routes (You MUST uncomment the auth middleware below)
router.post("/", /* authenticate, requireRole("CLIENT", "ADMIN"), */ postJob);
router.patch("/:id", /* authenticate, */ patchJobs);
router.delete("/:id", /* authenticate, */ deleteJobs);

// ==========================================
// SKILL & CATEGORY ROUTES
// ==========================================
// These should be protected and restricted to Admin
router.post("/skills", /* authenticate, requireRole("ADMIN"), */ createSkill);
router.post("/categories", /* authenticate, requireRole("ADMIN"), */ createCategory);

export default router;