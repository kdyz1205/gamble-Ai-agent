import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = path.resolve("docs/ui-themes");

const themes = [
  {
    slug: "01-obsidian-command",
    name: "Obsidian Command",
    mood: "dark, precise, premium",
    bg: "#070A0F",
    surface: "rgba(17, 24, 39, 0.78)",
    surface2: "rgba(255, 255, 255, 0.06)",
    text: "#F8FAFC",
    muted: "#94A3B8",
    accent: "#34D399",
    accent2: "#F59E0B",
    border: "rgba(255,255,255,0.12)",
    gradient: "radial-gradient(circle at 12% 15%, rgba(52,211,153,.22), transparent 32%), radial-gradient(circle at 84% 18%, rgba(245,158,11,.16), transparent 28%), #070A0F",
  },
  {
    slug: "02-porcelain-mint",
    name: "Porcelain Mint",
    mood: "bright, simple, approachable",
    bg: "#F7FBF8",
    surface: "rgba(255,255,255,0.9)",
    surface2: "#F1F7F4",
    text: "#12201A",
    muted: "#60746B",
    accent: "#10B981",
    accent2: "#F97316",
    border: "#DCE9E2",
    gradient: "linear-gradient(135deg, #F8FFFB 0%, #EEF7FF 48%, #FFF4EF 100%)",
  },
  {
    slug: "03-liquid-glass",
    name: "Liquid Glass",
    mood: "soft, airy, futuristic",
    bg: "#EAF7FF",
    surface: "rgba(255,255,255,0.62)",
    surface2: "rgba(255,255,255,0.38)",
    text: "#132238",
    muted: "#617086",
    accent: "#0EA5E9",
    accent2: "#14B8A6",
    border: "rgba(255,255,255,0.85)",
    gradient: "radial-gradient(circle at 8% 18%, rgba(20,184,166,.22), transparent 28%), radial-gradient(circle at 78% 8%, rgba(168,85,247,.16), transparent 30%), linear-gradient(135deg,#ECFEFF,#F8FAFC,#FFF7ED)",
  },
  {
    slug: "04-graphite-mint",
    name: "Graphite Mint",
    mood: "Linear-like, focused, dense",
    bg: "#101216",
    surface: "#171A20",
    surface2: "#20242C",
    text: "#F1F5F9",
    muted: "#98A2B3",
    accent: "#6EE7B7",
    accent2: "#A78BFA",
    border: "#2A2F39",
    gradient: "linear-gradient(135deg, #101216 0%, #161B22 55%, #0B1118 100%)",
  },
  {
    slug: "05-radar-sport",
    name: "Radar Sport",
    mood: "physical challenge, kinetic, map-ready",
    bg: "#07130E",
    surface: "rgba(9, 28, 19, 0.84)",
    surface2: "rgba(37, 99, 235, 0.12)",
    text: "#ECFDF5",
    muted: "#9BC5B1",
    accent: "#22C55E",
    accent2: "#38BDF8",
    border: "rgba(110,231,183,0.18)",
    gradient: "radial-gradient(circle at 50% 45%, rgba(34,197,94,.18), transparent 25%), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,.035) 1px, transparent 1px), #07130E",
    bgSize: "auto, 64px 64px, 64px 64px, auto",
  },
  {
    slug: "06-ink-signal",
    name: "Ink Signal",
    mood: "editorial, confident, low-noise",
    bg: "#F8F7F3",
    surface: "#FFFFFF",
    surface2: "#F0F2EE",
    text: "#111827",
    muted: "#6B7280",
    accent: "#111827",
    accent2: "#16A34A",
    border: "#E5E7EB",
    gradient: "linear-gradient(135deg, #FBFAF7 0%, #F3F6F1 100%)",
  },
  {
    slug: "07-neon-night",
    name: "Neon Night",
    mood: "social, viral, energetic",
    bg: "#060712",
    surface: "rgba(18, 18, 35, 0.82)",
    surface2: "rgba(255,255,255,0.07)",
    text: "#F9FAFB",
    muted: "#A5ADC0",
    accent: "#FF4FD8",
    accent2: "#00E5FF",
    border: "rgba(255,255,255,0.12)",
    gradient: "radial-gradient(circle at 20% 20%, rgba(255,79,216,.23), transparent 25%), radial-gradient(circle at 80% 25%, rgba(0,229,255,.18), transparent 24%), #060712",
  },
  {
    slug: "08-calm-lab",
    name: "Calm Lab",
    mood: "medical-grade trust, evidence first",
    bg: "#F4F8FB",
    surface: "#FFFFFF",
    surface2: "#EEF4F8",
    text: "#102033",
    muted: "#5D7286",
    accent: "#2563EB",
    accent2: "#10B981",
    border: "#DDE8F0",
    gradient: "linear-gradient(135deg, #F8FBFF 0%, #EEF7F2 100%)",
  },
  {
    slug: "09-street-arena",
    name: "Street Arena",
    mood: "youthful, bold, still readable",
    bg: "#14110F",
    surface: "rgba(255,255,255,0.08)",
    surface2: "rgba(255,255,255,0.12)",
    text: "#FFF7ED",
    muted: "#D7C4B0",
    accent: "#FB923C",
    accent2: "#22D3EE",
    border: "rgba(255,247,237,0.16)",
    gradient: "radial-gradient(circle at 15% 22%, rgba(251,146,60,.22), transparent 25%), radial-gradient(circle at 85% 20%, rgba(34,211,238,.12), transparent 24%), #14110F",
  },
  {
    slug: "10-zen-radar",
    name: "Zen Radar",
    mood: "location/social, playful but clean",
    bg: "#F7FFF7",
    surface: "rgba(255,255,255,0.86)",
    surface2: "#EAF8EF",
    text: "#102318",
    muted: "#5C7164",
    accent: "#84CC16",
    accent2: "#06B6D4",
    border: "#D9ECD8",
    gradient: "radial-gradient(circle at 20% 25%, rgba(132,204,22,.20), transparent 28%), radial-gradient(circle at 75% 40%, rgba(6,182,212,.14), transparent 30%), #F7FFF7",
  },
];

