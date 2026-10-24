import {getServerSession} from "next-auth";
import {authOptions} from "@/lib/auth-options";
import {readStarterEntitlement,readSummonCatalog}
  from "@/lib/summons/starter-entitlement";
import {accountSummonLedger} from "@/lib/summons/server-ledger";

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
  let ledger;
  try{
    ledger=await accountSummonLedger(userId);
  }catch{
    // Enabled without a deployed schema is a hard failure, not an empty bag.
    return Response.json({error:"Summon inventory service unavailable"},{
      status:503,headers:noStore,
    });
  }
  return Response.json({
    starter:{...pico,persistedInventory:!!ledger?.starter,
      inventoryId:ledger?.starter?.id??null},
    catalogVersion:readSummonCatalog().version,
    inventory:ledger?{
      available:true,items:ledger.items,
      totalKnown:ledger.items.length<50,
      reason:"Only actual database instances are included",
    }:{
      available:false,
      extraSummons:null,
      reason:"Persistent Summon inventory is not enabled",
    },
    progression:{
      verifiedProfessionXp:null,
      summonTickets:null,
      reason:"An authoritative full profession XP/ticket rollout is not active",
    },
  },{headers:noStore});
}
