import Link from "next/link";

const NAVY = "#1E293B";
const NAVY_DIM = "#64748B";
const NAVY_FAINT = "#E2E8F0";
const PEACH = "#FED7AA";
const PEACH_TEXT = "#7C2D12";
const MINT = "#A7F3D0";
const MINT_TEXT = "#047857";

export default function NotFound() {
  return (
    <main
      className="min-h-screen px-5 py-6"
      style={{ background: "linear-gradient(135deg, #D7FFF2 0%, #EEF2FF 50%, #FFF1F2 100%)" }}
    >
      <div className="mx-auto flex min-h-[calc(100vh-48px)] max-w-2xl flex-col">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-base font-black tracking-tight" style={{ color: NAVY }}>
            stubborn
          </Link>
          <Link
            href="/markets"
            className="rounded-full bg-white px-4 py-2 text-xs font-black shadow-sm"
            style={{ color: NAVY, border: `1px solid ${NAVY_FAINT}` }}
          >
            My challenges
          </Link>
        </header>

        <section className="flex flex-1 items-center justify-center py-12">
          <div className="w-full rounded-[28px] border bg-white/90 p-7 text-center shadow-sm" style={{ borderColor: NAVY_FAINT }}>
            <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: MINT_TEXT }}>
              Not found
            </p>
            <h1 className="mt-3 text-3xl font-black leading-tight" style={{ color: NAVY }}>
              This challenge or page is not available.
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-6" style={{ color: NAVY_DIM }}>
              It may have been closed, refunded, moved, or the invite link may be wrong. You can go back to the challenge manager or create a new challenge.
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/markets"
                className="rounded-full px-5 py-3 text-sm font-black active:scale-95 transition-transform"
                style={{ color: MINT_TEXT, background: MINT }}
              >
                Back to challenge manager
              </Link>
              <Link
                href="/"
                className="rounded-full px-5 py-3 text-sm font-black active:scale-95 transition-transform"
                style={{ color: PEACH_TEXT, background: PEACH }}
              >
                Create new challenge
              </Link>
              <Link
                href="/radar"
                className="rounded-full bg-white px-5 py-3 text-sm font-black active:scale-95 transition-transform"
                style={{ color: NAVY, border: `1px solid ${NAVY_FAINT}` }}
              >
                Open radar
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
