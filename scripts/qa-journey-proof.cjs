const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{chromium}=require('playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
const out=process.env.SUM_JOURNEY_SCREENS||'output/journey-proof';
const phase=process.env.SUM_CAPTURE_PHASE||'after';
const sha=process.env.SUM_CAPTURE_SHA||require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const id='journey_screen_fixture_20261028',user='journey_screen_owner';
const quest={id,title:'Badminton meetup · 原文规则',description:'Synthetic read-only proof and navigation screen.',type:'Sports',status:'open',creatorId:user,creator:{id:user,username:'Synthetic host'},visibility:'public',isPublic:true,stake:0,evidenceType:'photo',rules:'First to three verified rallies.',proposition:'First to three',arbiter:'ai',maxParticipants:2,deadline:'2027-01-01T12:00:00Z',createdAt:'2026-10-28T00:00:00Z',participants:[{userId:user,user:{id:user,username:'Synthetic host'},status:'accepted',role:'creator'}],evidence:[],judgments:[],_count:{evidence:0,judgments:0}};
const cases=[['discover-filter-en',390,'en','discover'],['detail-origin-en',390,'en','detail'],['discover-no-match-zh',390,'zh','empty'],['onboarding-step2-zh',390,'zh','onboarding'],['proof-en-320',320,'en','proof'],['proof-zh-390',390,'zh','proof'],['proof-zh-night',390,'zh','night'],['proof-zh-desktop',1440,'zh','proof']];
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({...(process.env.SUM_SYSTEM_CHROME==='1'?{channel:'chrome'}:{}),headless:true});const rows=[];try{
for(const[name,width,language,state]of cases){const context=await browser.newContext({viewport:{width,height:844},locale:'en-US',reducedMotion:'reduce'});const page=await context.newPage();const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push(r.method()+' '+new URL(r.url()).pathname);});
await page.addInitScript(({language,night})=>{localStorage.setItem('sum-language',language);if(night)localStorage.setItem('sum-ios-appearance','night');},{language,night:state==='night'});
await page.route('**/api/auth/session',r=>r.fulfill({json:state==='proof'||state==='night'?{user:{id:user,name:'Synthetic host'},expires:'2027-01-01T00:00:00Z'}:{}}));
await page.route('**/api/challenges?*',r=>r.fulfill({json:{challenges:[quest],total:1}}));await page.route('**/api/challenges/'+id,r=>r.fulfill({json:{challenge:{...quest,status:state==='proof'||state==='night'?'live':'open'}}}));
let route='/app/discover';if(state==='onboarding')route='/app/onboarding';if(state==='proof'||state==='night')route='/app/evidence-add?id='+id;
const response=await page.goto(base+route,{waitUntil:'domcontentloaded'});await page.getByTestId('ios-full-app').waitFor();
if(['discover','detail','empty'].includes(state)){
 const input=page.getByRole('textbox',{name:language==='zh'?'搜索 Quest':'Search Quests',exact:true});await input.fill(state==='empty'?'no-match-example':'badminton');
 if(state!=='empty')await page.getByRole('button',{name:'Move',exact:true}).click();
 if(state==='detail'){await page.getByTestId('ios-quest-card').click();await page.getByRole('heading',{name:quest.title,exact:true}).waitFor();}
}else if(state==='onboarding')await page.getByRole('button',{name:language==='zh'?'下一步':'Next',exact:true}).click();
else {await page.locator('.proof-camp').waitFor();await page.locator('.proof-camp textarea').fill('Original player note 原文证据，不应被翻译。');await page.locator('.proof-camp textarea').blur();}
await page.waitForTimeout(300);await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>scrollTo(0,0));
const metrics=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth,active:[...document.querySelectorAll('.ios-tab[aria-current="page"]')].map(e=>e.textContent.trim()),back:document.querySelector('a.ios-back')?.getAttribute('href'),night:!!document.querySelector('.ios-app--night')}));
const image=name+'.png',full=name+'-full.png';await page.screenshot({path:path.join(out,image),animations:'disabled'});await page.screenshot({path:path.join(out,full),fullPage:true,animations:'disabled'});
const row={name,requested:route,url:page.url(),width,language,state,status:response.status(),...metrics,image,full,errors,writes};rows.push(row);console.log(JSON.stringify(row));
if(phase==='after'){assert.equal(errors.length,0,name+' script errors');assert.equal(writes.length,0,name+' business writes');assert(metrics.scroll<=width+1,name+' overflow');if(state==='detail'){assert(metrics.back.startsWith('/app/discover?'));assert(metrics.active.includes('Discover'));}if(state==='night')assert(metrics.night,'Night preference must be real');}
await context.close();
}}finally{await browser.close();}
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({base,sha,phase,scope:'Actual deployed components and CSS with explicit synthetic read-only account/Quest responses; no business writes or competitor claims',total:rows.length,pass:rows.every(r=>r.errors.length===0&&r.writes.length===0&&r.scroll<=r.width+1),rows,checkedAt:new Date().toISOString()},null,2));console.log('JOURNEY_PROOF_VISUAL '+rows.length+'/'+cases.length);
})().catch(e=>{console.error(e.stack);process.exitCode=1});
