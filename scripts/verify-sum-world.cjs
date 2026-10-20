/* Read-only layout and navigation QA. Does not publish, upload, spend credits or change accounts. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const BASE = process.env.SUM_WORLD_BASE_URL || 'http://127.0.0.1:3057';
const OUT = process.env.SUM_WORLD_EVIDENCE_DIR || path.join(process.cwd(), 'output/sum-world-v3');
const routes = [['01-world','/enter'],['02-nexus','/summons'],['03-pact','/contracts/bind'],['04-archive','/duel/demo'],['05-familiar','/rituals'],['06-chronicle','/judgment/demo']];
const widths = process.env.SUM_WORLD_QUICK ? [1440,390] : [1440,390,320,768,1024,1920];
const report = {base:BASE,checkedAt:new Date().toISOString(),cases:[],screenshots:[]};
fs.mkdirSync(OUT,{recursive:true});
async function check(name,operation){try{const detail=await operation();report.cases.push({name,passed:true,detail});console.log('PASS '+name);}catch(error){report.cases.push({name,passed:false,error:error.message});console.error('FAIL '+name+' '+error.message);}}
async function run(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  for(const width of widths){
   const context=await browser.newContext({viewport:{width,height:width<=430?844:1000},deviceScaleFactor:1,reducedMotion:'reduce'});
   const page=await context.newPage();
   for(const [slug,route] of routes){await check(route+' at '+width+'px',async()=>{
    const errors=[];const listener=error=>errors.push(error.message);page.on('pageerror',listener);
    try{
     const response=await page.goto(BASE+route,{waitUntil:'networkidle',timeout:60000});assert.equal(response.status(),200);
     await page.locator('h1').waitFor();assert.equal(await page.locator('h1').count(),1);assert(await page.locator('h1').isVisible());
     assert.equal(await page.locator('[data-design-version="sum-world-v3"]').count(),1);
     assert.equal(await page.locator('.ed-site,.ed-app,.ed-quest-poster,.quest-world-scene').count(),0);
     const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);assert(overflow<=1,'horizontal overflow: '+overflow);
     const text=await page.locator('main').innerText();assert(!/FRIENDLY RIVALRY CLUB|Less scrolling\./i.test(text));assert.deepEqual(errors,[]);
     if(width===1440||width===390){const file=path.join(OUT,slug+'-'+width+'.png');const viewport=path.join(OUT,slug+'-'+width+'-viewport.png');await page.screenshot({path:file,fullPage:true,animations:'disabled'});await page.screenshot({path:viewport,animations:'disabled'});report.screenshots.push({route,width,file,viewport});}
     return {heading:await page.locator('h1').innerText(),overflow};
    }finally{page.off('pageerror',listener);}
   });}
   await context.close();
  }
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const page=await context.newPage();
  await check('SUM identity and primary CTA reach the real composer',async()=>{await page.goto(BASE+'/enter',{waitUntil:'networkidle'});assert((await page.locator('main').innerText()).includes('You are the Summoner.'));await page.getByTestId('world-summon-cta').click();await page.waitForURL(/\/summons(?:\?|$)/);await page.getByRole('textbox',{name:'Describe your challenge'}).waitFor();});
  await check('Portal selection opens the matching creative quest draft',async()=>{await page.goto(BASE+'/enter',{waitUntil:'networkidle'});await page.getByRole('group',{name:'Choose a quest realm'}).getByRole('button',{name:'Create',exact:true}).click();assert.equal(await page.locator('.sw-portal').getAttribute('data-realm'),'craft');await page.getByRole('link',{name:'Summon create quest',exact:true}).click();await page.waitForURL(/seed=craft/);await page.waitForTimeout(600);assert((await page.locator('textarea').inputValue()).includes('creative project'));});
  await check('Unknown seed leaves the draft empty',async()=>{await page.goto(BASE+'/summons?seed=unknown',{waitUntil:'networkidle'});assert.equal(await page.locator('textarea').inputValue(),'');assert(await page.getByRole('button',{name:'Summon',exact:true}).isDisabled());});
  await check('Choosing an example only fills the draft',async()=>{await page.getByRole('button',{name:/A little further, together/}).click();await page.waitForTimeout(300);assert((await page.locator('textarea').inputValue()).includes('3 rallies'));assert(await page.getByRole('button',{name:'Summon',exact:true}).isEnabled());assert.equal(new URL(page.url()).pathname,'/summons');});
  await check('Original quest terms remain editable',async()=>{await page.locator('.quest-terms summary').click();await page.getByRole('spinbutton').fill('0');await page.getByRole('button',{name:'72 hours',exact:true}).click();const text=await page.locator('.quest-terms summary').innerText();assert(text.includes('0 credits'));assert(text.includes('72 hours'));});
  await check('Familiar controls change the role and explanation',async()=>{await page.goto(BASE+'/rituals',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Review',exact:true}).click();assert.equal(await page.locator('.sw-familiar-display').getAttribute('data-familiar-role'),'Review');assert.equal(await page.locator('.sw-familiar-display .sum-familiar').getAttribute('data-mood'),'referee');assert((await page.locator('.sw-familiar-role').innerText()).includes('Ambiguous proof'));assert(!(await page.locator('main').innerText()).includes('72%'));});
  await check('Chronicle is explicitly an unverified example',async()=>{await page.goto(BASE+'/judgment/demo',{waitUntil:'networkidle'});const text=await page.locator('main').innerText();assert(text.includes('EXAMPLE ONLY'));assert(text.includes('No real participant evidence'));assert(!text.includes('98%'));assert(await page.getByRole('button',{name:'Share this example'}).isEnabled());});
  await check('Legacy account redirect still works',async()=>{await page.goto(BASE+'/profile',{waitUntil:'domcontentloaded'});assert.equal(new URL(page.url()).pathname,'/me');});
  await check('Keyboard skip link focuses the main region',async()=>{await page.goto(BASE+'/enter',{waitUntil:'networkidle'});await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').innerText(),'Skip to main content');await page.keyboard.press('Enter');assert.equal(await page.locator(':focus').getAttribute('id'),'world-introduction');});
  await check('Mobile navigation reaches the Familiar Sanctuary',async()=>{await page.setViewportSize({width:390,height:844});await page.goto(BASE+'/summons',{waitUntil:'networkidle'});const nav=page.locator('.quest-mobile-dock');assert(await nav.isVisible());await nav.getByRole('link',{name:'Familiars',exact:true}).click();await page.waitForURL(/\/rituals$/);assert((await page.locator('h1').innerText()).includes('Your Familiar.'));});
  await context.close();
  const plainContext=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});const plain=await plainContext.newPage();
  await check('Without JavaScript, the world and main CTA still render',async()=>{await plain.goto(BASE+'/enter');assert(await plain.locator('h1').isVisible());await plain.getByTestId('world-summon-cta').click();assert.equal(new URL(plain.url()).pathname,'/summons');assert(await plain.locator('h1').isVisible());});await plainContext.close();
 }finally{await browser.close();}
 report.failed=report.cases.filter(item=>!item.passed).length;report.passed=report.cases.length-report.failed;fs.writeFileSync(path.join(OUT,'verification.json'),JSON.stringify(report,null,2));console.log('RESULT '+report.passed+'/'+report.cases.length+' passed');process.exitCode=report.failed?1:0;
}
run().catch(error=>{console.error(error.stack);fs.writeFileSync(path.join(OUT,'verification-incomplete.json'),JSON.stringify(report,null,2));process.exitCode=1;});
