import {NextRequest} from "next/server";
import {getAuthUser,unauthorized} from "@/lib/auth";
import {SummonEvolutionError,evolveOwnedFamiliar}
  from "@/lib/summons/evolution-ledger";
import {EvolutionProvenanceError} from "@/lib/summons/evolution-receipts";
import {SummonTicketSourceError} from "@/lib/summons/free-ticket-ledger";
import {evolutionEnabled,type EvolutionStage} from "@/lib/summons/evolution-rules";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};

/** User-initiated, confirmed cosmetic change. Never invoked by page reads. */
export async function POST(req:NextRequest){
  const user=await getAuthUser();
  if(!user)return unauthorized();
  if(!evolutionEnabled())
    return Response.json({error:"Verified career evolution is disabled"},
      {status:503,headers});
  let body:unknown;
  try{body=await req.json();}
  catch{return Response.json({error:"Invalid evolution request JSON"},
    {status:400,headers});}
  if(!body||typeof body!=="object"||Array.isArray(body))
    return Response.json({error:"Invalid evolution request"},
      {status:400,headers});
  const data=body as Record<string,unknown>;
  if(Object.keys(data).some(key=>
       !["instanceId","toForm","requestKey","confirmEvolution"].includes(key))||
     data.confirmEvolution!==true||
     typeof data.instanceId!=="string"||
     typeof data.toForm!=="string"||
     typeof data.requestKey!=="string")
    return Response.json({
      error:"Explicit confirmation and exact owned Familiar evolution are required",
    },{status:400,headers});
  try{
    const receipt=await evolveOwnedFamiliar({
      ownerId:user.userId,instanceId:data.instanceId,
      toForm:data.toForm as EvolutionStage,requestKey:data.requestKey,
    });
    return Response.json({receipt,
      note:"Form only: earned rarity, inventory ownership and all credits remain unchanged.",
    },{status:receipt.reused?200:201,headers});
  }catch(error){
    if(error instanceof SummonEvolutionError)
      return Response.json({error:error.message},
        {status:error.statusCode,headers});
    if(error instanceof EvolutionProvenanceError||
       error instanceof SummonTicketSourceError)
      return Response.json({
        error:"Evolution provenance or current verified XP requires review",
      },{status:409,headers});
    console.error("[summon/evolve] guarded form transition failed",
      error instanceof Error?error.name:"Unknown");
    return Response.json({
      error:"Evolution could not be confirmed; retry only with the original request key.",
    },{status:503,headers});
  }
}
