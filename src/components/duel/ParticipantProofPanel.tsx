import ProofFragment from "@/components/duel/ProofFragment";
import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function ParticipantProofPanel({ name = "Participant" }: { name?: string }) {
  return (
    <section className="rounded-[30px] p-5" style={{ background: sceneTokens.color.panel, border: `1px solid ${sceneTokens.color.line}` }}>
      <h3 className="text-xl font-semibold" style={{ color: sceneTokens.color.text }}>{name}</h3>
      <div className="mt-5"><ProofFragment /></div>
    </section>
  );
}
