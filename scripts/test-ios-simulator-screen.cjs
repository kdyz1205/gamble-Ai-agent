/**
 * Reject false-green native simulator screenshots that contain only a
 * status bar, an all-black WKWebView, or a uniform blank background.
 *
 * Screenshot appearance is a necessary visual smoke, NOT an authenticated
 * proof of successful navigation, account state or gameplay correctness.
 */
const sharp = require("sharp");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

async function analyze(input) {
  const meta = await sharp(input).metadata();
  const width = meta.width || 0, height = meta.height || 0;
  if (width < 320 || height < 600) {
    return {ok:false, reason:"dimensions", width,height};
  }
  // Exclude iOS status bar, home indicator, borders and corner cutouts.
  const left = Math.floor(width * 0.15), top = Math.floor(height * 0.20);
  const cropWidth = Math.max(1,Math.floor(width * 0.70));
  const cropHeight = Math.max(1,Math.floor(height * 0.62));
  const {data,info} = await sharp(input).extract({
    left,top,width:cropWidth,height:cropHeight,
  }).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let sum=0,sumSquares=0, light=0, midDark=0, visible=0, count=0;
  for (let index=0;index<data.length;index+=info.channels*8) {
    const lum=(data[index]*299+data[index+1]*587+data[index+2]*114)/1000;
    sum+=lum;sumSquares+=lum*lum;count++;
    if(lum>100)light++;
    if(lum<165)midDark++;
    if(lum>22)visible++;
  }
  const mean=sum/count;
  const deviation=Math.sqrt(Math.max(0,sumSquares/count-mean*mean));
  const visibleRatio=visible/count,lightRatio=light/count,darkRatio=midDark/count;
  // SUM is an illustrated/light-themed UI. Uniform white and sparse spinners
  // must fail just like an entirely black WKWebView.
  const ok=mean>=30&&deviation>=15&&visibleRatio>=0.12&&
    lightRatio>=0.07&&darkRatio>=0.015;
  return {
    ok,reason:ok?"visible-nonuniform-viewport":"black-or-blank-viewport",
    width,height,mean:+mean.toFixed(2),deviation:+deviation.toFixed(2),
    visibleRatio:+visibleRatio.toFixed(4),
    lightRatio:+lightRatio.toFixed(4),darkRatio:+darkRatio.toFixed(4),
  };
}

async function selfTest() {
  const image=async(background, overlay)=>sharp({
    create:{width:390,height:844,channels:3,background}
  }).composite(overlay||[]).png().toBuffer();
  const black=await image("#000000",[
    {input:Buffer.from('<svg width="390" height="40"><text x="18" y="26" fill="white" font-size="22">9:41</text></svg>'),left:0,top:0},
  ]);
  const white=await image("#ffffff");
  const spinner=await image("#000000",[
    {input:Buffer.from('<svg width="18" height="18"><circle cx="9" cy="9" r="7" fill="white"/></svg>'),left:185,top:410},
  ]);
  const illustrated=await image("#fff7f1",[
    {input:Buffer.from('<svg width="320" height="420"><rect width="320" height="420" fill="#d7a6e9"/><circle cx="160" cy="195" r="100" fill="#498a82"/><circle cx="130" cy="180" r="30" fill="#f5d1ca"/><path d="M30 370h260" stroke="#372a50" stroke-width="27"/></svg>'),left:35,top:210},
  ]);
  assert.equal((await analyze(black)).ok,false,"black WebView must fail");
  assert.equal((await analyze(white)).ok,false,"white blank page must fail");
  assert.equal((await analyze(spinner)).ok,false,"black spinner must fail");
  assert.equal((await analyze(illustrated)).ok,true,"actual colorful content must pass");
  const info=fs.readFileSync(path.join(__dirname,"../ios/App/App/Info.plist"),"utf8");
  const appBounds=info.split("<key>WKAppBoundDomains</key>")[1]?.split("</array>")[0]||"";
  assert.match(appBounds,/<string>localhost<\/string>/,
    "Capacitor's local WebView origin must be in the app-bound whitelist");
  assert.match(appBounds,/<string>summoner\.world<\/string>/,
    "Production WebView host must remain app-bound");
  const workflow=fs.readFileSync(path.join(__dirname,"../.github/workflows/ios-release.yml"),"utf8");
  assert(!workflow.includes("Add :WKAppBoundDomains:1"),
    "Preview app-bound domain insertion must not collide with localhost index 1");
  assert.match(workflow,/Add :WKAppBoundDomains:2 string/,
    "Preview host must append after production and localhost");
  console.log("IOS_SCREEN_VISUAL_GUARD_SELF_TEST_PASS: 4 image fixtures and 4 origin guards");
}
if (require.main===module) {
  (async()=>{
    if(process.argv[2]==="--self-test")return selfTest();
    const file=process.argv[2];
    if(!file)throw Error("Usage: node scripts/test-ios-simulator-screen.cjs <png> or --self-test");
    const result=await analyze(file);
    console.log("IOS_SCREEN_VISUAL_AUDIT",JSON.stringify(result));
    if(!result.ok)process.exitCode=1;
  })().catch(e=>{console.error("IOS_SCREEN_VISUAL_GUARD_ERROR:",e.message);process.exitCode=1;});
}
module.exports={analyze};
