import Link from "next/link";
import SceneShell from "@/components/scene/SceneShell";
import { sceneTokens } from "@/lib/scene/scene-tokens";

interface LegalSection {
  title: string;
  body: string[];
}

interface LegalPageProps {
  activePath: string;
  eyebrow: string;
  title: string;
  updated: string;
  sections: LegalSection[];
  children?: React.ReactNode;
}

export default function LegalPage({ activePath, eyebrow, title, updated, sections, children }: LegalPageProps) {
  return (
    <SceneShell activePath={activePath} showSidebar={false} tone="world" particleCount={18}>
      <article className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-xs uppercase tracking-[0.22em]" style={{ color: sceneTokens.color.gold }}>
          {eyebrow}
        </p>
        <h1 className="mt-4 text-3xl font-semibold sm:text-5xl" style={{ color: sceneTokens.color.text }}>
          {title}
        </h1>
        <p className="mt-3 text-sm" style={{ color: sceneTokens.color.textMuted }}>
          Updated {updated}
        </p>
        <div className="mt-9 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold" style={{ color: sceneTokens.color.text }}>
                {section.title}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-6" style={{ color: sceneTokens.color.textMuted }}>
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
        {children}
        <nav
          aria-label="App policies"
          className="mt-10 flex flex-wrap gap-4 text-[11px] uppercase tracking-[0.18em]"
          style={{ color: sceneTokens.color.textMuted }}
        >
          <Link href="/privacy" className="transition hover:text-[#d9b86c]">
            Privacy
          </Link>
          <Link href="/terms" className="transition hover:text-[#d9b86c]">
            Terms
          </Link>
          <Link href="/support" className="transition hover:text-[#d9b86c]">
            Support
          </Link>
        </nav>
      </article>
    </SceneShell>
  );
}
