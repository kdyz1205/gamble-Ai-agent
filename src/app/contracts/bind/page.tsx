import ContractStage from "@/components/contract/ContractStage";
import SceneShell from "@/components/scene/SceneShell";

export default function BindContractPage() {
  return (
    <SceneShell activePath="/contracts/bind" particleCount={24} tone="contract">
      <ContractStage />
    </SceneShell>
  );
}
