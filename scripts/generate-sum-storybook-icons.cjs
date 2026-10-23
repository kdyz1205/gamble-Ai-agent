/** Deterministic, original Pico app icon assets (web + Capacitor/iOS). */
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="none">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
      <stop stop-color="#e4dff9"/><stop offset=".52" stop-color="#fff4ee"/><stop offset="1" stop-color="#b9e9d1"/>
    </linearGradient>
    <linearGradient id="portal" x1="262" y1="166" x2="780" y2="795" gradientUnits="userSpaceOnUse">
      <stop stop-color="#fffdfb"/><stop offset=".3" stop-color="#e7ceea"/><stop offset=".66" stop-color="#c2e9dc"/><stop offset="1" stop-color="#fff3d2"/>
    </linearGradient>
    <radialGradient id="fur" cx=".32" cy=".22" r=".84"><stop stop-color="#fffefd"/><stop offset=".59" stop-color="#fff5eb"/><stop offset="1" stop-color="#dfe9e0"/></radialGradient>
    <linearGradient id="leaf" x1="0" x2="1"><stop stop-color="#c9eec4"/><stop offset="1" stop-color="#78b79d"/></linearGradient>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="220%"><feGaussianBlur stdDeviation="24"/></filter>
  </defs>
  <rect width="1024" height="1024" rx="225" fill="url(#sky)"/>
  <circle cx="506" cy="437" r="390" fill="#fffdf3" opacity=".43"/>
  <ellipse cx="511" cy="848" rx="286" ry="70" fill="#6da591" opacity=".19" filter="url(#shadow)"/>
  <path d="M234 745V391c0-165 119-281 278-281S790 226 790 391v354" stroke="#c6bbda" stroke-width="113" stroke-linecap="round"/>
  <path d="M234 745V391c0-165 119-281 278-281S790 226 790 391v354" stroke="url(#portal)" stroke-width="91" stroke-linecap="round"/>
  <path d="M234 745V391c0-165 119-281 278-281S790 226 790 391v354" stroke="#fffdf8" stroke-width="15" opacity=".8" stroke-linecap="round"/>
  <path d="M296 745V390c0-126 88-218 216-218S728 264 728 390v355Z" fill="#f4edf9" opacity=".76"/>
  <path d="M512 106 544 166 512 228l-32-62 32-60Z" fill="#fff0c6" stroke="#ecd1b0" stroke-width="11"/>
  <path d="M512 128 525 166 512 205 499 166l13-38Z" fill="#ddcefb"/>
  <path d="M257 740q255-92 510 0l-28 76q-220 64-462 0l-20-76Z" fill="#a8dbc0" stroke="#80ba9b" stroke-width="11"/>
  <ellipse cx="512" cy="752" rx="301" ry="55" fill="#c1e7c6" stroke="#87bca4" stroke-width="8"/>
  <g transform="translate(169 195) scale(6.6)">
    <path d="M27 40C4 31 2 13 11 8c12-7 26 13 29 26Z" fill="#bfe7c2" stroke="#85b195" stroke-width="2.5"/>
    <path d="M77 40c23-9 25-27 16-32-12-7-26 13-29 26Z" fill="#bfe7c2" stroke="#85b195" stroke-width="2.5"/>
    <path d="M52 29C35 23 34 10 39 8c15 4 18 15 13 21Z" fill="#a5d5ae"/>
    <path d="M54 29c1-17 11-22 22-20-3 13-10 18-22 20Z" fill="#8dc8a8"/>
    <path d="M52 28c18-4 32 7 38 22 4 11 0 20-5 27 2 10-8 16-18 16-5 6-17 8-23 2-13 3-21-4-23-12-10-5-13-18-7-30 6-16 19-26 38-25Z" fill="url(#fur)" stroke="#ac9b90" stroke-width="2.2"/>
    <ellipse cx="39" cy="51" rx="7" ry="9" fill="#303440"/><ellipse cx="65" cy="51" rx="7" ry="9" fill="#303440"/>
    <ellipse cx="37" cy="47" rx="2.6" ry="3.3" fill="white"/><ellipse cx="63" cy="47" rx="2.6" ry="3.3" fill="white"/>
    <ellipse cx="26" cy="65" rx="9" ry="5" fill="#ffc6cf"/><ellipse cx="78" cy="65" rx="9" ry="5" fill="#ffc6cf"/>
    <path d="M49 64q3-3 6 0M47 68q5 5 10 0" stroke="#a47571" stroke-width="2.3" stroke-linecap="round"/>
    <ellipse cx="34" cy="86" rx="9" ry="6" fill="#fff9f3" stroke="#d1bfb2"/><ellipse cx="70" cy="86" rx="9" ry="6" fill="#fff9f3" stroke="#d1bfb2"/>
    <circle cx="56" cy="19" r="5" fill="#ffd1d8"/><circle cx="63" cy="24" r="5" fill="#ffd1d8"/>
    <circle cx="59" cy="31" r="5" fill="#ffd2d7"/><circle cx="51" cy="31" r="5" fill="#ffd2d7"/><circle cx="48" cy="24" r="5" fill="#ffd2d7"/><circle cx="56" cy="26" r="4" fill="#f2d48c"/>
  </g>
  <path d="m160 347 12 30 30 12-30 12-12 30-12-30-30-12 30-12 12-30Z" fill="#fff3d2" stroke="#e7cda6" stroke-width="5"/>
  <path d="m846 303 9 23 23 9-23 9-9 23-9-23-23-9 23-9 9-23Z" fill="#fff3d2" stroke="#e7cda6" stroke-width="4"/>
</svg>`;

async function main() {
  const outputs = [
    ["public/icon-192.png", 192],
    ["public/icon-512.png", 512],
    ["public/apple-touch-icon.png", 180],
    ["ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", 1024],
  ];
  // Use the actual premium Pico illustration where available. Fall back to
  // the vector silhouette only when the original asset is absent.
  const premium = path.join(root, "public", "storybook-premium", "pico2.webp");
  const artSource = fs.existsSync(premium)
    ? await sharp(premium).extract({left: 85, top: 42, width: 340, height: 340})
        .resize(1024, 1024, { fit: "cover" }).png().toBuffer()
    : Buffer.from(svg);
  for (const [relative, size] of outputs) {
    const dest = path.join(root, relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await sharp(artSource).resize(size, size).flatten({ background: "#fff7f2" }).removeAlpha().png().toFile(dest);
    const { width, height, hasAlpha } = await sharp(dest).metadata();
    if (width !== size || height !== size || hasAlpha) throw new Error("Invalid icon: " + relative);
    console.log("GENERATED", relative, width, height, fs.existsSync(premium) ? "premium-pixel-art" : "vector-fallback");
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
