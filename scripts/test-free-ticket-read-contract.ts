import assert from "node:assert/strict";
import {assertFreeTicketSummary} from "../src/lib/summons/ticket-read-contract";
let checks=0;
const pass=(cond:unknown,m:string)=>{assert.ok(cond,m);checks++};
const fail=(value:unknown,m:string)=>{assert.throws(()=>assertFreeTicketSummary(value),m);checks++};
const valid={
 source:"audited-free-profession-tickets-v1",coverage:"recorded-verification-events-only",
 available:2,spent:1,issued:3,awaitingIssuance:1,
 byProfession:[
 {professionId:"software",verifiedXp:300,eligibleMilestones:2,issued:2,available:1,spent:1,awaitingIssuance:0},
 {professionId:"athletics",verifiedXp:100,eligibleMilestones:2,issued:1,available:1,spent:0,awaitingIssuance:1}
 ]};
const alter=(fn:(v:typeof valid)=>void)=>{const v=structuredClone(valid);fn(v);return v};
pass(assertFreeTicketSummary(null)===null,"Disabled remains unknown");
pass(assertFreeTicketSummary(valid)===valid,"Valid server snapshot accepted");
fail(undefined,"Missing response does not mean feature disabled");
fail({...valid,source:"local-preview"},"No client-generated rewards");
fail({...valid,coverage:"lifetime"},"Partial cannot claim lifetime XP");
fail({...valid,available:10},"Forged aggregate rejected");
fail({...valid,issued:4},"Issued amount must equal available plus spent");
fail(alter(v=>{v.byProfession[0].professionId="invalid";}),"Unknown profession rejected");
fail(alter(v=>{v.byProfession[1].professionId="software";}),"Duplicate profession rejected");
fail(alter(v=>{v.byProfession[0].available=-1;}),"Negative balance rejected");
fail(alter(v=>{v.byProfession[0].awaitingIssuance=3;}),"Invented pending grants rejected");
fail(alter(v=>{v.byProfession[0].eligibleMilestones=101;}),"Limit enforced");
fail(alter(v=>{v.byProfession[0].verifiedXp=NaN;}),"Nonfinite XP rejected");
fail(alter(v=>{v.byProfession[0].spent=5;}),"Invalid spend count rejected");
console.log("FREE_TICKET_READ_CONTRACT_PASS",checks,"checks");
