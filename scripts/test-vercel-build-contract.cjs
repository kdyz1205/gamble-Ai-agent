"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const ignore=require("ignore");
const {
  verifyVercelTarget,ACTIVE_GITHUB_VERCEL_PROJECT,
}=require("./verify-vercel-target.cjs");

const root=path.resolve(__dirname,"..");
const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
const project=JSON.parse(fs.readFileSync(path.join(root,"vercel.json"),"utf8"));
let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const fails=(fn,regex,m)=>{assert.throws(fn,regex,m);checks++;};

eq(project.buildCommand,"npm run build:vercel",
  "Cloud Vercel must use the same reviewed build script as local CI");
eq(pkg.scripts["build:vercel"],"prisma generate && next build",
  "Cloud build generates Prisma Client and Next but never touches DB schema");
eq(pkg.scripts.build,"prisma generate && next build",
  "Local and cloud compile the same application");
for(const name of ["build:vercel","build"]){
  assert.doesNotMatch(pkg.scripts[name],
    /(?:prisma\s+migrate|prisma\s+db\s+push|prisma\s+studio)/i,
    "Build cannot update production DB from Vercel: "+name);
  checks++;
}
const rules=ignore().add(fs.readFileSync(path.join(root,".vercelignore"),"utf8"));
for(const file of ["prisma/schema.prisma","prisma/migrations/migration_lock.toml",
    "src/lib/db.ts","src/app/app/[view]/page.tsx"]){
  eq(rules.ignores(file),false,"Vercel deploy retains source: "+file);
}
eq(ACTIVE_GITHUB_VERCEL_PROJECT,"stubborn",
  "Active GitHub auto-deployment Vercel project is explicit");

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"vercel-target-check-"));
try{
  const dir=path.join(tmp,".vercel");
  fs.mkdirSync(dir,{recursive:true});
  const linked=path.join(dir,"project.json");
  const make=name=>fs.writeFileSync(linked,JSON.stringify({
    projectName:name,projectId:"prj_Test1234",orgId:"team_Test5678",
  }));
  fails(()=>verifyVercelTarget(tmp),/VERCEL_NOT_LINKED/,
    "A missing link cannot accidentally choose a deployment project");
  make("stubborn");
  eq(verifyVercelTarget(tmp).verified,true,
    "Correct project link passes without network access");
  make("gamble-ai-agent");
  fails(()=>verifyVercelTarget(tmp),/VERCEL_PROJECT_MISMATCH/,
    "Historical Windows CLI mis-link is detected and blocked");
  make("stubborn");
  eq(verifyVercelTarget(tmp,"stubborn").project,"stubborn",
    "Explicit expected project is verified");
  fs.writeFileSync(linked,"not-json");
  fails(()=>verifyVercelTarget(tmp),/VERCEL_LINK_INVALID/,
    "Malformed local link never authorizes a deployment");
  fs.writeFileSync(linked,JSON.stringify({projectName:"stubborn"}));
  fails(()=>verifyVercelTarget(tmp),/VERCEL_LINK_INVALID/,
    "Missing project ID/team ID cannot silently pass preflight");
  fails(()=>verifyVercelTarget(tmp,"INVALID PROJECT"),/VERCEL_EXPECTED_PROJECT_INVALID/,
    "Unsafe project slug cannot be used to bypass verification");
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log("VERCEL_BUILD_AND_PROJECT_GUARD_PASS",checks,"checks");
