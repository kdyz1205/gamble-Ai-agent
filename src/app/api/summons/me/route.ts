import {getServerSession} from "next-auth";
import {authOptions} from "@/lib/auth-options";
import {readStarterEntitlement,readSummonCatalog}
  from "@/lib/summons/starter-entitlement";

export const dynamic="force-dynamic";
const noStore={"Cache-Control":"private, no-store"};

export async function GET(){
  let session;
  try{
    session=await getServerSession(authOptions);
  }catch{
    return Response.json({error:"Session service temporarily unavailable"},{
      status:503,headers:noStore,
    });
  }
  const userId=session?.user && "id" in session.user && typeof session.user.id==="string"
    ?session.user.id:"";
  const pico=readStarterEntitlement(userId);
  if(!pico){
    return Response.json({error:"Authentication required"},{
      status:401,headers:noStore,
    });
  }
  return Response.json({
    starter:pico,
    catalogVersion:readSummonCatalog().version,
    inventory:{
      available:false,
      extraSummons:null,
      reason:"Persistent Summon inventory is not implemented",
    },
    progression:{
      verifiedProfessionXp:null,
      summonTickets:null,
      reason:"Audited per-profession XP and ticket ledger is not implemented",
    },
  },{headers:noStore});
}
