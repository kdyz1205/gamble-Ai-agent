import SceneTopBar from "@/components/scene/SceneTopBar";
import SceneTransition from "@/components/scene/SceneTransition";
import SceneMobileNav from "@/components/scene/SceneMobileNav";
import { WorldFooter } from "@/components/universe/WorldUI";
import type { SceneTone } from "@/lib/scene/scene-tokens";

interface SceneShellProps { activePath: string; children: React.ReactNode; particleCount?: number; showSidebar?: boolean; tone?: SceneTone; topBarRight?: React.ReactNode; }
export default function SceneShell({ activePath, children, showSidebar = true, topBarRight }: SceneShellProps) {
  return <div className="sw-app" data-design-version="sum-world-v3" data-world-location={activePath}>
    <a className="sw-skip-link" href="#quest-main">Skip to main content</a>
    <SceneTopBar activePath={activePath} rightSlot={topBarRight} />
    <main id="quest-main" tabIndex={-1} className="sw-main"><SceneTransition transitionKey={activePath}>{children}</SceneTransition></main>
    <WorldFooter />
    {showSidebar && <SceneMobileNav active={activePath} />}
  </div>;
}
