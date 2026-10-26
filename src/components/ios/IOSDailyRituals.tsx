"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {useSession} from "next-auth/react";
import {IosIcon} from "./IOSAppUI";

export type DeviceRitual={
  id:string;label:string;createdAt:string;completedDays:string[];
};

export function localDay(date=new Date()) {
  const yr=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,"0"),day=String(date.getDate()).padStart(2,"0");
  return yr+"-"+month+"-"+day;
}
function isValid(value:unknown):value is DeviceRitual {
  if(!value || typeof value!=="object")return false;
  const habit=value as Record<string,unknown>;
  return typeof habit.id==="string" && typeof habit.label==="string" && habit.label.length<=100 &&
    typeof habit.createdAt==="string" && Array.isArray(habit.completedDays) &&
    habit.completedDays.every(x=>typeof x==="string" && /^\d{4}-\d\d-\d\d$/.test(x));
}
function read(key:string):DeviceRitual[]{
  try {
    const data=JSON.parse(localStorage.getItem(key)||"[]") as unknown;
    return Array.isArray(data)?data.filter(isValid).slice(0,25):[];
  }catch{return [];}
}
export function countCheckinStreak(rituals:DeviceRitual[],day=new Date()) {
  let count=0;
  const cursor=new Date(day);cursor.setHours(12,0,0,0);
  // If today has no check-in, a streak last active yesterday remains visible.
  if(!rituals.some(h=>h.completedDays.includes(localDay(cursor))))cursor.setDate(cursor.getDate()-1);
  for(let i=0;i<365;i++){
    const stamp=localDay(cursor);
    if(!rituals.some(h=>h.completedDays.includes(stamp)))break;
    count++;
    cursor.setDate(cursor.getDate()-1);
  }
  return count;
}

export function useDeviceRituals() {
  const {data:session,status}=useSession();
  const accountId=status==="authenticated"&&session?.user?.id?session.user.id:"guest";
  const key="sum-ios-daily-v1:"+accountId;
  const [rituals,setRituals]=useState<DeviceRitual[]>([]);
  const [ready,setReady]=useState(false);
  useEffect(()=>{setRituals(read(key));setReady(true);},[key]);
  const update=useCallback((next:DeviceRitual[])=>{
    try {localStorage.setItem(key,JSON.stringify(next));}catch {}
    setRituals(next);
    window.dispatchEvent(new Event("sum-ios-daily-updated"));
  },[key]);
  const add=useCallback((label:string)=>{
    const text=label.trim().replace(/\s+/g," ").slice(0,80);
    if(text.length<2 || rituals.length>=25 || rituals.some(h=>h.label.toLowerCase()===text.toLowerCase()))return false;
    const id=typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():String(Date.now())+"_"+Math.random().toString(36).slice(2);
    update([...rituals,{id,label:text,createdAt:new Date().toISOString(),completedDays:[]}]);
    return true;
  },[rituals,update]);
  const toggle=useCallback((id:string)=>{
    const today=localDay();
    update(rituals.map(h=>{
      if(h.id!==id)return h;
      const already=h.completedDays.includes(today);
      return {...h,completedDays:already?h.completedDays.filter(d=>d!==today):[...h.completedDays,today].slice(-365)};
    }));
  },[rituals,update]);
  const remove=useCallback((id:string)=>{update(rituals.filter(h=>h.id!==id));},[rituals,update]);
  const done=rituals.filter(h=>h.completedDays.includes(localDay())).length;
  const streak=useMemo(()=>countCheckinStreak(rituals),[rituals]);
  return {rituals,ready,add,toggle,remove,done,streak};
}

export default function IOSDailyRituals() {
  const {rituals,ready,add,toggle,remove,done,streak}=useDeviceRituals();
  const [editing,setEditing]=useState(false);
  const [label,setLabel]=useState("");
  const [error,setError]=useState("");
  const addNow=(text:string)=>{
    if(add(text)){setEditing(false);setLabel("");setError("");}
    else setError("Use a unique goal name of 2–80 characters (up to 25 goals).");
  };
  return <section className="ios-daily-rituals" data-testid="ios-daily-rituals">
    <div className="ios-section__heading">
      <div><small>YOUR ON-DEVICE DAILY CHECK-INS</small><h2>A little step today</h2></div>
      <button type="button" className="ios-text-action" onClick={()=>setEditing(e=>!e)}>+ Add</button>
    </div>
    {ready && rituals.length>0 &&
      <div className="ios-ritual-progress"><div><strong>{done}/{rituals.length}</strong><span>checked in today</span></div><small>{streak} day{streak===1?"":"s"} with consecutive check-ins</small>
        <div className="ios-ritual-progress__bar"><span style={{width:Math.round(done/rituals.length*100)+"%"}}/></div>
      </div>}
    {editing&&<form className="ios-ritual-add" onSubmit={e=>{e.preventDefault();addNow(label);}}>
      <label htmlFor="ios-new-ritual">Create a daily goal</label>
      <input id="ios-new-ritual" value={label} onChange={e=>setLabel(e.target.value)} maxLength={80}
        placeholder="e.g. Read for 10 minutes"/>
      <button type="submit" className="ios-primary" disabled={label.trim().length<2}>Add goal</button>
      <div className="ios-ritual-examples"><small>Ideas:</small>
        {["Read 10 minutes","Draw something","Be kind to someone"].map(example=><button type="button" key={example} onClick={()=>addNow(example)}>{example}</button>)}
      </div>
      {error&&<p role="alert" className="ios-message ios-message--error">{error}</p>}
    </form>}
    {!editing&&rituals.length===0&&<p className="ios-message">Your daily goals will appear here. Add one to start tracking real check-ins on this device.</p>}
    <div className="ios-ritual-list">{rituals.map(h=>{
      const checked=h.completedDays.includes(localDay());
      return <div className={"ios-ritual"+(checked?" is-done":"")} key={h.id}>
        <button type="button" className="ios-ritual__toggle" aria-label={"Mark "+h.label+(checked?" incomplete":" complete")} aria-pressed={checked} onClick={()=>toggle(h.id)}>
          {checked?<IosIcon name="check" size={20}/>:<span className="ios-ritual__empty"/>}
        </button>
        <span><strong>{h.label}</strong><small>{checked?"Checked in today":"Not checked in yet"}</small></span>
        <button type="button" className="ios-ritual__remove" aria-label={"Remove "+h.label} onClick={()=>remove(h.id)}>×</button>
      </div>;
    })}</div>
    <p className="ios-footer-note">These check-ins are stored only on this device. They do not submit Quest evidence, certify results, add credits or sync between devices.</p>
  </section>;
}
