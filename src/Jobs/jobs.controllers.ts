import {Request, Response} from "express";
import {querySchema,updateJobSchema,createJobSchema,CreateJobSchema,QuerySchema,UpdateJobSchema} from "./jobs.validator.js"
import { GetJobs, GetJobByID,PostJob,PatchJobs,DeleteJobs} from "./jobs.services.js";

export async function getJobs(req:Request,res:Response){
    try{
        const validatedquery=querySchema.safeParse(req.query);
        if(!validatedquery.success){
            return res.status(400).json({ 
        errors: validatedquery.error 
      });
        }

        const gotJobs=await GetJobs(validatedquery.data)
        return res.status(200).json({message:"Succesful Operation!",
            result:gotJobs
        })
    }
    catch(error){
        console.error(error)
    }
}

export async function getJobsByID(req:Request,res:Response){
    try{
        const paramID=req.params.id as string
        const job= await GetJobByID(paramID)

        if(!job){
            return res.status(404).json({message:"Job is not found!"})
        }

        return res.status(200).json({message:"Succesful Operation!",
            result:job
        })
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

    try{const posted=await PostJob(validatedBody.data,"wersdf4")

    return res.status(201).json({
        message:"Succesful Operation!",
        result:posted
    })}
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
        const patched=PatchJobs(validatedBody.data,"werddfg456","wasder34","CLIENT")
    return res.status(200).json({
        message:"Successful Operation!",
        result:patched
    })
    }
    catch(error){
        console.error(error)
    }
}


export async function deleteJobs(req:Request,res:Response){
    try{
        const deleted=await DeleteJobs("wersdf456","wersdfxcv","ADMIN")
        return res.status(204).json({
            message:"Successful Operation!"
        })
    }
    catch(error){
        console.error(error)
    }
}