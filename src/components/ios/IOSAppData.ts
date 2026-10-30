"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import * as api from "@/lib/api-client";
import {assertFreeTicketSummary,type AccountFreeTicketSummary} from "@/lib/summons/ticket-read-contract";
import {assertOwnedInventorySnapshot,type OwnedInventorySnapshot}
  from "@/lib/summons/owned-inventory-contract";

function message(error: unknown) {
  return error instanceof Error ? error.message : "The connection could not be completed.";
}

const emptyQuests:api.ChallengeData[]=[];

// The API provides a trusted total and pagination. A first-50 sample is never
// an account-wide count. Bound client loading; disclose partial histories.
const OWNED_QUEST_PAGE=50;
const OWNED_QUEST_LIMIT=250;
type OwnedQuestSnapshot={
  scope:string;quests:api.ChallengeData[];total:number|null;
  complete:boolean;error:string;
};
export function useOwnQuests(enabled=true) {
  const {status,data:session}=useSession();
  const userId=session?.user?.id;
  const [revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(value=>value+1),[]);
  const scope=enabled&&status==="authenticated"&&userId?JSON.stringify([userId,revision]):null;
  const [snapshot,setSnapshot]=useState<OwnedQuestSnapshot|null>(null);
  const current=scope&&snapshot?.scope===scope?snapshot:null;
  useEffect(()=>{
    if(!scope)return;
    let active=true;
    void (async()=>{
      try{
        const quests:api.ChallengeData[]=[];
        const seen=new Set<string>();
        let total:number|null=null;
        for(let offset=0;offset<OWNED_QUEST_LIMIT;offset+=OWNED_QUEST_PAGE){
          const data=await api.listChallenges({mine:true,limit:OWNED_QUEST_PAGE,offset});
          if(!active)return;
          if(!Array.isArray(data.challenges)||data.challenges.length>OWNED_QUEST_PAGE)
            throw Error("Quest history returned an invalid page. Refresh to try again.");
          // Legacy clients/mocks may lack 'total': preserve loaded records
          // without claiming completeness, rather than inventing a total.
          if(total===null){
            if(!Number.isSafeInteger(data.total)||data.total<0){
              setSnapshot({scope,quests:data.challenges,total:null,complete:false,error:""});
              return;
            }
            total=data.total;
          }else if(data.total!==total)
            throw Error("Quest history changed during paging. Refresh to verify the complete record.");
          if(offset+data.challenges.length>total)
            throw Error("Quest history contains more rows than its verified total.");
          for(const quest of data.challenges){
            if(!quest||typeof quest.id!=="string"||!quest.id||seen.has(quest.id))
              throw Error("Quest history contains an invalid or duplicate record. Refresh to verify.");
            seen.add(quest.id);quests.push(quest);
          }
          if(quests.length===total)break;
          if(data.challenges.length!==OWNED_QUEST_PAGE)
            throw Error("Quest history returned a shortened page before its verified total.");
        }
        if(active)setSnapshot({scope,quests,total,complete:total!==null&&quests.length===total,error:""});
      }catch(error){
        if(active)setSnapshot({scope,quests:[],total:null,complete:false,error:message(error)});
      }
    })();
    return()=>{active=false;};
  },[scope]);
  // Gate at render time: no previous identity's page or count is ever shown.
  const quests=current?.quests??emptyQuests;
  return {quests,loading:enabled&&(status==="loading"||Boolean(scope&&!current)),
    error:current?.error??"",total:current?.total??null,complete:current?.complete??false,
    loaded:quests.length,refresh,signedIn:status==="authenticated"&&!!userId,userId,scope};
}

export function useOpenQuests(enabled = true) {
  const [quests, setQuests] = useState<api.ChallengeData[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true); setError("");
    api.listChallenges({ status: "open", limit: 50 }).then(data => {
      if (active) { setQuests(data.challenges); setLoading(false); }
    }).catch(err => { if(active) {setLoading(false);setError(message(err));} });
    return () => { active = false; };
  }, [enabled,revision]);
  return { quests, loading, error, refresh };
}

export function useQuest(id:string|undefined) {
  const {status,data:session}=useSession();
  const [revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(value=>value+1),[]);
  const scope=id&&status!=="loading"?JSON.stringify([id,status,session?.user?.id??null,revision]):null;
  const [snapshot,setSnapshot]=useState<{scope:string;quest:api.ChallengeData|null;error:string}|null>(null);
  const current=scope&&snapshot?.scope===scope?snapshot:null;
  useEffect(()=>{
    if(!scope||!id)return;
    let active=true;
    api.getChallenge(id).then(data=>{
      if(active)setSnapshot({scope,quest:data.challenge,error:""});
    }).catch(error=>{if(active)setSnapshot({scope,quest:null,error:message(error)});});
    return()=>{active=false;};
  },[id,scope]);
  return {quest:current?.quest??null,loading:!!id&&(status==="loading"||!current),error:current?.error??"",refresh};
}

