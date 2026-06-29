export type SceneParticleKind = "dust" | "sparkle" | "event";

export interface SceneParticle {
  id: string;
  kind: SceneParticleKind;
  x: number;
  y: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  driftX: number;
  driftY: number;
}

export function createSceneParticles(count = 72): SceneParticle[] {
  return Array.from({ length: count }, (_, index) => {
    const lane = index % 11;
    const kind: SceneParticleKind = index % 19 === 0 ? "event" : index % 7 === 0 ? "sparkle" : "dust";
    const size = kind === "dust" ? 1 + (index % 2) : kind === "sparkle" ? 3 + (index % 2) : 2 + (index % 4);

    return {
      id: `particle-${index}`,
      kind,
      x: (index * 37 + lane * 13) % 100,
      y: (index * 29 + lane * 7) % 100,
      size,
      opacity: kind === "dust" ? 0.28 : kind === "sparkle" ? 0.46 : 0.38,
      duration: 18 + ((index * 5) % 29),
      delay: -1 * ((index * 3) % 17),
      driftX: ((index % 5) - 2) * 18,
      driftY: ((index % 7) - 3) * 14,
    };
  });
}

export function particleCountForScene(isMobile = false, density: "low" | "medium" = "medium") {
  if (isMobile) return density === "low" ? 24 : 34;
  return density === "low" ? 58 : 104;
}
