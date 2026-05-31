import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = path.resolve("docs/ui-concepts");

const base = {
  dark: "#0A0D12",
  ink: "#111827",
  paper: "#F8FAFC",
  muted: "#64748B",
  green: "#34D399",
  orange: "#FB923C",
  blue: "#38BDF8",
  violet: "#A78BFA",
  border: "rgba(148, 163, 184, .26)",
};

const concepts = [
  {
    slug: "01-command-center",
    name: "Command Center",
    thesis: "Raycast-style: everything starts from one command bar, then AI returns a compact protocol.",
    html: commandCenter,
  },
  {
    slug: "02-radar-first",
    name: "Radar First",
    thesis: "Zenly-lite: nearby challenges are the first screen; composer floats over the map.",
    html: radarFirst,
  },
  {
    slug: "03-camera-first",
    name: "Camera First",
    thesis: "For physical challenges: start from proof capture, with identity instructions embedded.",
    html: cameraFirst,
  },
  {
    slug: "04-chat-timeline",
    name: "Chat Timeline",
    thesis: "ChatGPT-like: AI asks only missing protocol questions and builds the room inline.",
    html: chatTimeline,
  },
  {
    slug: "05-battle-room",
    name: "Battle Room",
    thesis: "Versus screen first: left/right identity, evidence, and verdict path are visually obvious.",
    html: battleRoom,
  },
  {
    slug: "06-card-stack",
    name: "Protocol Card Stack",
    thesis: "Swipe stack: one decision at a time, lower cognitive load for new users.",
    html: cardStack,
  },
  {
    slug: "07-bento-dashboard",
    name: "Bento Home",
    thesis: "Operational but clean: user sees create, join, pending, and credits in one scanning surface.",
    html: bentoDashboard,
  },
  {
    slug: "08-story-onboarding",
    name: "Story Onboarding",
    thesis: "Consumer/social style: one-screen guided story before entering the composer.",
    html: storyOnboarding,
  },
  {
    slug: "09-market-feed",
    name: "Challenge Feed",
    thesis: "TikTok/market style: browse challenges first, create from a sticky bottom composer.",
    html: marketFeed,
  },
  {
    slug: "10-agent-flow",
    name: "Agent Flow",
    thesis: "Shows the AI agents as a live pipeline without dumping workflow text on normal users.",
    html: agentFlow,
  },
];

