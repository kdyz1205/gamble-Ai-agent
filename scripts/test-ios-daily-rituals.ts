import assert from "node:assert/strict";
import {countCheckinStreak,localDay,type DeviceRitual} from "../src/components/ios/IOSDailyRituals";

const now=new Date(2026,9,22,14,0,0);
const yday=new Date(2026,9,21,14,0,0);
const two=new Date(2026,9,20,14,0,0);
const blank: DeviceRitual = {id:"fixture",label:"Read 10 minutes",createdAt:now.toISOString(),completedDays:[]};
const ritual=(...days:Date[]):DeviceRitual=>({...blank,completedDays:days.map(localDay)});
assert.equal(localDay(now),"2026-10-22");
assert.equal(countCheckinStreak([],now),0,"no check-ins cannot earn a streak");
assert.equal(countCheckinStreak([ritual(now)],now),1,"today alone counts one day");
assert.equal(countCheckinStreak([ritual(now,yday)],now),2,"consecutive days");
assert.equal(countCheckinStreak([ritual(yday)],now),1,"yesterday still counts until today ends");
assert.equal(countCheckinStreak([ritual(two)],now),0,"missing yesterday breaks streak");
assert.equal(countCheckinStreak([ritual(now),{...ritual(yday),id:"other",label:"Walk"}],now),2,"either real goal can establish daily activity");
assert.equal(countCheckinStreak([{...blank,completedDays:["2026-01-01"]}],now),0,"old unrelated date does not become achievement");
console.log("IOS_RITUAL_FIXTURES 7/7 PASS");
