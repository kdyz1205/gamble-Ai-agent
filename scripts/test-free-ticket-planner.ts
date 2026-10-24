import "dotenv/config";
import assert from "node:assert/strict";
import {
  computeEligibleCareerTickets,ticketGrantKey,reconcileFreeCareerTickets,
  summonTicketsEnabled,TICKET_GRANT_RULE_VERSION,
  MAX_TICKET_SOURCE_EVENTS,
} from "../src/lib/summons/free-ticket-ledger";
import {XP_LEDGER_VERSION} from "../src/lib/summons/server-ledger";

async function main(){
let checks=0;
const eq=(actual:unknown,expected:unknown,label:string)=>{
  assert.deepEqual(actual,expected,label);checks++;
};
const fail=(fn:()=>unknown,label:string)=>{
  assert.throws(fn,{name:"SummonTicketSourceError"},label);checks++;
};
const user="fixture-account",job="software" as const;
const receipt=(name:string,amount=100)=>({
  ownerId:user,professionId:job,challengeId:"quest-"+name,
  eventKey:"quest-xp:"+XP_LEDGER_VERSION+":quest-"+name+":"+user+":"+job,
  ruleVersion:XP_LEDGER_VERSION,awardType:"verified_quest",
  amount,sourceReceipt:"final-judgment-"+name,
});
const plan=(records:ReturnType<typeof receipt>[])=>computeEligibleCareerTickets(user,job,records);
eq(plan([]).earnedMilestones,0,"No verified XP has no free tickets");
eq(plan([receipt("a")]).earnedMilestones,1,"100 verified profession XP earns first milestone");
eq(plan([receipt("a")]).nextAtXp,250,"Next milestone threshold 250");
eq(plan([receipt("a"),receipt("b",80)]).earnedMilestones,1,"180 XP still one milestone");
eq(plan([receipt("a"),receipt("b",80),receipt("c",100)]).earnedMilestones,2,"280 XP earns two");
eq(plan([receipt("a"),receipt("b",80),receipt("c",100)]).verifiedXp,280,"XP sums exactly");
eq(plan([receipt("a"),receipt("b",80),receipt("c",100)]).grants.length,2,"Two unique proposed grants");
eq(plan([receipt("a")]).grants[0].sourceVersion,TICKET_GRANT_RULE_VERSION,"Rule version saved");
eq(ticketGrantKey(user,job,1),plan([receipt("a")]).grants[0].grantKey,"Grant key is stable");
eq(ticketGrantKey(user,job,1),ticketGrantKey(user,job,1),"Replays share grant key");
eq(ticketGrantKey(user,"athletics",1)===ticketGrantKey(user,job,1),false,"Separate careers do not share keys");
eq(ticketGrantKey("other-user",job,1)===ticketGrantKey(user,job,1),false,"User-bound tickets");
for(const n of [0,-1,NaN,1.1,101,Infinity])
  fail(()=>ticketGrantKey(user,job,n),"Invalid milestone cannot mint key "+n);
fail(()=>ticketGrantKey("",job,1),"Blank owner rejected");
fail(()=>ticketGrantKey(user,"made-up-profession" as never,1),"Unmapped profession rejected");
fail(()=>computeEligibleCareerTickets("other-user",job,[receipt("a")]),"Other user's XP rejected");
fail(()=>computeEligibleCareerTickets(user,"athletics",[receipt("a")]),"Other career's XP rejected");
fail(()=>plan([{...receipt("a"),amount:1000}]),"Money-like magnitude is not valid XP");
fail(()=>plan([{...receipt("a"),amount:-1}]),"Negative XP cannot independently mint tickets");
fail(()=>plan([{...receipt("a"),ruleVersion:"unknown"}]),"Wrong rule version rejected");
fail(()=>plan([{...receipt("a"),awardType:"correction"}]),"Corrections require manual reconciliation");
fail(()=>plan([{...receipt("a"),sourceReceipt:null}]),"No committed source receipt rejected");
fail(()=>plan([{...receipt("a"),challengeId:null}]),"No source Quest rejected");
fail(()=>plan([{...receipt("a"),eventKey:"client:guessed"}]),"Forged receipt key rejected");
fail(()=>plan([receipt("a"),receipt("a")]),"Duplicate events rejected");
fail(()=>plan([receipt("a"),{...receipt("a"),eventKey:"quest-xp:"+
  XP_LEDGER_VERSION+":quest-a:"+user+":"+job+":another"}]),"Duplicated Quest rejected");
fail(()=>plan(Array.from({length:MAX_TICKET_SOURCE_EVENTS+1},(_,i)=>receipt(String(i)))),
  "Incomplete 2001+ event snapshot rejected");
eq(plan([receipt("a"),receipt("b"),receipt("c")]).grants.every(x=>
  x.status==="available"),true,"Receipts are free and pending spend");
eq(plan([receipt("a")]).coverage,"recorded-verification-events-only",
  "Coverage is explicitly partial history");
const priorPersistence=process.env.SUMMON_PERSISTENCE_ENABLED;
const priorTicket=process.env.SUMMON_TICKETS_ENABLED;
try{
  process.env.SUMMON_PERSISTENCE_ENABLED="false";
  process.env.SUMMON_TICKETS_ENABLED="true";
  eq(summonTicketsEnabled(),false,"Ticket flag alone cannot bypass persistence gate");
  process.env.SUMMON_PERSISTENCE_ENABLED="true";
  process.env.SUMMON_TICKETS_ENABLED="false";
  eq(summonTicketsEnabled(),false,"Persistence alone cannot activate awards");
  process.env.SUMMON_TICKETS_ENABLED="true";
  eq(summonTicketsEnabled(),true,"Explicit dual feature gates recognized");
  process.env.SUMMON_TICKETS_ENABLED="false";
  await assert.rejects(()=>reconcileFreeCareerTickets({ownerId:user,professionId:job}),
    {name:"SummonTicketSourceError"});
  checks++;
}finally{
  if(priorPersistence===undefined)delete process.env.SUMMON_PERSISTENCE_ENABLED;
  else process.env.SUMMON_PERSISTENCE_ENABLED=priorPersistence;
  if(priorTicket===undefined)delete process.env.SUMMON_TICKETS_ENABLED;
  else process.env.SUMMON_TICKETS_ENABLED=priorTicket;
}
console.log("FREE_SUMMON_TICKET_PLANNER_PASS",checks,"checks");
}
main().catch(error=>{console.error(error);process.exitCode=1});
