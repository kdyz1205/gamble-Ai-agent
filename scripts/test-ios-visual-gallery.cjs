const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const sharp = require("sharp");
const {SCREENS} = require("./build-ios-visual-gallery.cjs");

const out = fs.mkdtempSync(path.join(os.tmpdir(), "sum-ios-gallery-contract-"));
function execute() {
  return spawnSync(process.execPath, [path.join(__dirname,"build-ios-visual-gallery.cjs")], {
    cwd:path.resolve(__dirname,".."),
    env:{...process.env, SUM_IOS_OUTPUT:out, GITHUB_SHA:"f".repeat(40)},
    encoding:"utf8", timeout:60000,
  });
}
async function main() {
  try {
    const input = {results:Array.from({length:39},()=>({passed:true})),runAt:"2026-10-23T00:00:00Z",base:"http://localhost:3000"};
    fs.writeFileSync(path.join(out,"results.json"),JSON.stringify(input));
    let result=execute();
    assert.notEqual(result.status,0,"missing real screenshot files must reject");

    const files=[...new Set(SCREENS.filter(x=>x[3]!=="actual-icon-asset").map(x=>x[2]))];
    const pixel=await sharp({create:{width:390,height:844,channels:3,background:"#faf4ff"}})
      .png().toBuffer();
    for(const file of files) fs.writeFileSync(path.join(out,file),pixel);
    result=execute();
    assert.equal(result.status,0,result.stderr||result.stdout);
    assert.match(result.stdout,/IOS_20_REFERENCE_GALLERY_PASS 20 panels/);
    const manifest=JSON.parse(fs.readFileSync(path.join(out,"SUM_iOS_20_Screen_Manifest.json"),"utf8"));
    assert.equal(manifest.panels.length,20);
    assert.equal(manifest.panels[4].route,"/app/today");
    assert.equal(manifest.panels[7].route,"/app/today");
    assert.equal(manifest.panels[19].type,"actual-icon-asset");
    const nativeIcon=path.join(__dirname,"..","ios","App","App","Assets.xcassets","AppIcon.appiconset","AppIcon-512@2x.png");
    assert.deepEqual(fs.readFileSync(path.join(out,"20-App-Icon-Asset.png")),fs.readFileSync(nativeIcon));
    const html=fs.readFileSync(path.join(out,"SUM_iOS_20_Screen_Gallery.html"),"utf8");
    assert.equal((html.match(/<article class="card">/g)||[]).length,20);
    assert.ok(fs.statSync(path.join(out,"SUM_iOS_20_Actual_Reference_Panels.jpg")).size>20_000);

    input.results[0].passed=false;
    fs.writeFileSync(path.join(out,"results.json"),JSON.stringify(input));
    result=execute();
    assert.notEqual(result.status,0,"failed browser acceptance must reject");
    assert.match(result.stderr,/full, passing browser acceptance/);
    console.log("IOS_VISUAL_GALLERY_TESTS_PASS 3/3: missing, real assets, failed check");
  } finally {
    fs.rmSync(out,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
