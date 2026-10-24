"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import * as api from "@/lib/api-client";

function message(error: unknown) {
  return error instanceof Error ? error.message : "The connection could not be completed.";
}

export function useOwnQuests(enabled = true) {
  const { status, data: session } = useSession();
  const userId = session?.user?.id;
  const [quests, setQuests] = useState<api.ChallengeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true;
    if (!enabled) { return () => { active = false; }; }
    if (status === "loading") return () => { active = false; };
    if (status !== "authenticated" || !userId) {
      setQuests([]); setLoading(false); setError("");
      return () => { active = false; };
    }
    setQuests([]); setLoading(true); setError("");
    api.listChallenges({ mine: true, limit: 50 }).then(data => {
      if (active) { setQuests(data.challenges); setLoading(false); }
    }).catch(err => {
      if (active) { setLoading(false); setError(message(err)); }
    });
    return () => { active = false; };
  }, [enabled, revision, status, userId]);
  return { quests, loading: enabled && (loading || status === "loading"), error, refresh, signedIn: status === "authenticated" && !!userId, userId };
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

export function useQuest(id: string | undefined) {
  const [quest, setQuest] = useState<api.ChallengeData | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!id) { setQuest(null);setLoading(false);setError("");return; }
    let active = true;
    setQuest(null);setLoading(true);setError("");
    api.getChallenge(id).then(data => {
      if (active) {setQuest(data.challenge);setLoading(false);}
    }).catch(err => {
      if (active) {setLoading(false);setError(message(err));}
    });
    return () => {active=false;};
  }, [id,revision]);
  return {quest,loading,error,refresh};
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

export function useCreditBalance(enabled = true) {
  const {status,data:session} = useSession();
  const userId = session?.user?.id;
  const [credits,setCredits] = useState<number|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  useEffect(()=>{
    if(!enabled) return;
    let active=true;
    if(status==="loading") return ()=>{active=false;};
    if(status!=="authenticated"||!userId){
      setCredits(null);setLoading(false);setError("");return ()=>{active=false;};
    }
    setCredits(null);setLoading(true);setError("");
    api.getTokenStatus().then(data=>{
      if(active){setCredits(data.offChain.credits);setLoading(false);}
    }).catch(err=>{if(active){setError(message(err));setLoading(false);}});
    return ()=>{active=false;};
  },[enabled,status,userId]);
  return {credits,loading,error};
}

export function useEvidenceGallery(enabled = true) {
  const mine=useOwnQuests(enabled);
  const [evidence,setEvidence]=useState<Array<{
    id:string;type:string;url:string|null;description:string|null;createdAt:string;questId:string;questTitle:string;
  }>>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    if(!enabled) return;
    let active=true;
    if(mine.loading) return ()=>{active=false;};
    if(!mine.signedIn || mine.error || mine.quests.length===0) {
      setEvidence([]);setLoading(false);setError(mine.error);return ()=>{active=false;};
    }
    // Detail endpoint authorizes proof access; the public list never does.
    const refs=mine.quests.filter(q=>q._count?.evidence).slice(0,20);
    if(refs.length===0) {setEvidence([]);setLoading(false);return ()=>{active=false;};}
    setLoading(true);setError("");
    Promise.allSettled(refs.map(q=>api.getChallenge(q.id))).then(results=>{
      if(!active) return;
      const rows=results.flatMap(result=>result.status==="fulfilled"?
        (result.value.challenge.evidence||[]).map(ev=>({
          id:ev.id,type:ev.type,url:ev.url,description:ev.description,
          createdAt:ev.createdAt,questId:result.value.challenge.id,questTitle:result.value.challenge.title
        })) : []);
      setEvidence(rows.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)));
      setLoading(false);
      if(results.every(x=>x.status==="rejected"))setError("Your proof could not be loaded. Try again from its private Quest room.");
    });
    return ()=>{active=false;};
  },[enabled,mine.loading,mine.error,mine.signedIn,mine.quests]);
  return {...mine,evidence,loading:mine.loading||loading,error:error||mine.error};
}

export type StarterPicoEntitlement = {
  speciesId:"pico";name:"Pico";initialForEveryAccount:true;
  persistedInventory:boolean;inventoryId?:string|null;
  tradable:false;supportsFusion:false;
  awardedXp:null;awardedTickets:null;
  basis:"authenticated-account-rule";note:string;
};

/** Reads an authenticated Pico rule, not an inventory/credit/XP grant. */
export function useStarterPico(enabled=true){
  const {status,data:session}=useSession();
  const userId=session?.user?.id;
  const [starter,setStarter]=useState<StarterPicoEntitlement|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    if(!enabled){setStarter(null);setLoading(false);setError("");return;}
    if(status==="loading"){setLoading(true);return;}
    if(status!=="authenticated"||!userId){
      setStarter(null);setLoading(false);setError("");return;
    }
    let active=true;const controller=new AbortController();
    setStarter(null);setLoading(true);setError("");
    fetch("/api/summons/me",{credentials:"same-origin",cache:"no-store",signal:controller.signal})
      .then(async response=>{
        if(!response.ok)throw Error("Starter service returned "+response.status);
        const data=await response.json() as {
          starter?:StarterPicoEntitlement;
          inventory?:{available:boolean};
        };
        if(!data.starter||data.starter.speciesId!=="pico"||
           typeof data.starter.persistedInventory!=="boolean")
          throw Error("Invalid starter response");
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
        if(active){setStarter(starter);setLoading(false);}
      }).catch(err=>{
        if(active){setError(message(err));setLoading(false);}
      });
    return ()=>{active=false;controller.abort();};
  },[enabled,status,userId]);
  return {starter,loading:enabled&&(loading||status==="loading"),
    error,signedIn:status==="authenticated"&&!!userId};
}
