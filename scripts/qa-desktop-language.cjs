const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const base = (process.env.TEST_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const out = process.env.SUM_LANGUAGE_OUTPUT || 'output/desktop-language';
const expectedSha = process.env.SUM_SOURCE_SHA || execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim();
fs.mkdirSync(out,{recursive:true});
const cases = [
 ['today-en','/app/today','en','light',390],['today-zh','/app/today','zh','light',390],
 ['today-en','/app/today','en','light',1440],['today-zh','/app/today','zh','light',1440],
 ['profile-zh','/app/profile','zh','light',390],['profile-zh','/app/profile','zh','light',1440],
 ['create-zh','/app/create','zh','light',390],['create-zh','/app/create','zh','light',1440],
 ['settings-zh-night','/app/settings','zh','night',390],['settings-zh-night','/app/settings','zh','night',1440],
 ['discover-zh','/app/discover','zh','light',1440],['community-zh','/app/community','zh','light',390],
 ['quiz-zh','/app/quiz','zh','light',390],['story-zh','/app/story','zh','light',1440],
];
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.SUM_AUTH_SYSTEM_CHROME==='1'?{channel:'chrome'}:{})});
 const results=[];
 try{
  for(const [name,route,language,theme,width] of cases){
   const context=await browser.newContext({viewport:{width,height:width<900?844:1000},locale:'en-US',permissions:[],reducedMotion:'reduce'});
   await context.addInitScript(({language,theme})=>{localStorage.setItem('sum-language',language);localStorage.setItem('sum-ios-appearance',theme);localStorage.setItem('sum-ios-reduced-motion','true');},{language,theme});
   const page=await context.newPage(),errors=[],writes=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.on('request',request=>{if(request.url().includes('/api/')&&!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(request.method()+' '+request.url());});
   const row={name,route,width,language,theme};
   try{
    const response=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForFunction(()=>document.documentElement.lang===localStorage.getItem('sum-language')?.replace('zh','zh-CN'),{},{timeout:15000});
    await page.waitForTimeout(900);
    await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,4000))]));
    const geometry=await page.evaluate(()=>{
     const app=document.querySelector('.ios-app').getBoundingClientRect();
     const main=document.querySelector('.ios-main').getBoundingClientRect();
     const nav=document.querySelector('.ios-tabbar')?.getBoundingClientRect();
     return {appWidth:app.width,mainWidth:main.width,mainLeft:main.left,navRight:nav?.right,navCount:document.querySelectorAll('.ios-tabbar').length,scrollWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),viewport:innerWidth,language:document.documentElement.lang,heading:document.querySelector('h1')?.textContent};
    });
    Object.assign(row,{status:response.status(),...geometry,pageErrors:errors,apiWrites:writes});
    const file=`${name}-${width}.png`;await page.screenshot({path:path.join(out,file),fullPage:true,animations:'disabled'});row.image=file;
    assert.equal(row.status,200);
    assert.equal(row.language,language==='zh'?'zh-CN':'en');
    assert(row.scrollWidth<=width+1,`Horizontal overflow: ${JSON.stringify(row)}`);
    if(width>=900){assert(row.appWidth>1000);assert(row.navRight<=row.mainLeft+1);}
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
    row.pass=true;
   }catch(error){row.pass=false;row.error=error.message;}
   finally{results.push(row);await context.close();}
   console.log(JSON.stringify(row));
  }
 }finally{await browser.close();}
 const receipt={base,sha:expectedSha,checkedAt:new Date().toISOString(),mode:'actual anonymous pages; local interface language/theme only; no user records or remote mutations',passed:results.filter(r=>r.pass).length,total:results.length,results};
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));
 console.log(`DESKTOP_LANGUAGE_VISUAL ${receipt.passed}/${receipt.total}`);
 if(receipt.passed!==receipt.total)process.exitCode=1;
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
