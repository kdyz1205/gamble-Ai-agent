import {expect,test} from "@playwright/test";
import {mkdirSync} from "node:fs";

const BASE=process.env.TEST_BASE_URL||"http://127.0.0.1:3000";
test.use({viewport:{width:390,height:844},video:"off"});

test("Pico chapter: mobile guest can play one full original ritual without XP",
  async({page})=>{
    const home=await page.goto(BASE+"/app/today");
    expect(home?.status()).toBe(200);
    const launch=page.getByTestId("pico-story-open");
    await expect(launch).toBeVisible();
    await expect(launch).toHaveAttribute("href","/app/story");
    await launch.click();
    await expect(page).toHaveURL(/\/app\/story$/);
    const story=page.getByTestId("pico-story");
    await expect(story).toHaveAttribute("data-phase","intro");
    await expect(story).toHaveAttribute("data-content-type","local-playable-prologue");
    await expect(story).toHaveAttribute("data-sequence","pico-prologue-01");
    await expect(page.getByTestId("pico-story-no-rewards")).toContainText(
      "No XP, credits, tickets or inventory rewards");
    await expect(page.getByTestId("pico-story-cast")).toHaveCount(0);
    const mainText=await page.getByTestId("pico-story-dialogue").innerText();
    expect(mainText).toContain("Before the first star");

    await page.getByTestId("pico-story-start").click();
    await expect(story).toHaveAttribute("data-phase","ready",{timeout:12_000});
    await expect(page.getByTestId("pico-story-cast")).toBeVisible();
    await page.getByTestId("pico-story-cast").click();
    await expect(story).toHaveAttribute("data-phase","casting");
    await expect(page.getByTestId("pico-story-waiting")).toBeDisabled();
    await expect(story).toHaveAttribute("data-phase","complete",{timeout:12_000});
    await expect(page.getByTestId("pico-story-no-rewards")).toContainText("No XP");
    await expect(page.getByTestId("pico-story-quest")).toHaveAttribute("href","/app/create");
    await page.getByTestId("pico-story-replay").click();
    await expect(story).toHaveAttribute("data-phase","intro");
    await expect(page.getByTestId("pico-story-start")).toBeVisible();
    await expect(page.locator('[data-testid="ios-tabbar"]')).toHaveCount(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
      .toBeLessThanOrEqual(1);
  });

test("Pico cinematic stages are real 3D, can pause motion and show frames",
  async({page})=>{
    await page.goto(BASE+"/app/story");
    const canvas=page.getByTestId("pico-story-canvas");
    await expect(canvas).toBeVisible({timeout:30_000});
    await expect(canvas).toHaveAttribute("data-actor","real-pico-mesh",{timeout:20_000});
    await expect(canvas).toHaveAttribute("data-story-phase","intro");
    await expect(canvas).toHaveAttribute("data-animating","true",{timeout:10_000});

    mkdirSync("output/ios-full-app",{recursive:true});
    await page.screenshot({path:"output/ios-full-app/pico-story-chapter-intro-390.png",
      fullPage:true});
    await page.getByTestId("pico-story-start").click();
    await expect(canvas).toHaveAttribute("data-story-phase","summoning");
    await expect(canvas).toHaveAttribute("data-story-phase","ready",{timeout:12_000});
    await expect(canvas).toHaveAttribute("data-story-cue","idle",{timeout:10_000});
    await page.getByTestId("pico-story-cast").click();
    await expect(canvas).toHaveAttribute("data-story-phase","casting");
    await expect(canvas).toHaveAttribute("data-story-cue",
      /^(gather|release|impact|afterglow)$/);
    await page.screenshot({path:"output/ios-full-app/pico-story-chapter-cast-390.png",
      fullPage:true});
    await expect(page.getByTestId("pico-story")).toHaveAttribute(
      "data-phase","complete",{timeout:12_000});
    await expect(canvas).toHaveAttribute("data-story-cue","afterglow",
      {timeout:10_000});
    await page.screenshot({path:"output/ios-full-app/pico-story-chapter-complete-390.png",
      fullPage:true});
    await canvas.scrollIntoViewIfNeeded();
    await page.emulateMedia({reducedMotion:"reduce"});
    await expect(canvas).toHaveAttribute("data-animating","false",{timeout:10_000});
    await page.emulateMedia({reducedMotion:"no-preference"});
    await expect(canvas).toHaveAttribute("data-animating","true",{timeout:10_000});
    await page.evaluate(()=>{
      localStorage.setItem("sum-ios-reduced-motion","true");
      window.dispatchEvent(new Event("sum-ios-preferences-changed"));
    });
    await expect(canvas).toHaveAttribute("data-animating","false",{timeout:10_000});
  });

test("Pico story remains playable and refuses fake rewards without WebGL",
  async({page})=>{
    await page.addInitScript(()=>{
      const original=HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype,"getContext",{
        configurable:true,
        value:function(this:HTMLCanvasElement,type:string,...args:unknown[]){
          if(type==="webgl"||type==="webgl2"||type==="experimental-webgl")return null;
          return Reflect.apply(original,this,[type,...args]);
        },
      });
    });
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.goto(BASE+"/app/story");
    await expect(page.getByTestId("pico-story-fallback")).toBeVisible();
    await expect(page.getByTestId("pico-story-no-rewards")).toContainText(
      "illustrated version",{timeout:20_000});
    await page.getByTestId("pico-story-start").click();
    await expect(page.getByTestId("pico-story")).toHaveAttribute(
      "data-phase","ready",{timeout:10_000});
    await page.getByTestId("pico-story-cast").click();
    await expect(page.getByTestId("pico-story")).toHaveAttribute(
      "data-phase","complete",{timeout:10_000});
    await expect(page.getByTestId("pico-story-quest")).toHaveAttribute(
      "href","/app/create");
    await expect(page.getByTestId("pico-story-no-rewards")).toContainText(
      "No XP, credits, tickets or inventory rewards");
  });
