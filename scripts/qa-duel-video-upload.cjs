"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium } = require("playwright");

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const root = process.env.SUM_VIDEO_QA_OUT || path.join(__dirname,"..","output","site-video-upload");
fs.mkdirSync(root,{recursive:true});

const file = process.env.SUM_312_MOV || path.join(__dirname,"..","public","test-videos","push10.mp4");
const buf = fs.readFileSync(file);
const hash = data => crypto.createHash("sha256").update(data).digest("hex");
const expected = hash(buf);
const filename = path.basename(file);
const mime = filename.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4";
assert(buf.length>1000 && buf.length<80*1024*1024,"Fixture must be a bounded video file");
const ID = "synthetic_site312_" + Date.now();
const A = "synthetic_creator_312", B = "synthetic_opponent_312";
const proofURL = "https://fixture.invalid/__synthetic_312_proof__";
const uploadURL = new URL("/__synthetic_312_upload__", base).href;

const challenge = {
 id:ID,title:"Video evidence upload for badminton",description:"Synthetic route fixture using a downsampled derivative of user's 312.mov; NOT a real contest",
 creatorId:A,creator:{id:A,username:"Creator"},type:"Sport",status:"live",stake:0,stakeToken:"credits",evidenceType:"video",settlementMode:"credits",
 rules:"exactly 5 rallies; higher score wins; no cut video; A grey top, B dark top",
 isPublic:false,visibility:"invite_only",maxParticipants:2,
 deadline:"2027-01-01T00:00:00Z",createdAt:"2026-11-05T00:00:00Z",
 participants:[
  {id:"part_a",role:"creator",status:"accepted",user:{id:A,username:"Creator",image:null}},
  {id:"part_b",role:"opponent",status:"accepted",user:{id:B,username:"Opponent",image:null}}
 ],evidence:[],judgments:[],verdictResponses:[],reviewCase:null
};
const receipts = {date:new Date().toISOString(),testedSource:filename,fixtureSHA256:expected,fixtureBytes:buf.length,mime,site:base,requestKinds:[],unexpectedWrites:[],presignRequests:[],uploadBodies:[],evidenceRows:[],pageErrors:[],passed:false,storageWasMocked:true,aiCalls:0};
(async()=>{
 const browser=await chromium.launch(process.env.CI ? {headless:true} : {channel:"chrome",headless:true});
 try {
   const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:"reduce"});
   page.on("pageerror",e=>receipts.pageErrors.push(e.message));
   const reply=(route,code,obj)=>route.fulfill({status:code,json:obj});
   await page.route("**/*",async route=>{
      const req=route.request(),u=new URL(req.url()), method=req.method(), p=u.pathname;
      const hit=(p==="/api/auth/session"||p==="/api/uploads/evidence-presign"||p==="/api/challenges/"+ID||p==="/api/challenges/"+ID+"/evidence"||p==="/__synthetic_312_upload__");
      if(!hit){
        if(!["GET","HEAD","OPTIONS"].includes(method) && u.origin===new URL(base).origin) receipts.unexpectedWrites.push({method,path:p});
        if(!["GET","HEAD","OPTIONS"].includes(method)) return reply(route,403,{error:"Synthetic route rejects all real writes"});
        return route.continue();
      }
      receipts.requestKinds.push(method+" "+p);
      if(p==="/api/auth/session")return reply(route,200,{user:{id:A,name:"Creator",credits:50,email:"creator@example.invalid"},expires:"2027-01-01T00:00:00Z"});
      if(p==="/api/challenges/"+ID&&method==="GET")return reply(route,200,{challenge});
      if(p==="/api/uploads/evidence-presign"&&method==="POST"){
        const payload=req.postDataJSON();receipts.presignRequests.push(payload);
        if(typeof payload.challengeId!=="string"||payload.challengeId!==ID||payload.contentType!==mime||payload.filename!==filename)
          return reply(route,400,{error:"REJECTED_MALFORMED_UPLOAD_PRESIGN",configured:false});
        return reply(route,200,{configured:true,uploadUrl,publicUrl:proofURL,method:"PUT",headers:{"Content-Type":mime},expiresIn:300});
      }
      if(p==="/__synthetic_312_upload__"&&method==="PUT"){
        const bytes=req.postDataBuffer();receipts.uploadBodies.push({length:bytes.length,sha256:hash(bytes),contentType:req.headers()["content-type"]});return route.fulfill({status:200,body:"accepted mock upload"});
      }
      if(p==="/api/challenges/"+ID+"/evidence"&&method==="POST"){
        const payload=req.postDataJSON();receipts.evidenceRows.push(payload);
        if(receipts.uploadBodies.length===0||payload.url!==proofURL||payload.type!=="video")
          return reply(route,400,{error:"Video was not confirmed by mock storage"});
        const row={id:"evidence_312",challengeId:ID,userId:A,type:"video",url:payload.url,description:payload.description,createdAt:new Date().toISOString()};
        challenge.evidence=[row];
        return reply(route,201,{evidence:row});
      }
      if(p==="/api/challenges/"+ID+"/evidence/blob-handle")return reply(route,503,{error:"Blob fallback blocked deliberately for source-contract test"});
      return reply(route,403,{error:"Blocked synthetic test route"});
   });
   const resp=await page.goto(base+"/challenge/"+ID+"/versus",{waitUntil:"domcontentloaded"});
   receipts.pageHTTP=resp?.status();
   await page.getByLabel("Upload proof file").waitFor({state:"visible",timeout:15000});
   await page.getByLabel("Upload proof file").setInputFiles({name:filename,mimeType:mime,buffer:buf});
   await page.waitForFunction(()=>(document.body.innerText.includes("Proof uploaded!")||document.body.innerText.includes("REJECTED_MALFORMED_UPLOAD_PRESIGN")||document.body.innerText.includes("Blob fallback")||document.body.innerText.includes("configure")||document.body.innerText.includes("Upload failed")),null,{timeout:14000}).catch(()=>{});
   await page.waitForTimeout(900);
   receipts.message=(await page.locator("body").innerText()).slice(-1400);
   receipts.passed=receipts.presignRequests.length===1&&receipts.uploadBodies.length===1&&receipts.evidenceRows.length===1&&receipts.uploadBodies[0].sha256===expected&&challenge.evidence.length===1&&receipts.unexpectedWrites.length===0&&receipts.pageErrors.length===0;
   const filename=path.join(root,receipts.passed?"video-upload-pass.png":"video-upload-failure.png");
   await page.screenshot({path:filename,fullPage:true});receipts.screenshot=filename;
   console.log("SITE_VIDEO_UPLOAD_RESULT",JSON.stringify({...receipts,message:receipts.message.slice(-400)},null,2));
   fs.writeFileSync(path.join(root,"upload-result-"+(process.env.SUM_VIDEO_QA_LABEL||"site")+".json"),JSON.stringify(receipts,null,2));
   if(!receipts.passed)process.exitCode=2;
 }finally{await browser.close();}
})().catch(e=>{receipts.failure=String(e.stack||e);fs.writeFileSync(path.join(root,"upload-result-"+(process.env.SUM_VIDEO_QA_LABEL||"site")+".json"),JSON.stringify(receipts,null,2));console.error(e);process.exitCode=1});
