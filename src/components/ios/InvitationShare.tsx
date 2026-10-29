"use client";

import {useEffect,useId,useRef,useState} from "react";
import {useSession} from "next-auth/react";
import {useSumLanguage,translated} from "@/components/locale/SumLanguage";

type Props={id:string;kind:"quest"|"quiz";title:string;label:string;labelZh:string;testId?:string};
/** Sharing never joins a Quest or proves that another person accepted it. */
export default function InvitationShare(props:Props){
  const {data:session}=useSession();
  return <InvitationShareState key={JSON.stringify([props.kind,props.id,session?.user?.id??null])} {...props}/>;
}
function InvitationShareState({id,kind,title,label,labelZh,testId}:Props){
  const language=useSumLanguage();const t=(en:string,zh:string)=>translated(language,en,zh);
  const [outcome,setOutcome]=useState<"idle"|"copied"|"shared">("idle");
  const [pending,setPending]=useState(false),[manual,setManual]=useState(false),[url,setUrl]=useState("");
  const owner=useRef(false),mounted=useRef(true),trigger=useRef<HTMLButtonElement>(null);
  const dialog=useRef<HTMLDialogElement>(null),field=useRef<HTMLInputElement>(null);const heading=useId(),fieldId=useId();
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    const node=dialog.current;if(!node)return;
    if(manual&&!node.open){node.showModal();field.current?.focus();field.current?.select();}
    else if(!manual&&node.open)node.close();
  },[manual]);
  function close(){setManual(false);trigger.current?.focus();}
  async function send(copyOnly=false){
    if(owner.current||!mounted.current||!/^[-A-Za-z0-9_]{1,128}$/.test(id))return;
    owner.current=true;setPending(true);setOutcome("idle");
    const link=new URL('/app/'+(kind==="quest"?"join":"quiz")+'?'+new URLSearchParams({id}),window.location.origin).href;
    setUrl(link);
    try{
      if(!copyOnly&&typeof navigator.share==="function"){
        try{await navigator.share({title,url:link});if(mounted.current)setOutcome("shared");return;}
        catch(error){if((error as {name?:string})?.name==="AbortError")return;}
      }
      if(!mounted.current)return;
      try{
        if(!navigator.clipboard?.writeText)throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(link);
        if(mounted.current)setOutcome("copied");
      }catch{if(mounted.current)setManual(true);}
    }finally{owner.current=false;if(mounted.current)setPending(false);}
  }
  return <div className="ios-invitation-share">
    <button ref={trigger} type="button" className="ios-secondary-button" data-testid={testId}
      disabled={pending} aria-label={t(label,labelZh)} aria-busy={pending} onClick={()=>void send()}>
      {pending?t("Opening share options…","正在打开分享选项…"):t(label,labelZh)}
    </button>
    <p role="status" aria-live="polite" data-testid="invitation-share-status" className="ios-invitation-share__status">
      {outcome==="copied"?t("Invitation link copied.","邀请链接已复制。"):outcome==="shared"?t("Share action completed.","分享操作已完成。"):""}
    </p>
    <dialog ref={dialog} className="ios-invitation-dialog" aria-labelledby={heading} onCancel={close} onClose={close}>
      <h2 id={heading}>{t("Invitation link","邀请链接")}</h2>
      <p>{t("Sharing or clipboard access is unavailable. Copy this link manually and send it to your friend.","暂时无法使用系统分享或剪贴板。请手动复制链接，再发送给朋友。")}</p>
      <label htmlFor={fieldId}>{t("Invitation URL","邀请网址")}</label>
      <input id={fieldId} ref={field} type="url" readOnly value={url} onFocus={event=>event.currentTarget.select()}/>
      <p className="ios-invitation-dialog__hint">{t("Your friend still needs their own account and must accept the actual rules. Sharing does not create a player or change credits.","朋友仍须使用自己的账号，并接受实际规则。分享不会自动加入玩家或变动积分。")}</p>
      <div className="ios-invitation-dialog__actions">
        <button className="ios-secondary-button" type="button" disabled={pending} onClick={()=>void send(true)}>{t("Try copying again","再次尝试复制")}</button>
        <button className="ios-primary" type="button" onClick={close}>{t("Close","关闭")}</button>
      </div>
      {outcome==="copied"&&<p role="status">{t("Invitation link copied.","邀请链接已复制。")}</p>}
    </dialog>
  </div>;
}
