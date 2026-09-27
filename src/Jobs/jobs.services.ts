import {QuerySchema,UpdateJobSchema,CreateJobSchema} from "./jobs.validator.js"
import {parsePagination,paginated,PaginationParams} from "./jobs.pagination.js"
import { prisma } from "../lib/prisma.js";

export async function GetJobs(Query:QuerySchema){   
    const {title, description, minBudget, maxBudget, status}=Query
    const whereClause:any={}
    if(status){
        whereClause.status=status
    }
    else {
    whereClause.status = { not: 'DRAFT' };
    }
    if(title) {
        whereClause.title={contains:title, mode:'insensitive'}
    }
    if(description) {
        whereClause.description={contains:description, mode:'insensitive'}
    }
    if(minBudget||maxBudget) {
        whereClause.min={}
        if (minBudget) whereClause.budgetMin={gte:minBudget};
        if (maxBudget) whereClause.budgetMax={lte: maxBudget};
    }

    const { page, limit, skip } = parsePagination(Query);

    const [total,retrieved]=await Promise.all([
        prisma.job.count({where:whereClause}),
        prisma.job.findMany({
        where:whereClause,
        skip:skip,
        take:limit
    })
    ]) 

    return paginated(retrieved,page,limit,total)
}

export async function GetJobByID(Id:string){
    const retrived=await prisma.job.findMany({
            where:{
                id:Id,
                status:{not:"DRAFT"}
            }
        })

        return retrived;
}

export async function PostJob(body:CreateJobSchema,userId:string){
    try{
        const {skillIds, title, description, status, minBudget, maxBudget, deadline }=body
        
            const post=await prisma.job.create({
            data:{
                ownerId:userId,
                title:title,
                description:description,
                status:status,
                budgetMin:minBudget ?? null,
                budgetMax:maxBudget ?? null,
                deadline:deadline ?? null,

                jobSkill:{
                    create: skillIds?.map((skillId)=>({
                        skillId:skillId
                    })) || []
                }

            },
            include:{
                jobSkills: {
            include: {
                skill: true
            }
        }
            }
        })

        return post;
    }
    catch(error){
        console.error(error)
        throw error;
    }
}


export async function PatchJobs(body:UpdateJobSchema,JobId:string, ownerId:string, role:string){
    const retrivedjobs=await prisma.job.findUnique({
        where:{
            id:JobId
        }
    })
    if(!retrivedjobs){
        throw new Error('Job not Found!')
    }
    if(retrivedjobs.ownerId!==ownerId && role!==''){
        throw new Error('Forbidden!')
    }

    const {skillIds, deadline, ...data}=body
    if (skillIds) {
    const count = await prisma.skill.count({ where: { id: { in: skillIds } } });
    if (count !== skillIds.length) throw new Error('One or more skillIds do not exist');
  }

  return prisma.job.update({
  where: { id: JobId },
  data: {
    ...data,
    deadline: deadline === undefined ? undefined : deadline === null ? null : new Date(deadline),
    jobSkills: skillIds
      ? { deleteMany: {}, create: skillIds.map((skillId) => ({ skillId })) }
      : undefined,
  },
  include: {
    jobSkills: {
      include: {
        skill: true
      }
    }
  }
});
}


export async function DeleteJobs(JobId:string,OwnerId:string,role:string){
    const Job=await prisma.job.findUnique({
        where:{
            id:JobId
        }
    })

    if(!Job){
        throw new Error('Job Not Found!')
    }
    if(Job.ownerId!==OwnerId && role!=="ADMIN"){
        throw new Error('Access Forbidden!')
    }

    try{
        return await prisma.job.deleteMany({
            where:{
                id:JobId
            }
        })
    }
    catch(error){
        console.error(error)
    }
}