function shell({ title, thesis, body, bg = "#F7FBFF", color = base.ink, theme = "" }) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
*{box-sizing:border-box} body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:${bg};color:${color};}
.screen{width:1440px;height:900px;overflow:hidden;position:relative;padding:36px 44px}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px}.brand{display:flex;align-items:center;gap:12px;font-weight:950;letter-spacing:.16em;text-transform:uppercase;font-size:12px}.logo{width:38px;height:38px;border-radius:13px;background:#34D399;color:#07110C;display:grid;place-items:center;font-weight:1000}.tag{font-size:12px;color:#64748B;font-weight:800}.pill{border:1px solid ${base.border};border-radius:999px;padding:10px 14px;background:rgba(255,255,255,.72);font-weight:850}
h1{font-size:58px;letter-spacing:-.052em;line-height:.96;margin:0}.thesis{font-size:18px;line-height:1.45;color:#64748B;font-weight:700;max-width:760px;margin:12px 0 0}
.glass{background:rgba(255,255,255,.78);border:1px solid rgba(255,255,255,.9);box-shadow:0 28px 90px rgba(15,23,42,.10);backdrop-filter:blur(22px)}.card{border:1px solid ${base.border};background:#fff;border-radius:24px;box-shadow:0 20px 70px rgba(15,23,42,.08)}
.label{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#059669;font-weight:950}.muted{color:#64748B}.btn{border:0;border-radius:999px;background:#34D399;color:#052E1A;padding:13px 20px;font-weight:950}.btn2{border:1px solid ${base.border};border-radius:999px;background:#fff;color:#111827;padding:12px 18px;font-weight:900}
${theme}
</style></head><body><main class="screen"><div class="top"><div class="brand"><div class="logo">A</div><span>StepOne</span></div><div class="tag">${title}</div></div>${body}<div style="position:absolute;right:38px;bottom:24px;color:#94A3B8;font-size:12px;font-weight:800">${thesis}</div></main></body></html>`;
}

function commandCenter() {
  return shell({
    title: "01 Command Center",
    thesis: "One intent bar, instant protocol preview.",
    body: `
<section style="display:grid;grid-template-columns:1fr 460px;gap:34px;align-items:start">
  <div style="padding-top:100px">
    <h1>Type the bet.<br/>AI builds the protocol.</h1>
    <p class="thesis">A minimal command interface: fewer buttons, more intent. The model selector becomes secondary until needed.</p>
    <div class="glass" style="margin-top:34px;border-radius:30px;padding:18px">
      <div style="height:132px;border-radius:22px;background:#fff;padding:26px;font-size:24px;font-weight:800;color:#64748B">/challenge Jerry 20 push-ups, same camera</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px">
        <div style="display:flex;gap:10px"><span class="pill">Auto EN/ZH</span><span class="pill">DeepSeek V4</span><span class="pill">Mic</span></div><button class="btn">Compile</button>
      </div>
    </div>
  </div>
  <aside class="card" style="padding:24px">
    <div class="label">Protocol preview</div>
    <h2 style="font-size:31px;letter-spacing:-.04em;margin:14px 0">Push-up sprint</h2>
    ${miniRows(["2 players", "same camera", "left/right identity", "AI vision gate", "85% auto-settle"])}
    <button class="btn" style="width:100%;margin-top:24px">Create room</button>
  </aside>
</section>`,
  });
}

function radarFirst() {
  return shell({
    title: "02 Radar First",
    thesis: "Map/radar is the homepage.",
    bg: "#ECFDF5",
    body: `
<section style="display:grid;grid-template-columns:470px 1fr;gap:28px;height:760px">
  <aside class="glass" style="border-radius:32px;padding:26px">
    <h1 style="font-size:52px">Nearby challenges.</h1>
    <p class="thesis">Open app, allow location, join what is around you, or create one here.</p>
    <div style="margin-top:30px;display:grid;gap:14px">
      ${challengeCard("KTV water sprint", "0.2 mi / same camera")}
      ${challengeCard("Park plank hold", "0.6 mi / video")}
      ${challengeCard("Coffee trivia", "1.1 mi / text")}
    </div>
    <button class="btn" style="width:100%;margin-top:24px">Create here</button>
  </aside>
  <div class="card" style="position:relative;overflow:hidden;border-radius:32px;background:#072E1B">
    <div style="position:absolute;inset:80px;border:1px solid rgba(52,211,153,.22);border-radius:50%"></div>
    <div style="position:absolute;inset:180px;border:1px solid rgba(52,211,153,.28);border-radius:50%"></div>
    <div style="position:absolute;inset:280px;border:1px solid rgba(52,211,153,.35);border-radius:50%"></div>
    ${bubble(58, 18, "Push-up", "#34D399")} ${bubble(68, 52, "Trivia", "#38BDF8")} ${bubble(35, 62, "Plank", "#FB923C")} ${bubble(48, 39, "You", "#fff")}
    <div class="glass" style="position:absolute;left:40px;right:40px;bottom:34px;border-radius:24px;padding:16px;display:flex;justify-content:space-between;align-items:center"><b>Say: make a challenge here</b><button class="btn">Speak</button></div>
  </div>
</section>`,
  });
}

function cameraFirst() {
  return shell({
    title: "03 Camera First",
    thesis: "The product starts where proof starts.",
    bg: "#0B1018",
    color: "#F8FAFC",
    body: `
<section style="display:grid;grid-template-columns:1fr 420px;gap:28px;height:760px">
  <div style="border-radius:34px;background:#111827;border:1px solid rgba(255,255,255,.12);position:relative;overflow:hidden">
    <div style="position:absolute;inset:28px;border:2px dashed rgba(255,255,255,.24);border-radius:28px"></div>
    <div style="position:absolute;left:70px;top:95px;width:240px;height:520px;border-radius:120px 120px 40px 40px;background:rgba(52,211,153,.20);border:1px solid rgba(52,211,153,.5)"></div>
    <div style="position:absolute;right:70px;top:95px;width:240px;height:520px;border-radius:120px 120px 40px 40px;background:rgba(56,189,248,.18);border:1px solid rgba(56,189,248,.45)"></div>
    <div style="position:absolute;left:92px;top:52px" class="pill">Creator left</div><div style="position:absolute;right:92px;top:52px" class="pill">Jerry right</div>
    <div style="position:absolute;left:50%;bottom:42px;transform:translateX(-50%);display:flex;gap:14px"><button class="btn">Record</button><button class="btn2">Upload</button></div>
  </div>
  <aside class="card" style="padding:24px;background:#F8FAFC;color:#111827">
    <div class="label">Identity sentence</div>
    <h1 style="font-size:42px;margin:12px 0">One line, no codes.</h1>
    <p class="thesis">“I am Kevin on the left. Jerry is on the right. StepOne start.”</p>
    ${miniRows(["full body visible", "no cuts", "say names", "show timer", "AI review"])}
  </aside>
</section>`,
  });
}

function chatTimeline() {
  return shell({
    title: "04 Chat Timeline",
    thesis: "AI guides the missing pieces like a host.",
    body: `
<section style="display:grid;grid-template-columns:1fr 430px;gap:28px;height:760px">
  <div class="card" style="padding:28px;display:grid;align-content:end;gap:16px">
    ${msg("user", "I want to bet Jerry I can do more push-ups in 60 seconds.")}
    ${msg("ai", "Same camera or separate videos? I need this to bind identity.")}
    ${msg("user", "Same camera.")}
    ${msg("ai", "Protocol ready: creator left, Jerry right, continuous video, AI counts valid reps.")}
    <div style="display:flex;gap:12px;margin-top:8px"><button class="btn">Create</button><button class="btn2">Edit</button></div>
  </div>
  <aside class="glass" style="border-radius:30px;padding:24px">
    <div class="label">Live draft</div>
    <h2 style="font-size:34px;letter-spacing:-.04em">Push-up count</h2>
    ${miniRows(["Mode: same camera", "Players: Kevin vs Jerry", "Proof: one clip", "Judge: reps + identity", "Fallback: review"])}
  </aside>
</section>`,
  });
}

function battleRoom() {
  return shell({
    title: "05 Battle Room",
    thesis: "A room that makes who-is-who impossible to miss.",
    bg: "#111827",
    color: "#F8FAFC",
    body: `
<section style="height:760px;display:grid;grid-template-columns:1fr 120px 1fr;gap:18px;align-items:stretch">
  <div class="card" style="background:#172033;color:#fff;padding:26px;border-color:rgba(255,255,255,.12)">
    <div class="label">Creator / left</div><h1 style="font-size:58px">Kevin</h1>
    <div style="height:440px;border-radius:28px;background:rgba(52,211,153,.15);border:1px solid rgba(52,211,153,.35);display:grid;place-items:center;font-size:24px;font-weight:900">Camera zone</div>
  </div>
  <div style="display:grid;place-items:center"><div style="width:92px;height:92px;border-radius:999px;background:#fff;color:#111827;display:grid;place-items:center;font-size:28px;font-weight:1000">VS</div></div>
  <div class="card" style="background:#172033;color:#fff;padding:26px;border-color:rgba(255,255,255,.12)">
    <div class="label">Opponent / right</div><h1 style="font-size:58px">Jerry</h1>
    <div style="height:440px;border-radius:28px;background:rgba(56,189,248,.15);border:1px solid rgba(56,189,248,.35);display:grid;place-items:center;font-size:24px;font-weight:900">Camera zone</div>
  </div>
  <div class="glass" style="position:absolute;left:350px;right:350px;bottom:38px;border-radius:24px;padding:18px;display:flex;justify-content:space-between;align-items:center;color:#111827"><b>Identity locked. Record same-camera proof.</b><button class="btn">Start</button></div>
</section>`,
  });
}

function cardStack() {
  return shell({
    title: "06 Card Stack",
    thesis: "One protocol decision per screen.",
    body: `
<section style="display:grid;grid-template-columns:520px 1fr;gap:44px;align-items:center;height:760px">
  <div>
    <h1>Less text.<br/>One choice.</h1><p class="thesis">Instead of dumping rules, StepOne shows a stack: who, proof, identity, judge, settle.</p>
  </div>
  <div style="position:relative;height:620px">
    ${stackCard(40, 24, "5", "Settle", "Auto only if gates pass", "#E0F2FE")}
    ${stackCard(20, 48, "4", "Judge", "AI counts valid reps", "#DCFCE7")}
    ${stackCard(0, 72, "3", "Identity", "Kevin left, Jerry right", "#FFF7ED")}
    <div class="card" style="position:absolute;left:90px;top:120px;width:420px;height:380px;padding:30px;z-index:4">
      <div class="label">Step 2 / Proof</div><h1 style="font-size:54px;margin-top:22px">One clear video.</h1><p class="thesis">Keep both bodies visible. No cuts.</p><button class="btn" style="margin-top:34px">Continue</button>
    </div>
  </div>
</section>`,
  });
}

function bentoDashboard() {
  return shell({
    title: "07 Bento Home",
    thesis: "All important states visible without becoming admin UI.",
    body: `
<section style="display:grid;grid-template-columns:1.1fr .9fr;gap:18px;height:760px">
  <div class="card" style="padding:28px;display:flex;flex-direction:column;justify-content:space-between">
    <div><h1>Start a challenge.</h1><p class="thesis">One sentence creates a playable protocol.</p></div>
    <div class="glass" style="border-radius:26px;padding:18px"><div style="font-size:24px;font-weight:800;color:#64748B;height:110px">I bet Jerry...</div><div style="display:flex;justify-content:space-between"><span class="pill">DeepSeek V4</span><button class="btn">Send</button></div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
    ${bento("Credits", "43 pts", "Daily AI budget ready")}
    ${bento("Pending", "2", "Need evidence")}
    ${bento("Nearby", "7", "Open rooms")}
    ${bento("Reviews", "1", "AI unsure")}
  </div>
</section>`,
  });
}

function storyOnboarding() {
  return shell({
    title: "08 Story Onboarding",
    thesis: "Consumer first-run with almost no explanation.",
    bg: "linear-gradient(135deg,#0F172A,#10251D)",
    color: "#fff",
    body: `
<section style="height:760px;display:grid;place-items:center">
  <div style="width:430px;height:760px;border-radius:48px;background:#050B12;border:10px solid rgba(255,255,255,.12);padding:28px;box-shadow:0 40px 120px rgba(0,0,0,.35)">
    <div style="height:100%;border-radius:34px;background:linear-gradient(180deg,rgba(52,211,153,.18),rgba(56,189,248,.08));padding:26px;display:flex;flex-direction:column;justify-content:space-between">
      <div><div class="label">Story 1 / 3</div><h1 style="font-size:48px">Say it.</h1><p style="font-size:18px;line-height:1.45;color:#CBD5E1;font-weight:700">“Who can do more push-ups?”</p></div>
      <div><div style="height:8px;border-radius:999px;background:rgba(255,255,255,.15);overflow:hidden"><div style="width:33%;height:100%;background:#34D399"></div></div><button class="btn" style="width:100%;margin-top:18px">Start</button></div>
    </div>
  </div>
</section>`,
  });
}

function marketFeed() {
  return shell({
    title: "09 Challenge Feed",
    thesis: "Browse first, create from bottom composer.",
    bg: "#F8FAFC",
    body: `
<section style="height:760px;display:grid;grid-template-columns:360px 1fr 360px;gap:20px">
  <aside class="card" style="padding:20px"><div class="label">Filters</div>${miniRows(["Nearby", "Physical", "Text answer", "No stake", "Friends"])}</aside>
  <main style="display:grid;gap:16px;align-content:start">${feedCard("Jerry push-up sprint", "same camera / 85% gate")}${feedCard("Dog treat choice", "solo pet proof / review")}${feedCard("BTC price by Friday", "oracle source / no video")}</main>
  <aside class="card" style="padding:20px"><div class="label">Selected</div><h2>Push-up sprint</h2><p class="thesis">Review rules before joining.</p><button class="btn">Join</button></aside>
  <div class="glass" style="position:absolute;left:420px;right:420px;bottom:28px;border-radius:999px;padding:13px 16px;display:flex;justify-content:space-between;align-items:center"><b style="color:#64748B">Create anything provable...</b><button class="btn">Ask AI</button></div>
</section>`,
  });
}

function agentFlow() {
  return shell({
    title: "10 Agent Flow",
    thesis: "Make the AI pipeline visible only when useful.",
    body: `
<section style="display:grid;grid-template-columns:460px 1fr;gap:34px;height:760px;align-items:center">
  <div><h1>AI host,<br/>not a form.</h1><p class="thesis">Agents run behind the scenes. Normal users see simple status, power users can expand the flow.</p><button class="btn" style="margin-top:28px">Run challenge</button></div>
  <div class="card" style="padding:28px">
    ${agent("Compiler", "prompt → protocol", true)}
    ${agent("Safety", "risk gate", true)}
    ${agent("Identity", "left/right + liveness", true)}
    ${agent("Evidence", "video checks", false)}
    ${agent("Verdict", "winner + confidence", false)}
    ${agent("Settlement", "credits ledger", false)}
  </div>
</section>`,
  });
}

function miniRows(rows) {
  return `<div style="display:grid;gap:10px;margin-top:18px">${rows.map((r) => `<div style="display:flex;justify-content:space-between;align-items:center;border:1px solid ${base.border};border-radius:16px;padding:13px 14px;background:rgba(248,250,252,.7)"><b>${r}</b><span style="color:#34D399;font-weight:950">✓</span></div>`).join("")}</div>`;
}
function challengeCard(title, meta) {
  return `<div class="card" style="padding:16px"><b>${title}</b><div class="muted" style="font-weight:800;margin-top:5px">${meta}</div></div>`;
}
function bubble(left, top, label, color) {
  return `<div style="position:absolute;left:${left}%;top:${top}%;transform:translate(-50%,-50%);background:${color};color:#062012;border-radius:999px;padding:13px 17px;font-weight:950;box-shadow:0 20px 80px rgba(0,0,0,.24)">${label}</div>`;
}
function msg(kind, text) {
  const own = kind === "user";
  return `<div style="display:flex;justify-content:${own ? "flex-end" : "flex-start"}"><div style="max-width:76%;border-radius:24px;padding:16px 18px;background:${own ? "#111827" : "#ECFDF5"};color:${own ? "#fff" : "#111827"};font-size:17px;font-weight:760;line-height:1.4">${text}</div></div>`;
}
function stackCard(left, top, step, title, text, bg) {
  return `<div class="card" style="position:absolute;left:${left}px;top:${top}px;width:420px;height:320px;padding:28px;background:${bg};z-index:${step}"><div class="label">Step ${step}</div><h2 style="font-size:38px;margin:18px 0 8px">${title}</h2><p class="thesis">${text}</p></div>`;
}
function bento(title, value, text) {
  return `<div class="card" style="padding:24px"><div class="label">${title}</div><h2 style="font-size:48px;margin:18px 0 8px">${value}</h2><p class="muted" style="font-weight:800">${text}</p></div>`;
}
function feedCard(title, meta) {
  return `<article class="card" style="padding:24px"><div class="label">Open challenge</div><h2 style="font-size:31px;margin:12px 0">${title}</h2><p class="muted" style="font-weight:800">${meta}</p><button class="btn2" style="margin-top:18px">Review rules</button></article>`;
}
function agent(title, detail, done) {
  return `<div style="display:flex;align-items:center;gap:16px;border:1px solid ${base.border};border-radius:20px;padding:16px;margin-bottom:12px;background:${done ? "#ECFDF5" : "#F8FAFC"}"><div style="width:36px;height:36px;border-radius:999px;background:${done ? "#34D399" : "#CBD5E1"};display:grid;place-items:center;font-weight:1000">${done ? "✓" : "·"}</div><div><b>${title}</b><div class="muted" style="font-weight:800">${detail}</div></div></div>`;
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

const manifest = [];
for (const concept of concepts) {
  const fullHtml = concept.html();
  const htmlFile = path.join(outDir, `${concept.slug}.html`);
  const pngFile = path.join(outDir, `${concept.slug}.png`);
  await writeFile(htmlFile, fullHtml, "utf8");
  await page.setContent(fullHtml, { waitUntil: "load" });
  await page.screenshot({ path: pngFile, fullPage: true });
  manifest.push({ slug: concept.slug, name: concept.name, thesis: concept.thesis, html: htmlFile, screenshot: pngFile });
}
await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
await browser.close();
console.log(JSON.stringify({ outDir, count: concepts.length }, null, 2));
