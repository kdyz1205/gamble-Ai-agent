"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {useSession} from "next-auth/react";
import {IosIcon} from "./IOSAppUI";
import {SumText,useSumLanguage,translated} from "@/components/locale/SumLanguage";

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

// Every row is scoped before render: a session change can never reuse another
// account's stored goals for one paint while a loading effect is pending.
const emptyRituals:DeviceRitual[]=[];
type RitualSnapshot={key:string;rituals:DeviceRitual[]};
export function useDeviceRituals() {
  const {data:session,status}=useSession();
  const accountId=status==="loading"?null:
    status==="authenticated"?session?.user?.id??null:"guest";
  const key=accountId?"sum-ios-daily-v1:"+accountId:null;
  const [snapshot,setSnapshot]=useState<RitualSnapshot|null>(null);
  const ready=!!key&&snapshot?.key===key;
  const rituals=ready?snapshot.rituals:emptyRituals;
  useEffect(()=>{
    if(!key){setSnapshot(null);return;}
    let active=true;
    const sync=()=>{if(active)setSnapshot({key,rituals:read(key)});};
    const onStorage=(event:StorageEvent)=>{if(event.key===key||event.key===null)sync();};
    const onLocal=(event:Event)=>{
      if(event instanceof CustomEvent&&event.detail?.key===key)sync();
    };
    sync();
    window.addEventListener("storage",onStorage);
    window.addEventListener("sum-ios-daily-updated",onLocal);
    return()=>{active=false;window.removeEventListener("storage",onStorage);
      window.removeEventListener("sum-ios-daily-updated",onLocal);};
  },[key]);
  // Read the latest saved value synchronously when mutating. Two actions in
  // the same React event turn cannot accidentally replace one another.
  const update=useCallback((change:(current:DeviceRitual[])=>DeviceRitual[]|null)=>{
    if(!ready||!key)return false;
    const next=change(read(key));
    if(!next)return false;
    try{localStorage.setItem(key,JSON.stringify(next));}
    catch{return false;}
    setSnapshot({key,rituals:next});
    window.dispatchEvent(new CustomEvent("sum-ios-daily-updated",{detail:{key}}));
    return true;
  },[key,ready]);
  const add=useCallback((label:string)=>{
    const value=label.trim().replace(/\s+/g," ").slice(0,80);
    if(value.length<2)return false;
    return update(current=>{
      if(current.length>=25||current.some(h=>h.label.toLowerCase()===value.toLowerCase()))return null;
      const id=typeof crypto!=="undefined"&&"randomUUID" in crypto?
        crypto.randomUUID():String(Date.now())+"_"+Math.random().toString(36).slice(2);
      return [...current,{id,label:value,createdAt:new Date().toISOString(),completedDays:[]}];
    });
  },[update]);
  const toggle=useCallback((id:string)=>update(current=>{
    if(!current.some(h=>h.id===id))return null;
    const today=localDay();
    return current.map(h=>{
      if(h.id!==id)return h;
      const already=h.completedDays.includes(today);
      return {...h,completedDays:already?h.completedDays.filter(d=>d!==today):
        [...h.completedDays,today].slice(-365)};
    });
  }),[update]);
  const remove=useCallback((id:string)=>update(current=>
    current.some(h=>h.id===id)?current.filter(h=>h.id!==id):null),[update]);
  const done=rituals.filter(h=>h.completedDays.includes(localDay())).length;
  const streak=useMemo(()=>countCheckinStreak(rituals),[rituals]);
  return {scope:key,rituals,ready,add,toggle,remove,done,streak};
}

export default function IOSDailyRituals() {
  const state=useDeviceRituals();
  // Form input is account-private too: switching identity must not carry an
  // unsent goal label or validation feedback into a different user's editor.
  return <DailyRitualPanel key={state.scope??"session-pending"} {...state}/>;
}

