import {NextRequest} from "next/server";
import {getAuthUser,unauthorized} from "@/lib/auth";
import {
  redeemFreeSummonTicket,freeDrawEnabled,SummonDrawError,
} from "@/lib/summons/free-draw-ledger";
import {SummonTicketSourceError} from "@/lib/summons/free-ticket-ledger";
import type {ProfessionId} from "@/lib/summons/profession-system";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};

/** An explicit user-confirmed action, NEVER a page-load or background grant. */
export async function POST(req:NextRequest){
  const user=await getAuthUser();
  if(!user)return unauthorized();
  if(!freeDrawEnabled())
    return Response.json({error:"Free Summon drawing is not enabled"},
      {status:503,headers});
  let payload:unknown;
  try{payload=await req.json();}
  catch{return Response.json({error:"Invalid Summon request JSON"},{status:400,headers});}
  if(!payload||typeof payload!=="object"||Array.isArray(payload))
    return Response.json({error:"Invalid Summon request"},{status:400,headers});
  const data=payload as Record<string,unknown>;
  if(Object.keys(data).some(k=>
      !["professionId","occupationId","requestKey","confirmSpend"].includes(k))||
     data.confirmSpend!==true||
     typeof data.professionId!=="string"||
     typeof data.occupationId!=="string"||
     typeof data.requestKey!=="string")
    return Response.json({
      error:"Explicit confirmation and exact free-ticket draw parameters required",
    },{status:400,headers});
  try{
    const draw=await redeemFreeSummonTicket({
      ownerId:user.userId,professionId:data.professionId as ProfessionId,
      occupationId:data.occupationId,requestKey:data.requestKey,
    });
    return Response.json({
      draw,
      note:"Only one audited free career ticket can be spent. No cash or credits were transferred.",
    },{status:draw.reused?200:201,headers});
  }catch(error){
    if(error instanceof SummonDrawError)
      return Response.json({error:error.message},{status:error.statusCode,headers});
    if(error instanceof SummonTicketSourceError)
      return Response.json({error:"Career ticket source requires independent review"},
        {status:409,headers});
    console.error("[summon/free-draw] guarded transaction failed",
      error instanceof Error?error.name:"Unknown");
    return Response.json({error:"Free Summon draw was not confirmed. Check your receipt before retrying."},
      {status:503,headers});
  }
}