function html(theme, index) {
  const bgSize = theme.bgSize ? `background-size:${theme.bgSize};` : "";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
*{box-sizing:border-box} body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:${theme.gradient};${bgSize}color:${theme.text};} 
.page{width:1440px;height:900px;padding:34px 44px;display:grid;grid-template-columns:1.04fr .96fr;gap:34px;overflow:hidden}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:72px}.mark{width:44px;height:44px;border-radius:14px;background:${theme.accent};box-shadow:0 20px 60px color-mix(in srgb, ${theme.accent} 26%, transparent);display:grid;place-items:center;color:${theme.bg};font-weight:900}.brand span{font-size:13px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:${theme.muted}}
h1{font-size:82px;line-height:.92;margin:0 0 18px;letter-spacing:-.055em;max-width:780px}.sub{font-size:22px;line-height:1.45;color:${theme.muted};max-width:680px;margin:0 0 28px;font-weight:650}.chips{display:flex;gap:12px;margin-bottom:28px}.chip{border:1px solid ${theme.border};background:${theme.surface};border-radius:999px;padding:11px 16px;font-size:13px;font-weight:900;color:${theme.text};box-shadow:0 18px 50px rgba(0,0,0,.06)}.chip b{color:${theme.accent};margin-right:8px;text-transform:uppercase;letter-spacing:.12em;font-size:10px}
.composer{background:${theme.surface};border:1px solid ${theme.border};border-radius:28px;box-shadow:0 28px 90px rgba(0,0,0,.14);overflow:hidden;backdrop-filter:blur(22px)}.input{height:128px;padding:28px;font-size:22px;font-weight:700;color:${theme.text};display:flex;align-items:flex-start}.placeholder{color:${theme.muted}}.bar{border-top:1px solid ${theme.border};display:flex;align-items:center;justify-content:space-between;padding:16px 18px}.tools{display:flex;align-items:center;gap:10px}.pill{border-radius:999px;background:${theme.surface2};border:1px solid ${theme.border};padding:9px 13px;font-size:12px;font-weight:850;color:${theme.muted}}.send{border:0;border-radius:999px;padding:14px 28px;background:${theme.accent};color:${theme.bg};font-weight:950;font-size:15px;box-shadow:0 18px 50px color-mix(in srgb, ${theme.accent} 25%, transparent)}
.model{margin-top:18px;display:flex;align-items:center;gap:8px;width:max-content;border:1px solid ${theme.border};background:${theme.surface};border-radius:999px;padding:8px 10px;backdrop-filter:blur(18px);box-shadow:0 16px 50px rgba(0,0,0,.08)}.modelLabel{font-size:10px;letter-spacing:.18em;text-transform:uppercase;font-weight:950;color:${theme.accent}}.modelOpt{background:${theme.surface2};border-radius:999px;padding:9px 13px;font-size:13px;font-weight:850;color:${theme.text};border:1px solid ${theme.border}}
.tries{margin-top:36px}.tryTitle{font-size:12px;font-weight:950;color:${theme.accent};letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px}.tryBtns{display:flex;flex-wrap:wrap;gap:12px}.tryBtns button{border:1px solid ${theme.border};background:${theme.surface};color:${theme.text};border-radius:999px;padding:15px 20px;font-size:15px;font-weight:900;box-shadow:0 16px 45px rgba(0,0,0,.05)}
.right{display:grid;grid-template-rows:auto auto 1fr;gap:20px}.panel{border:1px solid ${theme.border};background:${theme.surface};border-radius:28px;padding:24px;box-shadow:0 28px 90px rgba(0,0,0,.12);backdrop-filter:blur(22px)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.tile{border:1px solid ${theme.border};background:${theme.surface2};border-radius:18px;padding:16px}.tile small{display:block;color:${theme.muted};font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:950;margin-bottom:8px}.tile strong{font-size:17px}.ready{margin-top:18px;border:1px solid color-mix(in srgb, ${theme.accent} 35%, ${theme.border});background:color-mix(in srgb, ${theme.accent} 13%, transparent);border-radius:21px;padding:18px 20px;display:flex;justify-content:space-between;align-items:center}.ready strong{font-size:18px}.ready span{font-size:12px;font-weight:950;color:${theme.accent};background:${theme.surface};border:1px solid ${theme.border};border-radius:999px;padding:8px 13px}
.invite{display:grid;gap:8px}.invite b{color:${theme.accent};font-size:12px;letter-spacing:.12em;text-transform:uppercase}.invite strong{font-size:18px}.url{margin-top:8px;border:1px solid ${theme.border};border-radius:14px;background:${theme.surface2};padding:12px 14px;color:${theme.muted};font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.join h3{margin:0 0 8px;color:${theme.accent};font-size:13px;letter-spacing:.12em;text-transform:uppercase}.join p{margin:0 0 16px;color:${theme.muted};font-weight:700}.room{border:1px solid ${theme.border};border-radius:22px;background:${theme.surface2};padding:18px 18px 20px;display:flex;align-items:center;justify-content:space-between}.roomText strong{display:block;font-size:20px;margin-bottom:6px}.roomText span{color:${theme.muted};font-size:13px;font-weight:800}.cta{border:0;border-radius:999px;background:${theme.accent2};color:${theme.bg};font-weight:950;padding:13px 18px}
.signature{position:absolute;right:48px;bottom:26px;color:${theme.muted};font-size:12px;font-weight:800}.n{color:${theme.accent};font-weight:950}
@supports not (color: color-mix(in srgb, white, black)){.send{box-shadow:none}.ready{background:${theme.surface2}}}
</style>
</head>
<body>
  <main class="page">
    <section>
      <div class="brand"><div class="mark">A</div><span>StepOne / theme ${String(index + 1).padStart(2, "0")}</span></div>
      <h1>Bet anything you can prove.</h1>
      <p class="sub">Say it once. StepOne turns the prompt into rules, proof, identity, verdict, and settlement.</p>
      <div class="chips"><div class="chip"><b>Say</b>one line</div><div class="chip"><b>Prove</b>camera</div><div class="chip"><b>Settle</b>gate</div></div>
      <div class="composer">
        <div class="input"><span class="placeholder">Challenge Jerry: 20 push-ups, same camera...</span></div>
        <div class="bar"><div class="tools"><span class="pill">Auto</span><span class="pill">EN</span><span class="pill">中</span><span class="pill">Mic</span></div><button class="send">Send</button></div>
      </div>
      <div class="model"><span class="modelLabel">Model</span><span class="modelOpt">DeepSeek</span><span class="modelOpt">deepseek-v4-pro</span></div>
      <div class="tries"><div class="tryTitle">Try one</div><div class="tryBtns"><button>Solo proof</button><button>Answer challenge</button><button>Push-up video</button><button>Plank hold</button></div></div>
    </section>
    <section class="right">
      <div class="panel">
        <div class="grid">
          <div class="tile"><small>Prompt</small><strong>one sentence</strong></div>
          <div class="tile"><small>Protocol</small><strong>rules + safety</strong></div>
          <div class="tile"><small>Evidence</small><strong>video / GPS / oracle</strong></div>
          <div class="tile"><small>Verdict</small><strong>AI + review</strong></div>
        </div>
        <div class="ready"><strong>Push-up challenge<br><span style="font-size:14px;color:${theme.muted};font-weight:800">same camera / liveness / payout</span></strong><span>ready</span></div>
      </div>
      <div class="panel invite"><b>Beta invite</b><strong>Give a friend +10 pts. You get +10 pts when they join.</strong><div class="url">https://StepOne.app/?ref=kdys1205&utm_source=invite...</div></div>
      <div class="panel join"><h3>Join nearby</h3><p>No nearby challenges found — showing top open challenges globally.</p><div class="room"><div class="roomText"><strong>Radar push-up sprint</strong><span>@alex / free / 3.2 mi</span></div><button class="cta">Review</button></div></div>
    </section>
  </main>
  <div class="signature"><span class="n">${theme.name}</span> · ${theme.mood}</div>
</body>
</html>`;
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

const manifest = [];
for (let i = 0; i < themes.length; i += 1) {
  const theme = themes[i];
  const file = path.join(outDir, `${theme.slug}.png`);
  const htmlFile = path.join(outDir, `${theme.slug}.html`);
  await writeFile(htmlFile, html(theme, i), "utf8");
  await page.setContent(html(theme, i), { waitUntil: "load" });
  await page.screenshot({ path: file, fullPage: true });
  manifest.push({ ...theme, screenshot: file, html: htmlFile });
}

await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
await browser.close();
console.log(JSON.stringify({ outDir, count: themes.length }, null, 2));
