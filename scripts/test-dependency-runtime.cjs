const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const sharp=require('sharp');const xcode=require('xcode');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const project=xcode.project(path.join(root,'ios/App/App.xcodeproj/project.pbxproj'));project.parseSync();
 const uuids=new Set(Array.from({length:64},()=>project.generateUuid()));
 assert.equal(uuids.size,64);assert([...uuids].every(id=>/^[A-F0-9]{24}$/.test(id)),'Patched uuid must preserve Xcode UUID shape');
 const target=project.getFirstTarget();assert(target.uuid&&target.firstTarget.name);
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sum-xcode-compat-'));
 try{const dest=path.join(temp,'project.pbxproj');fs.writeFileSync(dest,project.writeSync());const parsed=xcode.project(dest);parsed.parseSync();
  assert.equal(parsed.getFirstTarget().uuid,target.uuid);assert.equal(parsed.getFirstTarget().firstTarget.name,target.firstTarget.name);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
 const png=await sharp({create:{width:8,height:6,channels:4,background:{r:32,g:64,b:128,alpha:1}}}).png().toBuffer();
 const webp=await sharp(png).webp({quality:90}).toBuffer();const info=await sharp(webp).metadata();assert.equal(info.width,8);assert.equal(info.height,6);assert.equal(info.format,'webp');
 const svg=Buffer.from('<svg width="8" height="6" xmlns="http://www.w3.org/2000/svg"><rect width="8" height="6" fill="#246"/></svg>');
 const svgInfo=await sharp(await sharp(svg).png().toBuffer()).metadata();assert.equal(svgInfo.width,8);assert.equal(svgInfo.height,6);
 const Anthropic=require('@anthropic-ai/sdk');const client=new Anthropic({apiKey:'synthetic-no-network',maxRetries:0});assert.equal(typeof client.messages.create,'function');
 console.log('DEPENDENCY_RUNTIME_PASS Xcode parse/UUID/write roundtrip; sharp PNG/WebP/benign-SVG decode; SDK construction without a network request');
})().catch(error=>{console.error(error);process.exitCode=1});
