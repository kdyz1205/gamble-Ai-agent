import Link from "next/link";
import SceneTopBar from "@/components/scene/SceneTopBar";
import SceneMobileNav from "@/components/scene/SceneMobileNav";
import type { SceneTone } from "@/lib/scene/scene-tokens";

interface SceneShellProps {
  activePath: string;
  children: React.ReactNode;
  particleCount?: number;
  showSidebar?: boolean;
  tone?: SceneTone;
  topBarRight?: React.ReactNode;
}

export default function SceneShell({ activePath, children, showSidebar = true, topBarRight }: SceneShellProps) {
  return (
    <div className="ed-app" data-design-version="editorial-v2">
      <a className="ed-skip-link" href="#quest-main">Skip to main content</a>
      <SceneTopBar activePath={activePath} rightSlot={topBarRight} />
      <main id="quest-main" tabIndex={-1} className="ed-main">{children}</main>
      <footer className="ed-app-footer"><span>A little competition. A story worth keeping.</span><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Support</Link></div></footer>
      {showSidebar && <SceneMobileNav active={activePath} />}
    </div>
  );
}
