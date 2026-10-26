"use client";

import {useEffect,useSyncExternalStore,type ReactNode} from "react";

export type SumLanguage="en"|"zh";
const STORAGE_KEY="sum-language";
const CHANGE_EVENT="sum-language-changed";

function readLanguage():SumLanguage{
  try{
    const value=window.localStorage.getItem(STORAGE_KEY);
    if(value==="zh"||value==="en")return value;
    return navigator.language.toLowerCase().startsWith("zh")?"zh":"en";
  }catch{return "en";}
}
function subscribe(callback:()=>void){
  window.addEventListener(CHANGE_EVENT,callback);
  window.addEventListener("storage",callback);
  return ()=>{
    window.removeEventListener(CHANGE_EVENT,callback);
    window.removeEventListener("storage",callback);
  };
}
function english():SumLanguage{return "en";}

export function useSumLanguage():SumLanguage{
  // SSR renders English for hydration consistency, then reads persisted choice.
  return useSyncExternalStore(subscribe,readLanguage,english);
}
export function selectSumLanguage(next:SumLanguage){
  try{window.localStorage.setItem(STORAGE_KEY,next);}
  catch{/* Storage-disabled environments still render the English fallback. */}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function translated(language:SumLanguage,en:string,zh:string){
  return language==="zh"?zh:en;
}
export function SumText({en,zh}:{en:ReactNode;zh:ReactNode}){
  const language=useSumLanguage();
  return <>{language==="zh"?zh:en}</>;
}
export function SumLanguageSwitch({surface="app"}:{
  surface?:"app"|"site";
}){
  const language=useSumLanguage();
  useEffect(()=>{
    document.documentElement.lang=language==="zh"?"zh-CN":"en";
  },[language]);
  return <div className={"sum-language-switch sum-language-switch--"+surface}
    data-testid="sum-language-switch" role="group"
    aria-label="Language / 语言">
    <button type="button" lang="en" data-testid="sum-lang-en"
      aria-label="English" aria-pressed={language==="en"}
      onClick={()=>selectSumLanguage("en")}>EN</button>
    <button type="button" lang="zh-CN" data-testid="sum-lang-zh"
      aria-label="简体中文" aria-pressed={language==="zh"}
      onClick={()=>selectSumLanguage("zh")}>中</button>
  </div>;
}
