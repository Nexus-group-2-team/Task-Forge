import {Request, Response} from "express";
import {querySchema,updateJobSchema,createJobSchema,createSkillSchema,createCategorySchema} from "./jobs.validator.js"
import { GetJobs, GetJobByID,PostJob,PatchJobs,DeleteJobs,CreateSkill,CreateCategory} from "./jobs.services.js";

export async function getJobs(req:Request,res:Response){
    try{
        const validatedquery=querySchema.safeParse(req.query);
        if(!validatedquery.success){
            return res.status(400).json({ 
        errors: validatedquery.error 
      });
        }

        const gotJobs=await GetJobs(validatedquery.data)
        return res.status(gotJobs.status).json(gotJobs.message)
    }
    catch(error){
        console.error(error)
    }
}

export async function getJobsByID(req:Request,res:Response){
    try{
        const paramID=req.params.id as string
        const job= await GetJobByID(paramID)

        return res.status(job.status).json(job.message)
    }
    catch(error){
        console.error(error)
    }
    
}

export async function postJob(req:Request,res:Response){
    const validatedBody=createJobSchema.safeParse(req.body);
    if(!validatedBody.success){
        return res.status(400).json({
            message:"Faulty input Body!",
            error:validatedBody.error
        })
    }

    try{
        const posted=await PostJob(validatedBody.data,"wersdf4")

    return res.status(posted.status).json(posted.message)
}
    catch(error){
        console.error(error)
    }
}

export async function patchJobs(req:Request,res:Response){
    const validatedBody=updateJobSchema.safeParse(req.body);

    if(!validatedBody.success){
        return res.status(400).json({
            message:"Invalid Body input!",
            error:validatedBody.error
        })
    }

    try{
        const patched=await PatchJobs(validatedBody.data,"werddfg456","wasder34","CLIENT")
    return res.status(patched.status).json(patched.message)
    }
    catch(error){
        console.error(error)
    }
}


export async function deleteJobs(req:Request,res:Response){
    try{
        const deleted=await DeleteJobs("wersdf456","wersdfxcv","ADMIN")
        return res.status(deleted.status).json(deleted.message)
    }
    catch(error){
        console.error(error)
    }
}

export async function createSkill(req:Request,res:Response){
    const validatedBody=createSkillSchema.safeParse(req.body)
    if(!validatedBody.success){
        return res.status(400).json({message:"Invalid Input!",
            error:validatedBody.error
        })
    }
    const skill=await CreateSkill(validatedBody.data,"ADMIN")

    return res.status(skill.status).json(skill.message)
}

export async function createCategory(req:Request,res:Response){
    const validatedBody=createCategorySchema.safeParse(req.body)
    if(!validatedBody.success){
        return res.status(400).json({message:"Invalid Input!",
            error:validatedBody.error
        })
    }
    const category=await CreateCategory(validatedBody.data,"ADMIN");

    return res.status(category.status).json(category.message)
}