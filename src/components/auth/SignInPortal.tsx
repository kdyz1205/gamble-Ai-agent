"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Link from "next/link";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import AuthModal from "@/components/AuthModal";

export default function SignInPortal() {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const signedIn = useRef(false);

  return (
    <main className="sum-auth-screen" data-testid="sum-auth-signin">
      <div className="sum-auth-background-glow" aria-hidden="true" />
      <div className="sum-auth-recovery">
        <Link href="/enter" className="sum-auth-brand" aria-label="Summoners World home">
          <PicoFamiliar className="h-11 w-11" mood="guide" />
          <span><strong>Summoner.world</strong><small>SUMMONERS WORLD</small></span>
        </Link>
        <div className="sum-auth-recovery__pico"><PicoFamiliar className="h-28 w-28" mood="guide" /></div>
        <span className="sum-auth-recovery__eyebrow">YOUR NEXT QUEST AWAITS</span>
        <h1>Welcome to your quest world.</h1>
        <p>Sign in to keep your Familiars, quests and progress together.</p>
        <button className="sum-auth-primary-action" type="button" onClick={() => setOpen(true)}>Open sign-in portal</button>
        <Link className="sum-auth-secondary-action" href="/enter">Explore the world</Link>
      </div>
      <AuthModal
        open={open}
        initialMode="login"
        returnTo="/app/today"
        onClose={() => { setOpen(false); if (!signedIn.current) router.replace("/enter"); }}
        onSuccess={() => { signedIn.current = true; router.replace("/app/today"); }}
      />
    </main>
  );
}
