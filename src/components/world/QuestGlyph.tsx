interface QuestGlyphProps {
  className?: string;
  kind: "spark" | "friends" | "proof" | "receipt" | "voice" | "rules";
}

export default function QuestGlyph({ className = "h-5 w-5", kind }: QuestGlyphProps) {
  if (kind === "friends") {
    return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="17" cy="10" r="2.5" stroke="currentColor" strokeWidth="2"/><path d="M3.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M14 14c3.5-.5 5.6 1.1 6.3 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2"/></svg>;
  }
  if (kind === "proof") {
    return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="4" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="2"/><path d="M8 5l1.2-2h5.6L16 5" stroke="currentColor" strokeLinecap="round" strokeWidth="2"/></svg>;
  }
  if (kind === "receipt") {
    return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2"/><path d="M9 8h6M9 12h6M9 16h3" stroke="currentColor" strokeLinecap="round" strokeWidth="2"/></svg>;
  }
  if (kind === "voice") {
    return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24"><rect x="8.5" y="3" width="7" height="11" rx="3.5" stroke="currentColor" strokeWidth="2"/><path d="M5 11c0 4 3 7 7 7s7-3 7-7M12 18v3M9 21h6" stroke="currentColor" strokeLinecap="round" strokeWidth="2"/></svg>;
  }
  if (kind === "rules") {
    return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24"><path d="M5 4h14v16H5z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeLinecap="round" strokeWidth="2"/></svg>;
  }
  return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24"><path d="m12 2 2.1 6.1L20 10l-5.9 1.9L12 18l-2.1-6.1L4 10l5.9-1.9L12 2Z" fill="currentColor"/><path d="m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16Z" fill="currentColor" opacity=".58"/></svg>;
}