export function usePublicActivity(enabled = true) {
  const [events,setEvents] = useState<api.ActivityEventData[]>([]);
  const [loading,setLoading] = useState(enabled);
  const [error,setError] = useState("");
  const [revision,setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value=>value+1),[]);
  useEffect(() => {
    if (!enabled) return;
    let active=true;setLoading(true);setError("");
    api.getFeed(30).then(data => {
      if(active) {setEvents(data.events);setLoading(false);}
    }).catch(err=>{if(active){setError(message(err));setLoading(false);}});
    return ()=>{active=false;};
  },[enabled,revision]);
  return {events,loading,error,refresh};
}

export function useCreditBalance(enabled=true) {
  const {status,data:session}=useSession();
  const userId=session?.user?.id;
  const scope=enabled&&status==="authenticated"&&userId?userId:null;
  const [snapshot,setSnapshot]=useState<{scope:string;credits:number|null;error:string}|null>(null);
  const current=scope&&snapshot?.scope===scope?snapshot:null;
  useEffect(()=>{
    if(!scope)return;
    let active=true;
    api.getTokenStatus().then(data=>{if(active)setSnapshot({scope,credits:data.offChain.credits,error:""});})
      .catch(error=>{if(active)setSnapshot({scope,credits:null,error:message(error)});});
    return()=>{active=false;};
  },[scope]);
  return {credits:current?.credits??null,loading:enabled&&(status==="loading"||Boolean(scope&&!current)),error:current?.error??""};
}

type GalleryEvidence={id:string;type:string;url:string|null;description:string|null;createdAt:string;questId:string;questTitle:string};
const emptyEvidence:GalleryEvidence[]=[];
export function useEvidenceGallery(enabled=true) {
  const mine=useOwnQuests(enabled);
  const [detailLimit,setDetailLimit]=useState(20);
  const loadMore=useCallback(()=>setDetailLimit(value=>Math.min(OWNED_QUEST_LIMIT,value+20)),[]);
  const candidates=mine.quests.filter(q=>Boolean(q._count?.evidence));
  const visible=candidates.slice(0,detailLimit);
  const [snapshot,setSnapshot]=useState<{scope:string;limit:number;evidence:GalleryEvidence[];
    error:string}|null>(null);
  const current=mine.scope&&snapshot?.scope===mine.scope&&snapshot.limit===visible.length&&!mine.loading?snapshot:null;
  useEffect(()=>{
    const scope=mine.scope;
    if(!enabled||!scope||mine.loading||mine.error||!mine.userId)return;
    let active=true;
    const refs=mine.quests.filter(q=>Boolean(q._count?.evidence)).slice(0,detailLimit);
    if(!refs.length){
      setSnapshot({scope,limit:0,evidence:[],error:""});
      return()=>{active=false;};
    }
    // The personal gallery must never show an opponent's evidence merely
    // because the current player can read the shared Quest room.
    Promise.allSettled(refs.map(q=>api.getChallenge(q.id))).then(results=>{
      if(!active)return;
      const rows=results.flatMap(result=>result.status==="fulfilled"?
        (result.value.challenge.evidence||[]).filter(ev=>ev.userId===mine.userId).map(ev=>({
          id:ev.id,type:ev.type,url:ev.url,description:ev.description,
          createdAt:ev.createdAt,questId:result.value.challenge.id,questTitle:result.value.challenge.title
        })):[]);
      const failures=results.filter(result=>result.status==="rejected").length;
      setSnapshot({scope,limit:refs.length,
        evidence:rows.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)),
        error:failures?failures+" Quest proof reads could not be loaded. Retry to check your full personal record.":""});
    });
    return()=>{active=false;};
  },[enabled,mine.scope,mine.loading,mine.error,mine.quests,mine.userId,detailLimit]);
  return {...mine,evidence:current?.evidence??emptyEvidence,
    loading:enabled&&(mine.loading||Boolean(mine.scope&&!current&&!mine.error)),
    error:current?.error||mine.error,
    evidenceCoverage:{checked:visible.length,eligible:candidates.length},
    hasMoreEvidence:candidates.length>visible.length,
    loadMore};
}

export type StarterPicoEntitlement = {
  speciesId:"pico";name:"Pico";initialForEveryAccount:true;
  persistedInventory:boolean;inventoryId?:string|null;
  tradable:false;supportsFusion:false;
  awardedXp:null;awardedTickets:null;
  basis:"authenticated-account-rule";note:string;
};

export type RecordedProfessionXp = {
  source:"verified-quest-receipts";ruleVersion:string;
  coverage:"partial-since-ledger-activation";completeHistory:false;
  totalRecordedXp:number;receiptCount:number;
  byProfession:Array<{professionId:string;recordedXp:number;receiptCount:number}>;
};
export type SummonProgression = {
  available:boolean;verifiedProfessionXp:RecordedProfessionXp|null;
  summonTickets:AccountFreeTicketSummary|null;freeDrawsAvailable:boolean;
  evolutionAvailable:boolean;reason:string;
};

