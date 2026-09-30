import {QuerySchema,UpdateJobSchema,CreateJobSchema,CreateSkillSchema,CreateCategorySchema} from "./jobs.validator.js"
import {parsePagination,paginated,PaginationParams} from "./jobs.pagination.js"
import { prisma } from "../lib/prisma.js";
import { Prisma } from '../generated/prisma/client.js';

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

    return { status:200, message:`Successful Operation! ${paginated(retrieved,page,limit,total)}`}
}

export async function GetJobByID(Id:string){
    const retrived=await prisma.job.findMany({
            where:{
                id:Id,
                status:{not:"DRAFT"}
            }
        })
        if(!retrived){
            return { status:404, message:`Job Not Found!`}
        }

        return { status:200, message:`Successful Operation! ${retrived}`};
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

                jobSkills:{
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

        return {status:201, message:`Succesful operation! ${post}`};
    }
    catch(error){
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
    
    if (error.code === 'P2002') {
        return {
            status:400,
            message:"Job already exists"
        }
    }}
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
        return {status:404, message:"Job Not Found!"}
    }
    if(retrivedjobs.ownerId!==ownerId && role!==''){
        return {status:403, message:"Forbidden!"}
    }

    const {skillIds, deadline, ...data}=body
    if (skillIds) {
    const count = await prisma.skill.count({ where: { id: { in: skillIds } } });
    if (count !== skillIds.length) throw new Error('One or more skillIds do not exist');
  }

  const job= prisma.job.update({
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

return { status:200, message:`Successful Operation! ${job}`}
}


export async function DeleteJobs(JobId:string,OwnerId:string,role:string){
    const Job=await prisma.job.findUnique({
        where:{
            id:JobId
        }
    })
        
        if(!Job){
        return {status:404, message:"Job Not Found!"}
    }
    if(Job.ownerId!==OwnerId && role!=="ADMIN"){
        return {status:403, message:"Forbidden!"}
    }

    try{
        
        const deleted= await prisma.job.deleteMany({
            where:{
                id:JobId
            }
        })

        return { status:204, message:`Successful Operation! `}
    }
    catch(error){
        console.error(error)
        throw error
    }
}

export async function CreateSkill(Body:CreateSkillSchema, Role:string){
    const {name, categoryId}=Body

    if(Role!=='ADMIN'){
        return {status:403, message:"Forbidden!"}
    }
    if(categoryId){ 
        const categoryCheck=await prisma.category.findUnique({
        where:{
            id:categoryId
        }
    })

    if(!categoryCheck){
        return {status:404, message:"Category Not Found!"}
    }
    }

    const skillCheck= await prisma.skill.findUnique({
        where:{
            name:name
        }
    })

    if(skillCheck){
        return {status:400, message:"Skill Already Exists!"}
    }

   const newSkill = await prisma.skill.create({
    data: {
      name: name,
      category: categoryId ? { connect: { id: categoryId } } : undefined,
    },
    include: {
      category: true
    }
  });

  return {status:201, message:`Successful Operation! ${newSkill}`}
   
}

export async function CreateCategory(Body:CreateCategorySchema,Role:string){
    const {name, description}=Body

    const categoryCheck=await prisma.category.findUnique({
        where:{
            name:name
        }
    })

    if(categoryCheck){
        return {status:400, message:"Category Already Exists!"}
    }
    const category= await prisma.category.create({
        data:{
            name:name,
            description: description ? description : undefined
        }
    })

    return {status:201, message:`Successful Operation! ${category}`}
}