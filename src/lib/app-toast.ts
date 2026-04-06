/** Lightweight cross-component toasts (no extra dependency). */
export const APP_TOAST_EVENT = "challengeai-toast";

export function emitAppToast(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APP_TOAST_EVENT, { detail: { message } }));
}
