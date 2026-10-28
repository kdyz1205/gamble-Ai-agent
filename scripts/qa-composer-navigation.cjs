const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.TEST_BASE_URL||'http://localhost:3000';
const out=process.env.SUM_COMPOSER_SCREENSHOTS||'output/composer-navigation';
const phase=process.env.SUM_CAPTURE_PHASE||'after';
const sha=process.env.SUM_CAPTURE_SHA||require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert(/^[a-f0-9]{40}$/.test(sha));
const cases=[['create-en-320','/app/create',320,667,'en'],['create-zh-390','/app/create',390,844,'zh'],['create-en-1440','/app/create',1440,1000,'en'],['legacy-account-390','/me',390,844,'en'],['privacy-390','/privacy',390,844,'en'],['profile-zh-1440','/app/profile',1440,1000,'zh'],['entry-390','/enter',390,844,'en']];
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({...(process.env.SUM_SYSTEM_CHROME==='1'?{channel:'chrome'}:{}),headless:true});const rows=[];
try{for(const [name,route,width,height,language]of cases){
 const context=await browser.newContext({viewport:{width,height},locale:'en-US',reducedMotion:'reduce'});const page=await context.newPage();const errors=[],writes=[];
 await page.addInitScript(lang=>localStorage.setItem('sum-language',lang),language);
 page.on('pageerror',error=>errors.push(error.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push(r.method()+' '+new URL(r.url()).pathname);});
 const response=await page.goto(base+route,{waitUntil:'domcontentloaded'});await page.waitForTimeout(800);
 await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,3000))]));
 const layout=await page.evaluate(()=>{const action=document.querySelector('button[aria-label="Summon"]');const rect=action?.getBoundingClientRect();const docks=[...document.querySelectorAll('nav.ios-tabbar,nav.sum-app-dock,nav.quest-mobile-dock')].filter(el=>el.getBoundingClientRect().height>0);const dock=docks[0]?.getBoundingClientRect();
 return {scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,docks:docks.length,actionBottom:rect?.bottom??null,dockTop:dock?.top??null,heading:document.querySelector('h1')?.textContent,language:document.documentElement.lang};});
 const image=name+'.png',full=name+'-full.png';await page.screenshot({path:path.join(out,image),animations:'disabled'});await page.screenshot({path:path.join(out,full),fullPage:true,animations:'disabled'});
 const row={name,route,width,height,status:response.status(),...layout,image,full,errors,writes};rows.push(row);console.log(JSON.stringify(row));
 if(phase==='after'){assert.equal(row.status,200);assert(row.scrollWidth<=width+1);assert.equal(errors.length,0);assert.equal(writes.length,0);
  if(route==='/app/create'&&width<900)assert(row.actionBottom<row.dockTop,'Primary action must precede the dock on first view');
  if(route==='/me')assert.equal(row.docks,1);if(route==='/privacy'||route==='/enter')assert.equal(row.docks,0);
 }
 if(phase==='after'&&name==='create-zh-390'){
  await page.locator('[data-testid="pact-composer"] textarea').fill('这是我和朋友已经写好的挑战，请不要覆盖。');
  await page.getByTestId('composer-starter-ideas').locator('summary').click();await page.getByRole('button',{name:'成长',exact:true}).click();
  await page.getByRole('dialog',{name:'替换当前输入？'}).waitFor();await page.screenshot({path:path.join(out,'draft-protection-zh-390.png'),animations:'disabled'});
 }
 await context.close();
}}finally{await browser.close();}
const receipt={base,sha,phase,scope:'Actual pages with anonymous browser and local-only input; no business writes or fabricated accounts',passed:rows.filter(r=>!r.errors.length&&!r.writes.length&&r.scrollWidth<=r.width+1).length,total:rows.length,rows,checkedAt:new Date().toISOString()};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log('COMPOSER_NAV_VISUAL '+receipt.passed+'/'+receipt.total);
})().catch(e=>{console.error(e.stack);process.exitCode=1});
