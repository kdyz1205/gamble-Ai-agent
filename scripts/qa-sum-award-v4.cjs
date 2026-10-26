/**
 * SUM art-direction and workflow browser QA.
 * Read-only: does not publish a quest, accept an agreement, upload proof or modify credits.
 */
const { chromium }=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const BASE=process.env.SUM_AWARD_BASE||'http://127.0.0.1:3067';
const OUT=process.env.SUM_AWARD_EVIDENCE||path.join(process.cwd(),'output/sum-award-v4');
const WIDTHS=process.env.SUM_AWARD_QUICK?[390,1440]:[320,390,768,1024,1440,1920];
const ROUTES=[
  ['world','/enter'],['nexus','/summons'],['pact','/contracts/bind'],
  ['proof','/duel/demo'],['familiar','/rituals'],['chronicle','/judgment/demo'],
];
const report={base:BASE,checkedAt:new Date().toISOString(),screenshots:[],tests:[],metrics:{}};
fs.mkdirSync(OUT,{recursive:true});
async function check(name,fn){
  try {const result=await fn();report.tests.push({name,passed:true,result});console.log('PASS',name);}
  catch(error){report.tests.push({name,passed:false,error:error.message});console.log('FAIL',name,error.message);}
}
async function main(){
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-webgl']});
  try{
    for(const width of WIDTHS){
      const context=await browser.newContext({viewport:{width,height:width<=430?844:950},deviceScaleFactor:1,reducedMotion:'reduce'});
      const page=await context.newPage();
      for(const [name,route] of ROUTES){
        await check(route+' @ '+width+'px',async()=>{
          const errors=[];const listener=e=>errors.push(e.message);page.on('pageerror',listener);
          try{
            const response=await page.goto(BASE+route,{waitUntil:'domcontentloaded',timeout:60000});
            assert.equal(response&&response.status(),200);
            await page.locator('h1').first().waitFor({state:'visible',timeout:20000});
            assert.equal(await page.locator('h1').count(),1);
            const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
            assert(overflow<=1,'horizontal overflow '+overflow);
            assert.equal(await page.locator('[data-design-version="sum-world-v3"]').count(),1);
            assert.deepEqual(errors,[],'uncaught page errors');
            const artifact=await page.locator('.sum-artifact').count();
            const metrics=await page.evaluate(()=>{
              const navigation=performance.getEntriesByType('navigation')[0];
              return {dcl:Math.round(navigation?.domContentLoadedEventEnd||0),jsLoaded:document.scripts.length};
            });
            if(width===1440||width===390){
              await page.waitForTimeout(300);
              const file=path.join(OUT,name+'-'+width+'.png');
              const viewport=path.join(OUT,name+'-'+width+'-viewport.png');
              await page.screenshot({path:file,fullPage:true,animations:'disabled',timeout:25000});
              await page.screenshot({path:viewport,animations:'disabled'});
              report.screenshots.push({route,width,file,viewport});
            }
            return {heading:await page.locator('h1').first().innerText(),overflow,artifact,...metrics};
          }finally{page.off('pageerror',listener);}
        });
      }
      await context.close();
    }
    const context=await browser.newContext({viewport:{width:1440,height:950},reducedMotion:'reduce'});
    const page=await context.newPage();
    await check('SUM portal spatial canvas appears or has a usable fallback',async()=>{
      await page.goto(BASE+'/enter',{waitUntil:'domcontentloaded'});
      const stage=page.getByTestId('sum-spatial-gate');
      await stage.waitFor();
      const renderer=await stage.locator('.sum-realm-canvas').getAttribute('data-renderer');
      assert(['webgl','fallback'].includes(renderer));
      assert(await stage.getByRole('group',{name:'Choose a quest realm'}).isVisible());
      return {renderer};
    });
    await check('Changing real realm selection changes the visual and the destination',async()=>{
      const stage=page.getByTestId('sum-spatial-gate');
      await stage.getByRole('button',{name:'Create',exact:true}).click();
      assert.equal(await stage.getAttribute('data-realm'),'craft');
      assert.equal(await stage.locator('.sum-realm-canvas').getAttribute('data-realm'),'craft');
      await stage.getByRole('link',{name:'Summon create quest'}).click();
      await page.waitForURL(/seed=craft/);
      await page.waitForTimeout(200);
      assert((await page.getByRole('textbox',{name:'Describe your challenge'}).inputValue()).includes('creative project'));
    });
    await check('Nexus portal moves dormant, listening and dormant using real form input',async()=>{
      await page.goto(BASE+'/summons',{waitUntil:'domcontentloaded'});
      const gate=page.getByTestId('live-quest-formation');
      await gate.waitFor();
      assert.equal(await gate.getAttribute('data-stage'),'dormant');
      const editor=page.getByRole('textbox',{name:'Describe your challenge'});
      await editor.fill('First to win 3 badminton rallies');
      await page.waitForTimeout(240);
      assert.equal(await gate.getAttribute('data-stage'),'listening');
      assert((await gate.getByRole('article').count())>0||await gate.getByTestId('live-quest-artifact').count()>0);
      assert((await gate.locator('.sum-live-nexus__pico .sum-familiar').getAttribute('data-mood'))==='listening');
      await editor.fill('');
      await page.waitForTimeout(240);
      assert.equal(await gate.getAttribute('data-stage'),'dormant');
      assert.equal(await gate.locator('.sum-artifact').count(),0);
    });
    await check('Unknown seed cannot bypass editing or confirmation',async()=>{
      await page.goto(BASE+'/summons?seed=UNKNOWN',{waitUntil:'domcontentloaded'});
      assert.equal(await page.getByRole('textbox',{name:'Describe your challenge'}).inputValue(),'');
      assert(await page.getByRole('button',{name:'Summon',exact:true}).isDisabled());
    });
    await check('Nexus example remains editable and terms can change',async()=>{
      await page.getByRole('button',{name:/A little further/}).click();
      await page.waitForTimeout(200);
      assert((await page.getByRole('textbox',{name:'Describe your challenge'}).inputValue()).includes('3 rallies'));
      await page.locator('.quest-terms summary').click();
      await page.getByRole('spinbutton').fill('0');
      await page.getByRole('button',{name:'72 hours',exact:true}).click();
      const text=await page.locator('.quest-terms summary').innerText();
      assert(text.includes('0 credits')&&text.includes('72 hours'));
      assert.equal(new URL(page.url()).pathname,'/summons');
    });
    await check('Quest artifacts evolve across Pact, Proof and Chronicle without fake verification',async()=>{
      for(const [route,stage] of [['/contracts/bind','pact'],['/duel/demo','proof'],['/judgment/demo','chronicle']]){
        await page.goto(BASE+route,{waitUntil:'domcontentloaded'});
        const artifact=page.locator('.sum-artifact').first();
        assert.equal(await artifact.getAttribute('data-quest-stage'),stage);
        assert.equal(await artifact.getAttribute('data-sample'),'true');
        assert((await artifact.innerText()).includes('ILLUSTRATIVE EXAMPLE'));
      }
      assert(!(await page.locator('main').innerText()).includes('98%'));
      assert((await page.locator('main').innerText()).includes('No real participant evidence'));
    });
    await check('Sharing the example never claims a verified result',async()=>{
      await page.evaluate(()=>{
        Object.defineProperty(navigator,'share',{configurable:true,value:undefined});
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__sumTestCopied=value;}}});
      });
      await page.getByRole('button',{name:'Share this example'}).click();
      await page.getByRole('status').filter({hasText:'Example link copied.'}).waitFor();
      const value=await page.evaluate(()=>window.__sumTestCopied);
      assert(value.includes('illustrative example only')&&value.includes('Not a verified result'));
    });
    await check('Pico role controls drive a coherent emotional state',async()=>{
      await page.goto(BASE+'/rituals',{waitUntil:'domcontentloaded'});
      await page.getByRole('button',{name:'Review',exact:true}).click();
      assert.equal(await page.locator('.sw-familiar-display').getAttribute('data-familiar-role'),'Review');
      assert.equal(await page.locator('.sw-familiar-display .sum-familiar').getAttribute('data-mood'),'referee');
    });
    await check('Visible keyboard skip link focuses real main content',async()=>{
      await page.goto(BASE+'/enter',{waitUntil:'domcontentloaded'});
      await page.keyboard.press('Tab');
      assert.equal(await page.locator(':focus').innerText(),'Skip to main content');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator(':focus').getAttribute('id'),'world-introduction');
    });
    await check('Legacy profile redirect still works',async()=>{
      await page.goto(BASE+'/profile',{waitUntil:'domcontentloaded'});
      assert.equal(new URL(page.url()).pathname,'/me');
    });
    await context.close();
    const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
    const plain=await nojs.newPage();
    await check('Without JavaScript the actual SUM CTA still opens the editor',async()=>{
      await plain.goto(BASE+'/enter',{waitUntil:'domcontentloaded'});
      assert(await plain.locator('h1').isVisible());
      await plain.getByTestId('world-summon-cta').click();
      assert.equal(new URL(plain.url()).pathname,'/summons');
    });
    await nojs.close();
  }finally{await browser.close();}
  report.passed=report.tests.filter(x=>x.passed).length;
  report.failed=report.tests.length-report.passed;
  fs.writeFileSync(path.join(OUT,'verification.json'),JSON.stringify(report,null,2));
  console.log('QA_FINAL',report.passed+'/'+report.tests.length,'failed',report.failed);
  process.exitCode=report.failed?1:0;
}
main().catch(error=>{console.error(error.stack);process.exitCode=1});