function DailyRitualPanel({rituals,ready,add,toggle,remove,done,streak}:ReturnType<typeof useDeviceRituals>){
  const language=useSumLanguage();
  const t=(en:string,zh:string)=>translated(language,en,zh);
  const [editing,setEditing]=useState(false);
  const [label,setLabel]=useState("");
  const [error,setError]=useState("");
  const addNow=(value:string)=>{
    if(add(value)){setEditing(false);setLabel("");setError("");}
    else setError(t("Choose a unique goal of 2–80 characters (up to 25 goals), and enable device storage.",
      "请输入2至80字的不重复目标（最多25项），并确认设备存储可用。"));
  };
  return <section className="ios-daily-rituals" data-testid="ios-daily-rituals">
    <div className="ios-section__heading">
      <div><small><SumText en="ON-DEVICE CHECK-INS" zh="设备内打卡"/></small>
        <h2><SumText en="A little step today" zh="今天的小目标"/></h2></div>
      <button type="button" className="ios-text-action"
        aria-label={editing?t("Cancel","取消"):t("Add daily goal","添加每日目标")}
        disabled={!ready}
        onClick={()=>{setEditing(value=>!value);setLabel("");setError("");}}>
        {editing?t("Cancel","取消"):t("+ Add","+ 添加")}
      </button>
    </div>
    {!ready&&<p role="status" className="ios-message">
      <SumText en="Checking this account’s device goals…" zh="正在读取当前账号的设备目标…"/></p>}
    {ready&&rituals.length>0&&
      <div className="ios-ritual-progress">
        <div><strong>{done}/{rituals.length}</strong><span>
          <SumText en="checked in today" zh="今天已打卡"/></span></div>
        <small>{language==="zh"?`连续打卡 ${streak} 天`:
          `${streak} day${streak===1?"":"s"} with consecutive check-ins`}</small>
        <div className="ios-ritual-progress__bar"><span style={{width:Math.round(done/rituals.length*100)+"%"}}/></div>
      </div>}
    {ready&&editing&&<form className="ios-ritual-add" onSubmit={e=>{e.preventDefault();addNow(label);}}>
      <label htmlFor="ios-new-ritual"><SumText en="Create a daily goal" zh="创建每日目标"/></label>
      <input id="ios-new-ritual" value={label} onChange={e=>setLabel(e.target.value)} maxLength={80}
        placeholder={t("e.g. Read for 10 minutes","例如：阅读十分钟")}/>
      <button type="submit" className="ios-primary" disabled={label.trim().length<2}>
        <SumText en="Save goal" zh="保存目标"/></button>
      <div className="ios-ritual-examples"><small><SumText en="Ideas:" zh="建议："/></small>
        {[
          ["Read 10 minutes","阅读十分钟"],
          ["Draw something","画一幅画"],
          ["Be kind to someone","善待他人"]
        ].map(([en,zh])=><button type="button" key={en}
          onClick={()=>addNow(t(en,zh))}>{t(en,zh)}</button>)}
      </div>
    </form>}
    {error&&<p role="alert" className="ios-message ios-message--error">{error}</p>}
    {ready&&!editing&&rituals.length===0&&<p className="ios-message">
      <SumText en="Your goals will appear here. Add one for real check-ins on this device."
        zh="目标将显示在这里。添加一项，开始在此设备上记录真实打卡。"/></p>}
    {ready&&<div className="ios-ritual-list">{rituals.map(h=>{
      const checked=h.completedDays.includes(localDay());
      return <div className={"ios-ritual"+(checked?" is-done":"")} key={h.id}>
        <button type="button" className="ios-ritual__toggle"
          aria-label={checked?t("Mark "+h.label+" incomplete","将 "+h.label+" 标记为未完成"):
            t("Mark "+h.label+" complete","将 "+h.label+" 标记为完成")}
          aria-pressed={checked} onClick={()=>{if(!toggle(h.id))setError(t("Could not save the check-in on this device.","无法在当前设备保存打卡。"));}}>
          {checked?<IosIcon name="check" size={20}/>:<span className="ios-ritual__empty"/>}
        </button>
        <span><strong>{h.label}</strong><small>{checked?
          t("Checked in today","今天已完成"):t("Not checked in yet","今天尚未完成")}</small></span>
        <button type="button" className="ios-ritual__remove"
          aria-label={t("Remove "+h.label,"删除 "+h.label)}
          onClick={()=>{if(!remove(h.id))setError(t("Could not remove this goal.","无法删除此目标。"));}}>×</button>
      </div>;
    })}</div>}
    <p className="ios-footer-note"><SumText
      en="These check-ins exist only on this device. They never submit Quest evidence, certify results, change credits or sync between devices."
      zh="这些打卡仅存储在当前设备，不会提交 Quest 证据、认证结果、变动积分或跨设备同步。"/></p>
  </section>;
}
