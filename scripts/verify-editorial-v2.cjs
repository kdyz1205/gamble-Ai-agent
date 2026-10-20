/* Real-browser presentation regression. Never creates quests, uploads proof or spends credits. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const BASE = process.env.EDITORIAL_BASE_URL || 'http://127.0.0.1:3047';
const OUT = process.env.EDITORIAL_EVIDENCE_DIR || path.join(process.cwd(), 'output/editorial-v2');
const routes = [['01-home','/enter'],['02-create','/summons'],['03-rules','/contracts/bind'],['04-proof','/duel/demo'],['05-pico','/rituals'],['06-results','/judgment/demo']];
const sizes = process.env.EDITORIAL_QUICK ? [1440,390] : [1440,390,320,768,1024,1920];
fs.mkdirSync(OUT,{recursive:true});
const report = { base: BASE, checkedAt: new Date().toISOString(), cases: [], screenshots: [] };
async function check(name, fn) { try { const detail=await fn();report.cases.push({name,passed:true,detail});console.log('PASS '+name); } catch(e) {report.cases.push({name,passed:false,error:e.message});console.error('FAIL '+name+' '+e.message);} }
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-extensions']});
  try {
    for(const width of sizes){
      const context=await browser.newContext({viewport:{width,height:width<=430?844:1000},deviceScaleFactor:1,reducedMotion:'reduce'});
      const page=await context.newPage();
      for(const [slug,route] of routes){
        await check(route+' at '+width+'px',async()=>{
          const errors=[];const listener=e=>errors.push(e.message);page.on('pageerror',listener);
          try {
            const response=await page.goto(BASE+route,{waitUntil:'networkidle',timeout:60000});
            assert.equal(response.status(),200);
            await page.locator('h1').waitFor();
            assert.equal(await page.locator('h1').count(),1,'one H1 per page');
            assert.equal(await page.locator('[data-design-version="editorial-v2"]').count(),1);
            assert.equal(await page.locator('.quest-world-scene,.sum-world-shell').count(),0,'old meadow composition must be absent');
            const visibility=await page.locator('h1').evaluate(el=>{for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||+s.opacity<.9)return false;}return true;});
            assert(visibility,'heading and all ancestors visibly rendered');
            const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
            assert(overflow<=1,'horizontal overflow '+overflow);
            assert.equal(await page.locator('[data-design-version]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(247, 245, 239)');
            assert.deepEqual(errors,[],'no uncaught runtime errors');
            if(width===1440||width===390){
              const file=path.join(OUT,slug+'-'+width+'.png');const viewport=path.join(OUT,slug+'-'+width+'-viewport.png');
              await page.screenshot({path:file,fullPage:true,animations:'disabled'});await page.screenshot({path:viewport,animations:'disabled'});
              report.screenshots.push({route,width,file,viewport});
            }
            return {heading:await page.locator('h1').innerText(),overflow};
          } finally {page.off('pageerror',listener);}
        });
      }
      await context.close();
    }
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const page=await context.newPage();
    await check('Primary CTA reaches working composer',async()=>{
      await page.goto(BASE+'/enter',{waitUntil:'networkidle'});
      await page.getByRole('link',{name:'Make your first quest'}).click();
      await page.waitForURL(/\/summons(?:\?|$)/);
      await page.getByRole('textbox',{name:'Describe your challenge'}).waitFor();
    });
    await check('Example selection fills the real composer without submitting',async()=>{
      const input=page.getByRole('textbox',{name:'Describe your challenge'});
      assert.equal(await page.getByRole('button',{name:'Summon',exact:true}).isDisabled(),true);
      await page.getByRole('button',{name:'Meet me on the court'}).click();
      await page.waitForFunction(()=>document.querySelector('textarea')?.value.includes('3 rallies'));
      assert((await input.inputValue()).includes('3 rallies'));
      assert.equal(await page.getByRole('button',{name:'Summon',exact:true}).isEnabled(),true);
    });
    await check('Original quest terms remain editable',async()=>{
      await page.locator('.quest-terms summary').click();
      await page.getByRole('spinbutton').fill('0');
      await page.getByRole('button',{name:'72 hours',exact:true}).click();
      assert((await page.locator('.quest-terms summary').innerText()).includes('0 credits'));
      assert((await page.locator('.quest-terms summary').innerText()).includes('72 hours'));
    });
    await check('Sample result has no fabricated confidence claim',async()=>{
      await page.goto(BASE+'/judgment/demo',{waitUntil:'networkidle'});
      const text=await page.locator('main').innerText();assert(text.includes('EXAMPLE ONLY'));assert(!text.includes('98%'));assert(text.includes('No real participant evidence'));
      await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedExample=text;}}});});
      await page.getByRole('button',{name:'Share this example'}).click();
      await page.getByRole('status').filter({hasText:'Example link copied.'}).waitFor();
      const copied=await page.evaluate(()=>window.__copiedExample);assert(copied.includes('illustrative example'));assert(copied.includes('/judgment/demo'));
      return 'Clipboard mocked only to verify the explicitly labelled example share text.';
    });
    await check('Legacy profile redirect remains intact',async()=>{
      await page.goto(BASE+'/profile',{waitUntil:'domcontentloaded'});assert.equal(new URL(page.url()).pathname,'/me');
    });
    await check('Keyboard skip link lands on main content',async()=>{
      await page.goto(BASE+'/enter',{waitUntil:'networkidle'});await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').innerText(),'Skip to main content');await page.keyboard.press('Enter');assert.equal(await page.locator(':focus').getAttribute('id'),'world-introduction');
    });
    await context.close();
    const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
    const plain=await noJs.newPage();
    await check('No-JavaScript landing CTA still navigates',async()=>{
      await plain.goto(BASE+'/enter');await plain.getByRole('link',{name:'Make your first quest'}).click();assert.equal(new URL(plain.url()).pathname,'/summons');assert.equal(await plain.locator('h1').count(),1);
    });await noJs.close();
  } finally {await browser.close();}
  report.failed=report.cases.filter(x=>!x.passed).length;report.passed=report.cases.length-report.failed;
  fs.writeFileSync(path.join(OUT,'verification.json'),JSON.stringify(report,null,2));
  console.log('RESULT '+report.passed+'/'+report.cases.length+' passed. Evidence '+OUT);
  process.exitCode=report.failed?1:0;
})().catch(e=>{console.error(e.stack);fs.writeFileSync(path.join(OUT,'verification-incomplete.json'),JSON.stringify(report,null,2));process.exitCode=1;});