/** Reads authenticated, server-backed Pico/XP records; never creates XP. */
export function useStarterPico(enabled=true){
  const {status,data:session}=useSession();
  const userId=session?.user?.id;
  const [starter,setStarter]=useState<StarterPicoEntitlement|null>(null);
  const [progression,setProgression]=useState<SummonProgression|null>(null);
  const [inventory,setInventory]=useState<OwnedInventorySnapshot|null>(null);
  const [revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(count=>count+1),[]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const scope=enabled&&status==="authenticated"&&userId?JSON.stringify([userId,revision]):null;
  const [loadedScope,setLoadedScope]=useState<string|null>(null);
  useEffect(()=>{
    if(!enabled){setStarter(null);setProgression(null);setInventory(null);setLoading(false);setError("");return;}
    if(status==="loading"){setLoading(true);return;}
    if(status!=="authenticated"||!userId){
      setStarter(null);setProgression(null);setInventory(null);setLoading(false);setError("");return;
    }
    let active=true;const controller=new AbortController();
    setStarter(null);setProgression(null);setInventory(null);setLoading(true);setError("");
    fetch("/api/summons/me",{credentials:"same-origin",cache:"no-store",signal:controller.signal})
      .then(async response=>{
        if(!response.ok)throw Error("Starter service returned "+response.status);
        const data=await response.json() as {
          starter?:StarterPicoEntitlement;
          inventory?:{available:boolean};
          ownedCollection?:unknown;
          progression?:SummonProgression;
        };
        if(!data.starter||data.starter.speciesId!=="pico"||
           typeof data.starter.persistedInventory!=="boolean")
          throw Error("Invalid starter response");
        const snapshot=assertOwnedInventorySnapshot(data.ownedCollection);
        const progression=data.progression;
        if(!progression||typeof progression.available!=="boolean"||
           typeof progression.freeDrawsAvailable!=="boolean"||
           typeof progression.evolutionAvailable!=="boolean"||
           (progression.evolutionAvailable&&(!snapshot.available||
             !progression.freeDrawsAvailable))||
           (progression.freeDrawsAvailable&&(!progression.available||progression.summonTickets===null))||
           (progression.summonTickets!==null&&!progression.available)||
           (progression.verifiedProfessionXp!==null&&!progression.available))
          throw Error("Invalid account progression response");
        assertFreeTicketSummary(progression.summonTickets);
        const xp=progression.verifiedProfessionXp;
        if(xp){
          if(xp.source!=="verified-quest-receipts"||
             xp.coverage!=="partial-since-ledger-activation"||
             xp.completeHistory!==false||
             !Number.isSafeInteger(xp.totalRecordedXp)||xp.totalRecordedXp<0||
             !Number.isSafeInteger(xp.receiptCount)||xp.receiptCount<1||
             !Array.isArray(xp.byProfession)||xp.byProfession.length===0||
             xp.byProfession.reduce((n,p)=>n+p.recordedXp,0)!==xp.totalRecordedXp||
             xp.byProfession.reduce((n,p)=>n+p.receiptCount,0)!==xp.receiptCount||
             xp.byProfession.some(p=>!p.professionId||
               !Number.isSafeInteger(p.recordedXp)||p.recordedXp<0||
               !Number.isSafeInteger(p.receiptCount)||p.receiptCount<1))
            throw Error("Invalid audited XP receipt totals");
        }
        if(!active)return;
        let starter=data.starter;
        if(data.inventory?.available&&!starter.persistedInventory){
          // The server advertises persistence only after its schema flag is
          // enabled. Existing accounts converge on one Pico via idempotent POST.
          const grant=await fetch("/api/summons/starter/claim",{
            method:"POST",credentials:"same-origin",cache:"no-store",
            signal:controller.signal,
          });
          if(!grant.ok)throw Error("Pico activation returned "+grant.status);
          const payload=await grant.json() as {starter?:StarterPicoEntitlement};
          if(payload.starter?.speciesId!=="pico"||
             payload.starter.persistedInventory!==true||
             !payload.starter.inventoryId)
            throw Error("Invalid Pico activation result");
          starter=payload.starter;
        }
        if(starter.persistedInventory&&!starter.inventoryId)
          throw Error("Starter persistence has no verified item");
        if(active){setStarter(starter);setProgression(progression);
          setInventory(snapshot);setLoading(false);setLoadedScope(scope);}
      }).catch(err=>{
        if(active){setError(message(err));setLoading(false);setLoadedScope(scope);}
      });
    return ()=>{active=false;controller.abort();};
  },[enabled,status,userId,revision,scope]);
  const current=!!scope&&loadedScope===scope;
  return {starter:current?starter:null,progression:current?progression:null,inventory:current?inventory:null,
    loading:enabled&&(status==="loading"||Boolean(scope&&(!current||loading))),
    error:current?error:"",signedIn:status==="authenticated"&&!!userId,refresh};
}
