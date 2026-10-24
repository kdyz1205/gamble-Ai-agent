/**
 * End-to-end read-only screen navigation and responsive acceptance.
 * Never publishes a Quest, joins one, uploads proof or moves credits.
 */
const {chromium}=require("playwright");
const fs=require("node:fs"),path=require("node:path");
const assert=require("node:assert/strict");
const base=process.env.SUM_IOS_URL||"http://127.0.0.1:3091";
const out=process.env.SUM_IOS_OUTPUT||path.resolve("output","ios-full-app");
const pages=process.env.SUM_IOS_WORKFLOW_ONLY?[]:["splash","onboarding","today","discover","create","quest-created","quest",
  "evidence-add","quest-complete","picos","profile","achievements","evidence","stats","community","settings"];
const widths=process.env.SUM_IOS_WORKFLOW_ONLY?[390]:process.env.SUM_IOS_QUICK?[390,1440]:[320,390,768,1440];
fs.mkdirSync(out,{recursive:true});
const evidence={base,pages,widths,runAt:new Date().toISOString(),results:[]};
let failures=0;
function record(name,passed,details={}) {
  evidence.results.push({name,passed,...details});
  console.log(passed?"PASS":"FAIL",name,details.reason||"");
  if(!passed)failures++;
}
const test=async(name,task)=>{
  try { const result=await task();record(name,true,{data:result});}
  catch(e){record(name,false,{reason:e.message});}
};
async function meta(page){
  return page.evaluate(()=>{
    const doc=document.documentElement,body=document.body;
    const nav=document.querySelector('[data-testid="ios-tabbar"]');
    const overflow=Math.max(doc.scrollWidth,body.scrollWidth)-innerWidth;
    const overflowingElements=overflow>1?Array.from(body.querySelectorAll("*"))
      .map(el=>({el,r:el.getBoundingClientRect()}))
      .filter(({r})=>r.width>0&&r.right>innerWidth+1&&r.left>=0)
      .slice(0,8).map(({el,r})=>({
        tag:el.tagName.toLowerCase(),
        className:typeof el.className==="string"?el.className.slice(0,80):"",
        left:Math.round(r.left),right:Math.round(r.right)
      })):[];
    return { width:innerWidth, overflow, overflowingElements,
      bottomNavs:document.querySelectorAll('[data-testid="ios-tabbar"]').length,
      otherNavs:document.querySelectorAll('[data-testid="sum-app-dock"]').length,
      labels:nav?Array.from(nav.querySelectorAll("a")).map(a=>a.getAttribute("aria-label")):[],
      selected:nav?.querySelector('[aria-current="page"]')?.getAttribute("href")||null,
      heading:document.querySelector("h1")?.textContent?.trim(),
      pageHeight:doc.scrollHeight,
      errors:Array.from(document.querySelectorAll('[data-testid="ios-error"]')).length
    };
  });
}
const onboardArtFiles=["pico-portal.webp","dream-portal.webp","pico-companion.webp"];
async function waitForOnboardArtwork(page,step){
  await page.waitForFunction(filename=>{
    const art=document.querySelector(".ios-onboard-art img");
    return !!art && art.currentSrc.includes(filename) && art.complete && art.naturalWidth>0;
  },onboardArtFiles[step],{timeout:20000});
}
(async()=>{
const browser=await chromium.launch({
  headless:true,
  ...(process.platform==="win32" ? {executablePath:process.env.SUM_IOS_CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe"} : {}),
  args:["--disable-extensions","--disable-gpu"]
});
try {
for(const width of widths){
  const small=width<=430;
  const context=await browser.newContext({viewport:{width,height:small?844:960},deviceScaleFactor:1,reducedMotion:"reduce",isMobile:small,hasTouch:small});
  const page=await context.newPage();
  for(const view of pages){
    const name=view+" @"+width;
    await test(name,async()=>{
      const runtimeErrors=[];
      const onError=(e)=>runtimeErrors.push(e.message);
      page.on("pageerror",onError);
      try{
        const r=await page.goto(base+"/app/"+view,{waitUntil:"commit",timeout:60000});
        assert.equal(r.status(),200,"HTTP "+r.status());
        await page.locator('[data-testid="ios-full-app"]').waitFor({state:"visible",timeout:25000});
        await page.waitForFunction(()=>document.querySelector('[data-testid="ios-full-app"]')?.getAttribute("data-hydrated")==="true",null,{timeout:45000});
        await page.locator("[data-hydrated=true]").waitFor({state:"visible",timeout:45000});
        // Screenshots must show the settled public API state, not a transient
        // loading placeholder. This is read-only and fails if it never resolves.
        if(view==="discover"||view==="community"){
          await page.waitForFunction(()=>!document.querySelector(".ios-loading-list"),null,{timeout:20000});
        }
        await page.evaluate(async()=>{const imgs=Array.from(document.images).filter(img=>img.getBoundingClientRect().top<innerHeight+130);await Promise.all(imgs.map(img=>img.decode().catch(()=>null)));});
        const m=await meta(page);
        assert(m.overflow<=1,"horizontal overflow "+m.overflow+"px; "+JSON.stringify(m.overflowingElements));
        const intro=view==="splash"||view==="onboarding";
        assert.equal(m.bottomNavs,intro?0:1,"exactly one appropriate bottom dock");
        assert.equal(m.otherNavs,0,"global marketing nav must not duplicate the app nav");
        if(!intro)assert.deepEqual(m.labels,["Home","Discover","Create","Familiars","Profile"]);
        assert.deepEqual(runtimeErrors,[],"uncaught browser errors");
        assert.equal(m.errors,0,"render failure");
        if(view==="onboarding"&&width===390){
          for(const selector of [".ios-onboard-copy .ios-primary",".ios-onboard-copy .ios-text-action"]){
            const box=await page.locator(selector).evaluate(el=>({
              bottom:Math.round(el.getBoundingClientRect().bottom),height:window.innerHeight
            }));
            assert(box.bottom<=box.height-8,
              "Onboarding action "+selector+" not visible without scroll: "+JSON.stringify(box));
          }
        }
        if(width===390){
          await page.screenshot({path:path.join(out,view+"-390.png"),animations:"disabled",
            fullPage:["today","create","achievements","settings","community","discover"].includes(view),timeout:25000});
        }
        return m;
      } finally {page.off("pageerror",onError);}
    });
  }
  if(width===390){
    await test("Compact iPhone shows every onboarding action without scrolling",async()=>{
      const compact=await browser.newContext({
        viewport:{width:375,height:667},deviceScaleFactor:1,
        reducedMotion:"reduce",isMobile:true,hasTouch:true
      });
      try {
        const shortPage=await compact.newPage();
        await shortPage.goto(base+"/app/onboarding",{waitUntil:"domcontentloaded",timeout:60000});
        await shortPage.locator('[data-hydrated=true]').waitFor({state:"visible",timeout:45000});
        const measurements=[];
        for(let i=0;i<3;i++){
          await waitForOnboardArtwork(shortPage,i);
          const button=shortPage.getByRole("button",{name:i===2?"Get Started":"Next"});
          await button.waitFor({state:"visible",timeout:15000});
          const bounds=await button.evaluate(el=>{
            const r=el.getBoundingClientRect();
            return {bottom:Math.round(r.bottom),viewport:window.innerHeight,
              label:el.textContent.trim()};
          });
          assert(bounds.bottom<=bounds.viewport-8,
            "Step "+(i+1)+" primary button below the fold: "+JSON.stringify(bounds));
          measurements.push(bounds);
          await shortPage.screenshot({path:path.join(out,"onboarding-short-"+(i+1)+".png"),
            animations:"disabled"});
          await button.click();
        }
        await shortPage.waitForURL(/\/app\/today/,{timeout:45000});
        return measurements;
      } finally {await compact.close();}
    });
    await test("First install onboarding advances three real pages",async()=>{
      await page.goto(base+"/app",{waitUntil:"domcontentloaded"});
      await page.waitForURL(/\/app\/onboarding/,{timeout:45000});
      await page.locator("[data-hydrated=true]").waitFor({state:"visible",timeout:45000});
      await page.locator("[data-hydrated=true]").waitFor({state:"visible",timeout:45000});
      const headings=[];
      for(let i=0;i<3;i++){
        await waitForOnboardArtwork(page,i);
        headings.push(await page.locator("h1").first().innerText());
        await page.screenshot({path:path.join(out,"onboarding-"+(i+1)+".png"),animations:"disabled"});
        await page.getByRole("button",{name:i===2?"Get Started":"Next"}).click();
      }
      await page.waitForURL(/\/app\/today/,{timeout:45000});
      assert(new Set(headings).size===3,"all onboarding screens must be unique");
      assert.equal(await page.evaluate(()=>localStorage.getItem("sum-ios-onboarding-complete")),"true");
      await page.goto(base+"/app",{waitUntil:"domcontentloaded"});
      await page.waitForURL(/\/app\/(?:today)?$/, {timeout:45000});
      return headings;
    });
    await test("Public Summon catalog and authenticated-only Pico rule",async()=>{
      const publicCatalog=await page.request.get(base+"/api/summons/catalog");
      assert.equal(publicCatalog.status(),200);
      const catalog=await publicCatalog.json();
      assert.equal(catalog.starter.speciesId,"pico");
      assert.equal(catalog.categories.length,12);
      assert.equal(catalog.categories.reduce((n,entry)=>n+entry.specialties.length,0),36);
      assert.equal(catalog.restrictions.cashPaidRandomDraws,false);
      const guest=await page.request.get(base+"/api/summons/me");
      assert.equal(guest.status(),401,"Guest may not receive account-bound starter entitlement");
      assert((guest.headers()["cache-control"]||"").includes("no-store"));
      const body=await guest.json();
      assert(!("starter" in body),"No synthetic account response without login");
      const spoofed=await page.request.post(base+"/api/summons/starter/claim",{
        data:{userId:"victim-account",speciesId:"legendary"},
      });
      assert.equal(spoofed.status(),401,
        "Guest-controlled IDs cannot trigger Pico or other grants");
      assert((spoofed.headers()["cache-control"]||"").includes("no-store"));
      const spoofBody=await spoofed.json();
      assert(!("grant" in spoofBody),"No guest grant receipt");
      await page.goto(base+"/app/picos",{waitUntil:"domcontentloaded"});
      await page.locator('[data-hydrated=true]').waitFor({state:"visible",timeout:45000});
      const guestLabel=await page.locator(".ios-pico-entitlement").innerText();
      assert(guestLabel.includes("Sign in to activate"),"Pico prompt must be guest-aware");
      return {catalog:12,specialties:36,guestStatus:401,noEntitlementLeak:true};
    });
    await test("Voice Quiz entry and anonymous rejection are genuine",async()=>{
      await page.goto(base+"/app/quiz",{waitUntil:"domcontentloaded"});
      await page.locator('[data-hydrated=true]').waitFor({state:"visible",timeout:45000});
      const body=await page.locator("main").innerText();
      assert(body.includes("Challenge a friend to a Quiz"),
        "The dedicated Quiz page must really exist");
      assert(body.includes("Free challenge"),
        "Pilot must not advertise monetary bets");
      assert(body.includes("Sign in to play a real Quiz"),
        "Quiz creation/answering must require a real account");
      assert.equal(await page.getByTestId("quiz-create-form").count(),0,
        "Guest cannot get a fake working challenge creation form");
      const runtime=await page.request.get(base+"/api/ai/runtime");
      assert.equal(runtime.status(),401,"Provider account status is private");
      const create=await page.request.post(base+"/api/quiz",{
        data:{topic:"science",requestKey:"guest-forged-request-id",stakeCredits:0},
      });
      assert.equal(create.status(),401,"Anonymous Quiz must not create a Challenge");
      const join=await page.request.post(base+"/api/quiz/not-a-valid-quiz/accept");
      assert.equal(join.status(),401,"Anonymous participant cannot accept invitations");
      const answer=await page.request.post(base+"/api/quiz/not-a-valid-quiz/answer",{
        data:{answers:[0,0,0]},
      });
      assert.equal(answer.status(),401,"Anonymous Quiz answers cannot be recorded");
      await page.screenshot({path:path.join(out,"quiz-voice-guest-390.png"),
        animations:"disabled",fullPage:true});
      return {guestApiStatuses:[runtime.status(),create.status(),join.status(),answer.status()],
        monetaryStake:"blocked",actualQuizPage:true};
    });
    await test("Profession creature atlas, focused chapters and honest ownership",async()=>{
      await page.goto(base+"/app/picos",{waitUntil:"domcontentloaded"});
      await page.locator('[data-hydrated=true]').waitFor({state:"visible",timeout:45000});
      assert((await page.locator(".ios-pico-hero").innerText()).includes("Pico, your first Summon"));
      const rank=await page.getByRole("region",{name:"Your Quest Milestone Level"}).innerText();
      assert(rank.includes("Sign in to see milestones"),"no fabricated guest level");
      const recorded=await page.getByRole("region",{name:"Recorded Profession XP"}).innerText();
      assert(recorded.includes("Sign in to check server-verified Quest XP"),"no guest XP leak");
      assert(recorded.includes("not lifetime XP"),"historical XP is incomplete");
      const atlas=page.getByRole("group",{name:"Twelve concept creature families"});
      assert.equal(await atlas.getByRole("button").count(),12,"All 12 family species must be browseable");
      const originals=page.locator(".ios-creature-atlas-card img.ios-creature-art");
      assert.equal(await originals.count(),3,"Exactly the first three families have original artwork");
      const decoded=await originals.evaluateAll(async imgs=>{
        for(const img of imgs)img.loading="eager";
        await Promise.all(imgs.map(img=>img.decode().catch(()=>null)));
        return imgs.map(img=>({src:img.getAttribute("src"),width:img.naturalWidth}));
      });
      assert(decoded.every(entry=>entry.width>=96),
        "All three original career images must decode to nontrivial responsive assets: "+JSON.stringify(decoded));
      const chapters=page.getByRole("tablist",{name:"Summon design chapters"});
      assert.equal(await chapters.getByRole("tab").count(),4);
      const select=async(name)=>chapters.getByRole("tab",{name,exact:true}).click();
      const primary=page.getByRole("combobox",{name:"Profession family"});
      await page.getByTestId("creature-family-software").click();
      assert.equal(await primary.inputValue(),"software","Atlas selection drives career details");
      assert.equal(await page.getByRole("combobox",{name:"Specific profession or skill"}).locator("option").count(),3);
      await page.getByRole("combobox",{name:"Specific profession or skill"}).selectOption("robotics");
      const described=await page.locator(".ios-summon-species").innerText();
      assert(described.includes("Circuitling")&&described.includes("Robotics"),
        "Career specialization must remain distinct from the species");
      assert(described.includes("six-sided otter"),"Unique silhouette must be visible as design metadata");
      const mastery=page.getByRole("slider",{name:"Preview profession mastery level"});
      await mastery.focus();await mastery.press("End");
      assert.equal(await mastery.inputValue(),"5");
      const hero=page.locator(".ios-summon-species img[data-testid='creature-art-software-ascended']");
      assert.equal(await hero.count(),1,"Selecting level five must change the displayed software hero image");
      assert((await hero.getAttribute("src")).includes("circuitling-ascended.webp"),
        "The final level cannot silently reuse the base creature image");
      const line=page.getByLabel("Three-stage species evolution preview");
      assert.equal(await line.locator("img").count(),3,"All three software stage pictures must be visible");
      assert((await page.getByLabel("Three-stage species evolution preview").innerText()).includes("Neuralcrest"),
        "Level five form name must belong to the selected family");
      await page.screenshot({path:path.join(out,"familiars-atlas-390.png"),
        animations:"disabled",fullPage:true});
      for(const [family,filename] of [["athletics","stridekin"],["nature","mossprite"]]){
        await page.getByTestId("creature-family-"+family).click();
        const image=page.locator(".ios-summon-species img[data-testid='creature-art-"+family+"-ascended']");
        assert.equal(await image.count(),1,"Each fully illustrated family has its ascended form");
        assert((await image.getAttribute("src")).includes(filename+"-ascended.webp"),
          "Each family's unique ascended asset, not a reused Pico image");
        assert.equal(await page.getByLabel("Three-stage species evolution preview").locator("img").count(),3);
      }
      await page.getByTestId("creature-family-software").click();

      await select("Summon Preview");
      assert.equal(await page.locator(".ios-summon-odds > div").count(),5);
      assert((await page.getByLabel("Example base summon odds").innerText()).includes("0.4%"));
      const pity=page.getByTestId("ios-simulated-pity");
      assert((await pity.innerText()).includes("0 sample draws"));
      await page.getByRole("button",{name:/Preview a random summon/}).click();
      const draw=await page.locator(".ios-summon-result").innerText();
      assert(draw.includes("SIMULATION 1")&&draw.includes("NO ITEM AWARDED"));
      assert((await pity.innerText()).includes("1 sample draw"));
      await page.getByRole("button",{name:"Reset sample-only counters"}).click();
      assert((await pity.innerText()).includes("0 sample draws"));
      assert(!(await page.getByRole("button",{name:"Reset sample-only counters"}).isEnabled()));
      await page.screenshot({path:path.join(out,"familiars-summon-preview-390.png"),
        animations:"disabled",fullPage:true});

      await select("Fusion Lab");
      const second=page.getByRole("combobox",{name:"Fusion second profession"});
      await second.selectOption("healthcare");
      assert((await page.locator(".ios-fusion-recipe").innerText()).includes("Carebyte"),
        "Selected career pair determines example fusion");
      await page.screenshot({path:path.join(out,"familiars-fusion-390.png"),
        animations:"disabled",fullPage:true});

      await select("Career Atlas");
      await page.getByTestId("creature-family-art").click();
      await select("Fusion Lab");
      await second.selectOption("music");
      assert((await page.locator(".ios-fusion-recipe").innerText()).includes("Prism Echo"),
        "Second fusion recipe remains reachable");
      await select("XP Guide");
      assert.equal(await page.locator(".ios-summon-lab .ios-action").getAttribute("href"),
        "/app/create?seed=craft","Career action must be an actual Quest starting path");
      const guide=await page.getByRole("tabpanel",{name:"XP Guide"}).innerText();
      assert(guide.includes("example")||guide.includes("Example"),"XP is not represented as earned");
      await page.screenshot({path:path.join(out,"familiars-xp-guide-390.png"),
        animations:"disabled",fullPage:true});

      await select("Career Atlas");
      const imgs=await page.evaluate(async()=>{
        const pictures=Array.from(document.querySelectorAll(".ios-pico-hero img"));
        await Promise.all(pictures.map(img=>img.decode().catch(()=>null)));
        return {count:pictures.length,loaded:pictures.every(img=>img.naturalWidth>0),
          falseCreatures:document.querySelectorAll(".ios-summon-studio .ios-art").length};
      });
      assert(imgs.count>=1&&imgs.loaded,"Actual Pico hero art must load "+JSON.stringify(imgs));
      assert.equal(imgs.falseCreatures,0,"Do not reuse Pico illustration as other species art");
      await page.screenshot({path:path.join(out,"familiars-roster-390.png"),
        animations:"disabled",fullPage:true});
      return {professionFamilies:12,skillMotifs:36,chapterCount:4,
        sampleDraws:"preview-only",speciesPortraits:"pending unique 3D production"};
    });
    await test("320px Summon Lab has no horizontal overflow",async()=>{
      const compact=await browser.newContext({viewport:{width:320,height:780},
        deviceScaleFactor:1,reducedMotion:"reduce",isMobile:true,hasTouch:true});
      try {
        const mobile=await compact.newPage();
        await mobile.goto(base+"/app/picos",{waitUntil:"domcontentloaded"});
        await mobile.locator('[data-hydrated=true]').waitFor({state:"visible",timeout:45000});
        const tabs=mobile.getByRole("tablist",{name:"Summon design chapters"});
        const widths=[];
        for(const name of ["Career Atlas","Summon Preview","Fusion Lab","XP Guide"]){
          await tabs.getByRole("tab",{name}).click();
          const overflow=await mobile.evaluate(()=>Math.max(document.documentElement.scrollWidth,
            document.body.scrollWidth)-innerWidth);
          assert(overflow<=1,name+" 320px overflow "+overflow);
          widths.push(overflow);
        }
        return {viewportWidth:320,overflowByChapter:widths};
      }finally{await compact.close();}
    });
    await test("Five-tab iOS navigation actually changes routes",async()=>{
      await page.goto(base+"/app/today",{waitUntil:"domcontentloaded"});
      await page.waitForFunction(()=>document.querySelector('[data-testid="ios-full-app"]')?.getAttribute("data-hydrated")==="true",null,{timeout:45000});
      for(const [label,dest] of [["Discover","discover"],["Create","create"],["Familiars","picos"],["Profile","profile"],["Home","today"]]){
        await page.getByRole("navigation",{name:"iOS app navigation"}).getByRole("link",{name:label,exact:true}).click();
        await page.waitForFunction(dest=>location.pathname==="/app/"+dest,dest,{timeout:45000});
      }
      return {destinations:5};
    });
    await test("Actual Quest composer survives new app shell",async()=>{
      await page.goto(base+"/app/create",{waitUntil:"domcontentloaded"});
      await page.waitForFunction(()=>document.querySelector('[data-testid="ios-full-app"]')?.getAttribute("data-hydrated")==="true",null,{timeout:45000});
      await page.getByRole("textbox",{name:"Describe your challenge"}).waitFor({state:"visible",timeout:45000});
      const seed=page.getByRole("button",{name:"Create",exact:true}).first();
      await seed.click();
      await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Describe your challenge"]')?.value.length>8,undefined,{timeout:45000});
      const text=await page.getByRole("textbox",{name:"Describe your challenge"}).inputValue();
      assert(text.length>8);
      return {seedLength:text.length, noPublishTriggered:true};
    });
    await test("Settings persist actual local display preferences",async()=>{
      await page.goto(base+"/app/settings",{waitUntil:"domcontentloaded"});
      await page.locator("[data-hydrated=true]").waitFor({state:"visible",timeout:45000});
      await page.getByRole("combobox",{name:"App theme"}).selectOption("night");
      await page.getByRole("checkbox",{name:"Reduce motion"}).check();
      assert.equal(await page.evaluate(()=>localStorage.getItem("sum-ios-appearance")),"night");
      await page.goto(base+"/app/profile",{waitUntil:"domcontentloaded"});
      await page.waitForFunction(()=>document.querySelector('[data-testid="ios-full-app"]')?.classList.contains("ios-app--night"),null,{timeout:10000});
      assert.equal(await page.locator('[data-testid="ios-full-app"]').getAttribute("data-reduce-motion"),"true");
      await page.goto(base+"/app/settings",{waitUntil:"domcontentloaded"});
      await page.locator("[data-hydrated=true]").waitFor({state:"visible",timeout:45000});
      await page.getByRole("combobox",{name:"App theme"}).selectOption("light");
      await page.getByRole("checkbox",{name:"Reduce motion"}).uncheck();
      return {saved:true};
    });
    await test("Absent Quest ID never fabricates a completed result",async()=>{
      await page.goto(base+"/app/quest-complete",{waitUntil:"domcontentloaded"});
      const text=await page.locator("main").innerText();
      assert(!text.includes("Quest Complete!"),"must not claim a result without real id");
      assert(text.includes("A Quest must exist"));
      return {failClosed:true};
    });
    await test("Wheel scrolling works on long iOS pages",async()=>{
      await page.goto(base+"/app/today",{waitUntil:"commit",timeout:60000});
      await page.locator("[data-hydrated=true]").waitFor({state:"visible",timeout:45000});
      const height=await page.evaluate(()=>document.documentElement.scrollHeight);
      assert(height>844+100);
      await page.mouse.move(185,445);
      await page.mouse.wheel(0,480);await page.waitForTimeout(400);
      const scroll=await page.evaluate(()=>window.scrollY);
      assert(scroll>50,"wheel scroll not working");
      return {scroll};
    });
  }
  await context.close();
}
}finally{await browser.close();}
fs.writeFileSync(path.join(out,"results.json"),JSON.stringify(evidence,null,2));
console.log("IOS_APP_TESTS",evidence.results.length-failures+"/"+evidence.results.length,"failed="+failures,"out="+out);
process.exitCode=failures?1:0;
})().catch(e=>{console.error(e.stack);process.exitCode=1});
