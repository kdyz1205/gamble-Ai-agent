export const sceneTokens = {
  color: {
    void: "#030006",
    deep: "#080012",
    veil: "#150022",
    violet: "#8b3dff",
    violetSoft: "rgba(139, 61, 255, 0.36)",
    gold: "#ff4fbd",
    goldSoft: "rgba(255, 79, 189, 0.28)",
    ember: "#ff2f8f",
    cyan: "#00f0b5",
    ink: "rgba(5, 0, 10, 0.74)",
    panel: "rgba(18, 4, 28, 0.62)",
    panelStrong: "rgba(22, 5, 36, 0.86)",
    line: "rgba(255, 79, 189, 0.16)",
    lineStrong: "rgba(255, 79, 189, 0.38)",
    text: "#f4efff",
    textMuted: "rgba(244, 239, 255, 0.68)",
    textFaint: "rgba(244, 239, 255, 0.44)",
  },
  shadow: {
    seal: "0 0 70px rgba(255, 79, 189, 0.36), 0 0 150px rgba(139, 61, 255, 0.2)",
    panel: "0 24px 90px rgba(0, 0, 0, 0.42)",
    gold: "0 0 44px rgba(255, 79, 189, 0.28)",
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
