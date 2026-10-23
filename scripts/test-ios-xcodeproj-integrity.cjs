/**
 * Read-only Xcode project referential integrity gate.
 * An earlier PrivacyInfo file reference accidentally reused an XCBuildConfiguration
 * object id, causing macOS Xcode 16.4 to crash while opening App.xcodeproj.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = path.resolve(__dirname,"../ios/App/App.xcodeproj/project.pbxproj");
const project = fs.readFileSync(source,"utf8");

function validate(text) {
  const definitions = new Map();
  const errors = [];
  const re = /^\t\t([A-F0-9]{24})(?:\s*\/\*[^\n]*?\*\/)?\s*=\s*\{/gm;
  for (const match of text.matchAll(re)) {
    const id=match[1];
    const after=text.slice(match.index,match.index+280);
    const isa=after.match(/\bisa\s*=\s*([A-Za-z0-9_]+)\s*;/)?.[1]||"unknown";
    if(definitions.has(id)) errors.push("Duplicate Xcode object ID "+id+" ("+definitions.get(id)+" vs "+isa+")");
    else definitions.set(id,isa);
  }
  const referenceSections=["PBXGroup","PBXVariantGroup"];
  for(const section of referenceSections) {
    const match=text.match(new RegExp("/\\* Begin "+section+" section \\*/([\\s\\S]*?)/\\* End "+section+" section \\*/"));
    if(!match){errors.push("Missing "+section+" section");continue;}
    const blocks=match[1].matchAll(/children\s*=\s*\(([\s\S]*?)\)\s*;/g);
    for(const block of blocks) {
      for(const ref of block[1].matchAll(/\b([A-F0-9]{24})\b/g)) {
        const isa=definitions.get(ref[1]);
        if(!isa) errors.push("Missing group child "+ref[1]);
        else if(!["PBXGroup","PBXFileReference","PBXVariantGroup","PBXFileSystemSynchronizedRootGroup"].includes(isa))
          errors.push("Invalid group child "+ref[1]+" is "+isa);
      }
    }
  }
  const main=text.match(/\bmainGroup\s*=\s*([A-F0-9]{24})\s*;/)?.[1];
  if(!main||definitions.get(main)!=="PBXGroup") errors.push("mainGroup must point to PBXGroup");
  const nativeFile=text.match(/\b(A4C1E000A000000000000002)\b.*?\/\* PrivacyInfo.xcprivacy \*\//);
  if(!nativeFile||definitions.get(nativeFile[1])!=="PBXFileReference") errors.push("PrivacyInfo must be a file reference");
  const buildFile=text.match(/\b(A4C1E000A000000000000001)\b.*?\/\* PrivacyInfo.xcprivacy in Resources \*\//);
  if(!buildFile||definitions.get(buildFile[1])!=="PBXBuildFile") errors.push("PrivacyInfo resources must point to a build file");
  if(definitions.get("504EC3141FED79650016851F")!=="XCBuildConfiguration")
    errors.push("Debug build config ID must still be XCBuildConfiguration");
  if(definitions.get("504EC3151FED79650016851F")!=="XCBuildConfiguration")
    errors.push("Release build config ID must still be XCBuildConfiguration");
  return {errors,count:definitions.size};
}

const valid=validate(project);
assert.deepEqual(valid.errors,[],"Native Xcode project must have unique object IDs and valid group references");
const regressed=project
  .replaceAll("A4C1E000A000000000000001","504EC3141FED79650016851F")
  .replaceAll("A4C1E000A000000000000002","504EC3151FED79650016851F");
const broken=validate(regressed);
assert(broken.errors.some(e=>e.includes("Duplicate Xcode object ID")),"Regression fixture must catch previous Xcode crash");
const badGroup = project.replace("A4C1E000A000000000000002 /* PrivacyInfo.xcprivacy */,","504EC3151FED79650016851F /* PrivacyInfo.xcprivacy */,");
assert(validate(badGroup).errors.some(e=>e.includes("Invalid group child")),"Regression fixture must catch a reference to XCBuildConfiguration inside PBXGroup");
console.log("XCODE_PROJECT_INTEGRITY PASS objects="+valid.count+" duplicated=0 prior-crash=REPRODUCED");
