import {getServerSession} from "next-auth";
import {authOptions} from "@/lib/auth-options";
import {ensureUniversalPico,summonPersistenceEnabled}
  from "@/lib/summons/server-ledger";
import {readStarterEntitlement} from "@/lib/summons/starter-entitlement";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};

/**
 * Explicit idempotent POST. The frontend may call this once after confirmed
 * sign-in, but only when the server advertises persistence=true. Never trust
 * userId, grantKey or species from the request body or URL.
 */
export async function POST(){
  let session;
  try{session=await getServerSession(authOptions);}
  catch{
    return Response.json({error:"Session service temporarily unavailable"},
      {status:503,headers});
  }
  const userId=session?.user&&"id" in session.user&&
    typeof session.user.id==="string"?session.user.id:"";
  const starter=readStarterEntitlement(userId);
  if(!starter)
    return Response.json({error:"Authentication required"},{status:401,headers});
  if(!summonPersistenceEnabled())
    return Response.json({error:"Persistent Summons are not enabled"},
      {status:503,headers});
  try{
    const instance=await ensureUniversalPico(userId);
    return Response.json({
      starter:{...starter,persistedInventory:true,inventoryId:instance.id},
      grant:{instanceId:instance.id,speciesId:"pico",originKind:"starter",
        status:"owned",idempotent:true},
    },{status:200,headers});
  }catch{
    return Response.json({error:"Starter inventory service unavailable"},
      {status:503,headers});
  }
}
