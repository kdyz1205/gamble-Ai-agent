import OwnerSeal from "@/components/profile/OwnerSeal";
import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function LockedProfileScene() {
  return (
    <section className="flex flex-col items-center text-center">
      <OwnerSeal />
      <h1 className="mt-8 text-4xl font-semibold" style={{ color: sceneTokens.color.text }}>Your Owner Seal is Locked</h1>
    </section>
  );
}
