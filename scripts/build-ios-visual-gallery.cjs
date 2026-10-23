/**
 * Create a faithful 20-reference-panel contact sheet from screenshots captured
 * by scripts/qa-ios-full-app.cjs against an actual running app.
 *
 * This is a review artifact, NOT 20 separate backend route implementations.
 * Home and Today share /app/today. Four Quest-specific screens are genuine
 * guarded "no Quest ID" states. Panel 20 displays the shipped App Icon asset.
 * No fake user, Quest, proof, social engagement, or settlement is generated.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.resolve(process.env.SUM_IOS_OUTPUT || path.join(ROOT, "output", "ios-full-app"));
const ICON = path.join(ROOT, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png");
const COMMIT = process.env.GITHUB_SHA || "local-unknown";
const SCREENS = [
  ["01", "Splash", "splash-390.png", "screen"],
  ["02", "Onboarding 1", "onboarding-1.png", "screen"],
  ["03", "Onboarding 2", "onboarding-2.png", "screen"],
  ["04", "Onboarding 3", "onboarding-3.png", "screen"],
  ["05", "Home", "today-390.png", "shared-home-today"],
  ["06", "Quest Setup", "create-390.png", "screen"],
  ["07", "Quest Created", "quest-created-390.png", "missing-quest-id"],
  ["08", "Today / Check-ins", "today-390.png", "shared-home-today"],
  ["09", "Quest Detail", "quest-390.png", "missing-quest-id"],
  ["10", "Add Evidence", "evidence-add-390.png", "missing-quest-id"],
  ["11", "Quest Complete", "quest-complete-390.png", "missing-quest-id"],
  ["12", "Discover", "discover-390.png", "screen"],
  ["13", "My Picos", "picos-390.png", "screen"],
  ["14", "Profile", "profile-390.png", "guest-screen"],
  ["15", "Achievements", "achievements-390.png", "guest-screen"],
  ["16", "Evidence Gallery", "evidence-390.png", "guest-screen"],
  ["17", "Stats", "stats-390.png", "guest-screen"],
  ["18", "Community", "community-390.png", "screen"],
  ["19", "Settings", "settings-390.png", "screen"],
  ["20", "App Icon", "20-App-Icon-Asset.png", "actual-icon-asset"],
];

const escXml = value => String(value)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const escHtml = value => String(value)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

async function main() {
  const resultsFile = path.join(OUTPUT, "results.json");
  const results = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
  if (!Array.isArray(results.results) || results.results.length < 38 ||
      results.results.some(row => row.passed !== true)) {
    throw new Error("A full, passing browser acceptance is required for a screenshot gallery");
  }
  if (SCREENS.length !== 20) throw new Error("The reference panel map must have exactly 20 entries");

  fs.copyFileSync(ICON, path.join(OUTPUT, "20-App-Icon-Asset.png"));
  const sheet = { columns: 5, rows: 4, tileW: 210, tileH: 490, gap: 13, top: 96 };
  const width = sheet.columns * sheet.tileW + (sheet.columns + 1) * sheet.gap;
  const height = sheet.top + sheet.rows * sheet.tileH + (sheet.rows + 1) * sheet.gap;
  const rectangles = [
    '<rect width="100%" height="100%" fill="#f7f2fc"/>',
    '<text x="18" y="39" fill="#302952" font-size="26" font-family="Arial, sans-serif" font-weight="bold">SUM iOS — 20 design reference panels</text>',
    '<text x="18" y="68" fill="#746b91" font-size="13" font-family="Arial, sans-serif">Actual running UI screens, except Panel 20 (icon asset). Guest states and shared routes are labeled.</text>',
  ];
  const overlays = [], records = [];
  const cards = [];
  for (const [index, [num, title, file, kind]] of SCREENS.entries()) {
    const fullPath = path.join(OUTPUT, file);
    if (!fs.existsSync(fullPath)) throw new Error("Missing real UI screenshot or icon: " + fullPath);
    const stat = fs.statSync(fullPath);
    const meta = await sharp(fullPath).metadata();
    if (meta.format !== "png" || meta.width < 320 || meta.height < 320)
      throw new Error("Invalid captured image size: " + file);
    const data = fs.readFileSync(fullPath);
    const x = sheet.gap + (index % sheet.columns) * (sheet.tileW + sheet.gap);
    const y = sheet.top + sheet.gap + Math.floor(index / sheet.columns) * (sheet.tileH + sheet.gap);
    rectangles.push(
      '<rect x="' + x + '" y="' + y + '" width="' + sheet.tileW + '" height="' +
      sheet.tileH + '" rx="17" fill="#fffefe" stroke="#e4dcf0" stroke-width="1"/>',
      '<text x="' + (x+10) + '" y="' + (y+21) +
      '" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#403563">' +
      escXml(num+" "+title) + '</text>'
    );
    const subtitle = kind === "shared-home-today" ? "Same /app/today route" :
      kind === "missing-quest-id" ? "Real no-ID guard state" :
      kind === "guest-screen" ? "Guest / auth protected" :
      kind === "actual-icon-asset" ? "Real native iOS icon asset" : "Real browser render";
    rectangles.push('<text x="' + (x+10) + '" y="' + (y+sheet.tileH-13) +
      '" font-family="Arial,sans-serif" font-size="10" fill="#79718e">' +
      escXml(subtitle) + '</text>');
    let thumb;
    if (kind === "actual-icon-asset") {
      thumb = await sharp(data).resize(174,174).png().toBuffer();
      overlays.push({input:thumb,left:x+18,top:y+134});
    } else {
      const clipW = Math.min(390,meta.width);
      const clipH = Math.min(844,meta.height);
      // First viewport only in the contact sheet, even for full-page captures.
      thumb = await sharp(data).extract({left:0,top:0,width:clipW,height:clipH})
        .resize(186,403,{fit:"fill"}).png().toBuffer();
      overlays.push({input:thumb,left:x+12,top:y+34});
    }
    records.push({
      panel:Number(num),title,file,
      type:kind,
      route:kind==="actual-icon-asset" ? null :
        kind==="shared-home-today" ? "/app/today" :
        ({ "01":"/app/splash","02":"/app/onboarding","03":"/app/onboarding",
          "04":"/app/onboarding","06":"/app/create","07":"/app/quest-created",
          "09":"/app/quest","10":"/app/evidence-add",
          "11":"/app/quest-complete","12":"/app/discover",
          "13":"/app/picos","14":"/app/profile","15":"/app/achievements",
          "16":"/app/evidence","17":"/app/stats","18":"/app/community",
          "19":"/app/settings"})[num],
      width:meta.width,height:meta.height,bytes:stat.size,
      sha256:crypto.createHash("sha256").update(data).digest("hex"),
    });
    cards.push('<article class="card"><h2>'+escHtml(num+" · "+title)+'</h2>'+
      '<a href="'+escHtml(file)+'"><img src="'+escHtml(file)+'" alt="'+
      escHtml(title)+'" loading="lazy"></a><p>'+escHtml(subtitle)+'</p></article>');
  }
  const backdrop = Buffer.from('<svg width="'+width+'" height="'+height+
    '" xmlns="http://www.w3.org/2000/svg">'+rectangles.join("")+'</svg>');
  await sharp(backdrop).composite(overlays).jpeg({quality:86,mozjpeg:true})
    .toFile(path.join(OUTPUT,"SUM_iOS_20_Actual_Reference_Panels.jpg"));

  const disclaimer =
    "Based on actual 390px-wide React UI browser screenshots from a clean CI run. " +
    "Panel 20 contains the native iOS AppIcon asset, not a runtime screenshot. " +
    "Home and Today share one route. Missing-ID Quest screens show real guarded empty states. " +
    "Guest pages do not imply authenticated user records.";
  const html = [
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>SUM iOS Actual 20 Reference Panels</title>',
    '<style>body{margin:0 auto;max-width:1200px;background:#f7f2fc;color:#332c53;font-family:system-ui;padding:24px}',
    'p{color:#716b85;line-height:1.65}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}',
    '.card{background:#fff;border:1px solid #e5dbf1;border-radius:19px;padding:12px}',
    '.card img{display:block;width:100%;max-height:680px;object-fit:contain;border-radius:10px;background:#faf7fd}',
    'h2{font-size:15px;margin:0 0 9px}.card p{font-size:11px}</style></head><body>',
    '<h1>SUM iOS — real screens and assets</h1>',
    '<p>'+escHtml(disclaimer)+'</p>',
    '<p>Commit: <code>'+escHtml(COMMIT)+'</code> · Acceptance checks: '+
      results.results.length+'/'+results.results.length+' passing</p>',
    '<div class="grid">'+cards.join("")+'</div></body></html>'
  ].join("");
  fs.writeFileSync(path.join(OUTPUT,"SUM_iOS_20_Screen_Gallery.html"),html,"utf8");
  fs.writeFileSync(path.join(OUTPUT,"SUM_iOS_20_Screen_Manifest.json"),
    JSON.stringify({commit:COMMIT,capturedAt:results.runAt,source:results.base,
      acceptanceChecks:results.results.length,disclaimer,panels:records},null,2));
  console.log("IOS_20_REFERENCE_GALLERY_PASS",records.length,"panels",
    "out="+path.join(OUTPUT,"SUM_iOS_20_Actual_Reference_Panels.jpg"));
}
if (require.main===module) main().catch(error=>{console.error(error);process.exitCode=1});
module.exports={SCREENS};
