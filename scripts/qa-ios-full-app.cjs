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
    return { width:innerWidth,
      overflow:Math.max(doc.scrollWidth,body.scrollWidth)-innerWidth,
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
        assert(m.overflow<=1,"horizontal overflow "+m.overflow+"px");
        const intro=view==="splash"||view==="onboarding";
        assert.equal(m.bottomNavs,intro?0:1,"exactly one appropriate bottom dock");
        assert.equal(m.otherNavs,0,"global marketing nav must not duplicate the app nav");
        if(!intro)assert.deepEqual(m.labels,["Home","Discover","Create","Picos","Profile"]);
        assert.deepEqual(runtimeErrors,[],"uncaught browser errors");
        assert.equal(m.errors,0,"render failure");
        if(width===390){
          await page.screenshot({path:path.join(out,view+"-390.png"),animations:"disabled",
            fullPage:["today","create","achievements","settings","community","discover"].includes(view),timeout:25000});
        }
        return m;
      } finally {page.off("pageerror",onError);}
    });
  }
  if(width===390){
    await test("First install onboarding advances three real pages",async()=>{
      await page.goto(base+"/app",{waitUntil:"domcontentloaded"});
      await page.waitForURL(/\/app\/onboarding/,{timeout:45000});
      await page.locator("[data-hydrated=true]").waitFor({state:"visible",timeout:45000});
      await page.locator("[data-hydrated=true]").waitFor({state:"visible",timeout:45000});
      const headings=[];
      for(let i=0;i<3;i++){
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
    await test("Five-tab iOS navigation actually changes routes",async()=>{
      await page.goto(base+"/app/today",{waitUntil:"domcontentloaded"});
      await page.waitForFunction(()=>document.querySelector('[data-testid="ios-full-app"]')?.getAttribute("data-hydrated")==="true",null,{timeout:45000});
      for(const [label,dest] of [["Discover","discover"],["Create","create"],["Picos","picos"],["Profile","profile"],["Home","today"]]){
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
