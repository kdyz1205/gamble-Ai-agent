import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function ModuleSocket() {
  return <div className="h-20 w-20 rounded-full" style={{ border: `1px solid ${sceneTokens.color.lineStrong}`, background: "rgba(3,2,10,0.42)" }} />;
}
