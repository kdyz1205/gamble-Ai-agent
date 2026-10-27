import Link from "next/link";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

const ERRORS: Record<string, { title: string; detail: string }> = {
  OAuthSignin: {
    title: "Google sign-in could not start.",
    detail: "Check your connection, then try again. You can also sign in with your email.",
  },
  OAuthCallback: {
    title: "Google sign-in could not finish.",
    detail: "Your account was not signed in. Please retry from Summoners World.",
  },
  OAuthAccountNotLinked: {
    title: "This email already has an account.",
    detail: "Sign in using the method you previously used for this email.",
  },
  AccessDenied: {
    title: "Sign-in was not approved.",
    detail: "No account changes were made. Try again or choose another sign-in method.",
  },
  Configuration: {
    title: "Sign-in is temporarily unavailable.",
    detail: "The sign-in service needs attention. Email sign-in may still work.",
  },
  Default: {
    title: "Sign-in was interrupted.",
    detail: "Your session has not started. You can try again safely.",
  },
};

export default async function AuthErrorPage({ searchParams }: Props) {
  const query = await searchParams;
  const entry = (typeof query.error === "string" && ERRORS[query.error]) || ERRORS.Default;

  return (
    <main className="sum-auth-screen" data-testid="sum-auth-error">
      <div className="sum-auth-background-glow" aria-hidden="true" />
      <div className="sum-auth-recovery">
        <Link href="/enter" className="sum-auth-brand" aria-label="Summoners World home">
          <PicoFamiliar className="h-11 w-11" mood="guide" />
          <span><strong>Summoner.world</strong><small>SUMMONERS WORLD</small></span>
        </Link>
        <div className="sum-auth-recovery__pico"><PicoFamiliar className="h-28 w-28" mood="listening" /></div>
        <span className="sum-auth-recovery__eyebrow">SIGN-IN PORTAL</span>
        <h1>{entry.title}</h1>
        <p>{entry.detail}</p>
        <Link className="sum-auth-primary-action" href="/auth/signin">Try signing in again</Link>
        <Link className="sum-auth-secondary-action" href="/enter">Return to Summoners World</Link>
        <p className="sum-auth-help">If Google shows “redirect_uri_mismatch”, the site administrator must update the Google OAuth callback settings. You can still try email sign-in.</p>
      </div>
    </main>
  );
}
