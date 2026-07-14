import SceneBackground from "@/components/scene/SceneBackground";
import SceneMobileNav from "@/components/scene/SceneMobileNav";
import SceneSidebar from "@/components/scene/SceneSidebar";
import SceneTopBar from "@/components/scene/SceneTopBar";
import SceneTransition from "@/components/scene/SceneTransition";
import { sceneTokens, type SceneTone } from "@/lib/scene/scene-tokens";

interface SceneShellProps {
  activePath: string;
  children: React.ReactNode;
  particleCount?: number;
  showSidebar?: boolean;
  tone?: SceneTone;
  topBarRight?: React.ReactNode;
}

export default function SceneShell({
  activePath,
  children,
  particleCount = 72,
  showSidebar = true,
  tone = "gateway",
  topBarRight,
}: SceneShellProps) {
  return (
    <main className="sum-world-shell relative min-h-screen overflow-hidden" style={{ color: sceneTokens.color.text }}>
      <SceneBackground tone={tone} particleCount={particleCount} />
      <SceneTopBar rightSlot={topBarRight} />
      {showSidebar && <SceneMobileNav active={activePath} />}
      <div className="relative z-10 flex min-h-[calc(100vh-76px)]">
        {showSidebar && <SceneSidebar active={activePath} />}
        <section className="min-w-0 flex-1 pb-24 lg:pb-0">
          <SceneTransition transitionKey={activePath}>{children}</SceneTransition>
        </section>
      </div>
    </main>
  );
}
