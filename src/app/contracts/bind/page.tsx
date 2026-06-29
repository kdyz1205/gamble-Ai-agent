import ContractStage from "@/components/contract/ContractStage";
import SceneShell from "@/components/scene/SceneShell";
import { sceneBrand } from "@/lib/scene/scene-brand";
import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function BindContractPage() {
  return (
    <SceneShell
      activePath="/contracts/bind"
      particleCount={44}
      tone="contract"
      topBarRight={
        <>
          <span className="rounded-full px-3 py-1.5" style={{ border: `1px solid ${sceneTokens.color.line}`, background: "rgba(244,239,255,0.04)" }}>
            Lore
          </span>
          <span className="rounded-full px-3 py-1.5 font-semibold uppercase tracking-[0.16em]" style={{ border: "1px solid rgba(0,240,181,0.28)", background: "rgba(0,240,181,0.08)", color: sceneTokens.color.cyan }}>
            {sceneBrand.status}
          </span>
        </>
      }
    >
      <ContractStage />
    </SceneShell>
  );
}
