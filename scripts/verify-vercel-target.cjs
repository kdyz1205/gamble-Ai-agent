/**
 * Safety guard for manually executed Vercel CLI deployments.
 * The GitHub integration deploys to "stubborn", but historical local links
 * point to "gamble-ai-agent". This is a READ-ONLY check: never auto-relinks,
 * starts a deployment, touches tokens, or updates a Vercel project.
 */
"use strict";
const fs=require("node:fs");
const path=require("node:path");

const ACTIVE_GITHUB_VERCEL_PROJECT="stubborn";
function verifyVercelTarget(root,expected=ACTIVE_GITHUB_VERCEL_PROJECT){
  if(typeof expected!=="string"||!/^[a-z0-9][a-z0-9-]{0,90}$/.test(expected))
    throw Error("VERCEL_EXPECTED_PROJECT_INVALID: supply an exact Vercel project slug");
  const file=path.join(root,".vercel","project.json");
  if(!fs.existsSync(file))
    throw Error("VERCEL_NOT_LINKED: local .vercel/project.json missing; use 'vercel link' with the intended team/project");
  let link;
  try{link=JSON.parse(fs.readFileSync(file,"utf8"));}
  catch{throw Error("VERCEL_LINK_INVALID: local link is not valid JSON");}
  if(!link||typeof link.projectName!=="string"||
     !/^prj_[a-zA-Z0-9]+$/.test(link.projectId||"")||
     !/^team_[a-zA-Z0-9]+$/.test(link.orgId||""))
    throw Error("VERCEL_LINK_INVALID: missing verifiable project/team identity");
  if(link.projectName!==expected)
    throw Error("VERCEL_PROJECT_MISMATCH: local CLI project name is '"+link.projectName+
      "', but GitHub auto-deploys under '"+expected+
      "'. This might be a stale name after a rename OR a different project. "+
      "Stop and verify the real projectId/team in Vercel Dashboard before relinking; "+
      "never hand-edit local projectId.");
  return {verified:true,project:link.projectName};
}
if(require.main===module){
  try{
    const value=verifyVercelTarget(process.cwd(),process.env.VERCEL_EXPECTED_PROJECT||ACTIVE_GITHUB_VERCEL_PROJECT);
    console.log("VERCEL_TARGET_VERIFIED "+value.project+" — preflight only; no deployment executed");
  }catch(error){
    console.error(error instanceof Error?error.message:"VERCEL_LINK_INVALID");
    process.exitCode=2;
  }
}
module.exports={verifyVercelTarget,ACTIVE_GITHUB_VERCEL_PROJECT};
