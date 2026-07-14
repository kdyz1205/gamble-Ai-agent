export const sceneTokens = {
  color: {
    void: "#dff5ff",
    deep: "#eefaff",
    veil: "#bff3c7",
    violet: "#9277d9",
    violetSoft: "rgba(216, 199, 255, 0.5)",
    gold: "#e98648",
    goldSoft: "rgba(255, 185, 120, 0.32)",
    ember: "#ff8d7c",
    cyan: "#2a9f84",
    ink: "rgba(21, 48, 71, 0.82)",
    panel: "rgba(255, 255, 255, 0.78)",
    panelStrong: "rgba(255, 255, 255, 0.94)",
    line: "rgba(41, 112, 142, 0.16)",
    lineStrong: "rgba(41, 112, 142, 0.28)",
    text: "#153047",
    textMuted: "#60758a",
    textFaint: "#7c91a3",
  },
  shadow: {
    seal: "0 18px 50px rgba(40, 102, 133, 0.16), 0 0 80px rgba(143, 230, 193, 0.22)",
    panel: "0 18px 44px rgba(40, 102, 133, 0.14)",
    gold: "0 10px 26px rgba(255, 164, 96, 0.24)",
  },
  radius: {
    panel: 26,
    pill: 999,
    object: 38,
  },
  layout: {
    topBarHeight: 72,
    sidebarWidth: 236,
    maxSceneWidth: 1240,
  },
} as const;

export type SceneTone = "gateway" | "contract" | "world";
