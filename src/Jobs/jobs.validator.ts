import {z} from "zod"


export const querySchema=z.object({
    page:z.coerce.number().int().positive().default(1).optional(),
    limit:z.coerce.number().int().min(3,"No less than 3 elements are alllowed!").max(100,"No more than 100 elements are allowed!").default(10).optional(),
    status:z.enum(["OPEN","COMPLETED","IN_PROGRESS","CANCLLED","DRAFT"]).optional(),
    minBudget:z.coerce.number().int().positive().optional(),
    maxBudget:z.coerce.number().int().positive().optional(),
    title:z.string().optional(),
    description:z.string().optional()
})

export const createJobSchema=z.object({
    ownerId:z.string(),
    title:z.string().min(3,"Title should atleast be 3 characters long!").max(100,"Title must not exceed 100 characters!"),
    description:z.string().min(25,"Tiltle should atleast be 25 characters long!"),
    status:z.enum(["OPEN","COMPLETED","IN_PROGRESS","CANCLLED","DRAFT"]).default("DRAFT"),
    minBudget:z.int().positive().optional(),
    maxBudget:z.int().positive().optional(),
    deadline:z.coerce.date().refine((date)=>{
        return date > new Date()
    }, 
    {
        message:"Deadline cannot be a  past date!"
    }).optional()
}).refine((d) => !d.minBudget || !d.maxBudget || d.minBudget <= d.maxBudget, {
  message: 'budgetMin must be <= budgetMax',
  path: ['budgetMin'],
});

export const createUserSchema=z.object({
    email:z.email(),
    passwordHash:z.string(),
    role:z.enum(["CLIENT","ADMIN","FREELANCER"]).default("FREELANCER"),
    accountStatus:z.enum(["ACTIVE","SUSPENDED","DEACTIVATED"]).default("ACTIVE")
})

export const createJobSkillSchema= z.object({
    jobId:z.string(),
    skillId:z.string()
})

export const createUserSkillSchema= z.object({
    userId:z.string(),
    skillId:z.string()
})

export const  updateJobSchema=createJobSchema.partial();