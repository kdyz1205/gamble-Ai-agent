/** Produce the 2732px iOS native launch asset matching Pico's live world. */
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "ios/App/App/Assets.xcassets/Splash.imageset");

const backdrop = `<svg width="2732" height="2732" viewBox="0 0 2732 2732" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="paper" x1="100" y1="0" x2="2600" y2="2732" gradientUnits="userSpaceOnUse">
    <stop stop-color="#fff8f2"/><stop offset=".52" stop-color="#f8faf4"/><stop offset="1" stop-color="#f5eefb"/>
  </linearGradient>
  <radialGradient id="cloud"><stop stop-color="#eedafa" stop-opacity=".88"/><stop offset="1" stop-color="#eedafa" stop-opacity="0"/></radialGradient>
  <radialGradient id="mint"><stop stop-color="#c6e9d2" stop-opacity=".82"/><stop offset="1" stop-color="#c6e9d2" stop-opacity="0"/></radialGradient>
</defs>
<rect width="2732" height="2732" fill="url(#paper)"/>
<ellipse cx="2280" cy="530" rx="950" ry="730" fill="url(#cloud)"/>
<ellipse cx="380" cy="2110" rx="1010" ry="850" fill="url(#mint)"/>
<g fill="#e8c7d7" opacity=".63">
<path d="m590 940 14 36 36 14-36 14-14 36-14-36-36-14 36-14 14-36Z"/>
<path d="m2160 1250 17 41 41 17-41 17-17 41-17-41-41-17 41-17 17-41Z"/>
</g>
<path d="M1130 1940h472" stroke="#d0dfd2" stroke-width="4" stroke-linecap="round"/>
<text x="1366" y="2080" text-anchor="middle" font-size="138" font-family="Georgia, serif" font-weight="700" fill="#315e52" letter-spacing="-8">SUM</text>
<text x="1366" y="2170" text-anchor="middle" font-size="43" font-family="Arial, sans-serif" font-weight="700" fill="#6d8175" letter-spacing="11">SUMMONER.WORLD</text>
<text x="1366" y="2250" text-anchor="middle" font-size="44" font-family="Georgia, serif" fill="#9278a2" font-style="italic">A world of possibilities.</text>
</svg>`;

async function main() {
  const icon = path.join(root, "public/icon-512.png");
  const logo = await sharp(icon).resize(990).png().toBuffer();
  const image = await sharp(Buffer.from(backdrop)).composite([{ input: logo, left: 871, top: 690 }]).flatten({ background: "#fff8f2" }).png().toBuffer();
  fs.mkdirSync(outputDir, { recursive: true });
  for (const name of ["splash-2732x2732.png","splash-2732x2732-1.png","splash-2732x2732-2.png"]) {
    const out = path.join(outputDir, name);
    fs.writeFileSync(out, image);
    const metadata = await sharp(out).metadata();
    if (metadata.width !== 2732 || metadata.height !== 2732) throw new Error("Invalid iOS splash dimensions");
    console.log("GENERATED", path.relative(root, out), metadata.width, metadata.height);
  }
}
main().catch(err => { console.error(err); process.exitCode=1; });
