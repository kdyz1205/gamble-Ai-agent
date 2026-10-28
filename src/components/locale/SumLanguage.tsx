"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";

export type SumLanguage = "en" | "zh";
const STORAGE_KEY = "sum-language";
const CHANGE_EVENT = "sum-language-changed";
// A page-local fallback only: never an account/session/ledger preference.
let transientChoice: SumLanguage | null = null;
let documentBindings = 0;
function valid(value: unknown): SumLanguage | null {
  return value === "zh" || value === "en" ? value : null;
}
function browserDefault(): SumLanguage {
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}
function readLanguage(): SumLanguage {
  if (typeof window === "undefined") return "en";
  if (transientChoice) return transientChoice;
  try { return valid(window.localStorage.getItem(STORAGE_KEY)) ?? browserDefault(); }
  catch { return browserDefault(); }
}
function subscribe(callback: () => void) {
  const storageChanged = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    transientChoice = null;
    callback();
  };
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", storageChanged);
  window.addEventListener("languagechange", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", storageChanged);
    window.removeEventListener("languagechange", callback);
  };
}
function serverLanguage(): SumLanguage { return "en"; }
export function useSumLanguage(): SumLanguage {
  return useSyncExternalStore(subscribe, readLanguage, serverLanguage);
}
export function selectSumLanguage(next: SumLanguage): void {
  if (!valid(next) || typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, next); transientChoice = null; }
  catch { transientChoice = next; }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function translated(language: SumLanguage, en: string, zh: string): string {
  return language === "zh" ? zh : en;
}
export function SumText({ en, zh }: { en: ReactNode; zh: ReactNode }) {
  const language = useSumLanguage();
  return <>{language === "zh" ? zh : en}</>;
}
export function SumLanguageSwitch({ surface = "app" }: { surface?: "app" | "site" | "auth" }) {
  const language = useSumLanguage();
  useEffect(() => {
    documentBindings++;
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    return () => {
      documentBindings--;
      document.documentElement.lang = documentBindings > 0 && readLanguage() === "zh" ? "zh-CN" : "en";
    };
  }, [language]);
  return <div className={"sum-language-switch sum-language-switch--" + surface}
    data-testid="sum-language-switch" role="group" aria-label="Language / 语言">
    <button type="button" lang="en" data-testid="sum-lang-en" aria-label="English"
      aria-pressed={language === "en"} onClick={() => selectSumLanguage("en")}>EN</button>
    <button type="button" lang="zh-CN" data-testid="sum-lang-zh" aria-label="简体中文"
      aria-pressed={language === "zh"} onClick={() => selectSumLanguage("zh")}>中</button>
  </div>;
}
