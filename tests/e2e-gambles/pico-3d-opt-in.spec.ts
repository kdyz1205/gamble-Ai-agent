import {expect,test} from "@playwright/test";
import {mkdirSync} from "node:fs";

const BASE=process.env.TEST_BASE_URL||"http://127.0.0.1:3000";

test.use({viewport:{width:390,height:844}});

test("real mesh Pico is opt-in, animated and safely returns to artwork",
  async({page},testInfo)=>{
    await page.goto(BASE+"/app/quiz");
    const arena=page.getByTestId("ios-quiz-arena");
    const toggle=page.getByTestId("toggle-pico-3d");
    await expect(arena).toBeVisible({timeout:30_000});
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed","false");
    await expect(arena).toHaveAttribute("data-render-mode","illustration");
    await expect(page.getByTestId("pico-3d-canvas")).toHaveCount(0);
    await toggle.click();
    const canvas=page.getByTestId("pico-3d-canvas");
    await expect(canvas).toBeVisible({timeout:30_000});
    await expect(arena).toHaveAttribute("data-render-mode","3d",{timeout:20_000});
    const metrics=await canvas.evaluate(element=>{
      const canv=element as HTMLCanvasElement;
      return {
        meshes:Number(canv.dataset.meshes),
        triangles:Number(canv.dataset.triangles),
        width:canv.width,
        height:canv.height,
        animating:canv.dataset.animating,
      };
    });
    expect(metrics.meshes).toBeGreaterThan(60);
    expect(metrics.triangles).toBeGreaterThan(50_000);
    expect(metrics.width).toBeGreaterThan(100);
    expect(metrics.height).toBeGreaterThan(100);
    expect(metrics.width*metrics.height).toBeLessThanOrEqual(800_000);
    expect(metrics.animating).toBe("true");

    mkdirSync("output/ios-full-app",{recursive:true});
    await page.screenshot({
      path:"output/ios-full-app/pico-real-webgl-390.png",
      fullPage:true,
    });
    await testInfo.attach("real-two-Pico-WebGL",{
      path:"output/ios-full-app/pico-real-webgl-390.png",
      contentType:"image/png",
    });

    await page.emulateMedia({reducedMotion:"reduce"});
    await expect(canvas).toHaveAttribute("data-animating","false");
    await page.emulateMedia({reducedMotion:"no-preference"});
    await expect(canvas).toHaveAttribute("data-animating","true");

    await page.evaluate(()=>{
      localStorage.setItem("sum-ios-reduced-motion","true");
      dispatchEvent(new Event("sum-ios-preferences-changed"));
    });
    await expect(canvas).toHaveAttribute("data-animating","false");
    await page.evaluate(()=>{
      localStorage.setItem("sum-ios-reduced-motion","false");
      dispatchEvent(new Event("sum-ios-preferences-changed"));
    });
    await expect(canvas).toHaveAttribute("data-animating","true");

    await toggle.click();
    await expect(page.getByTestId("pico-3d-canvas")).toHaveCount(0);
    await expect(arena).toHaveAttribute("data-render-mode","illustration");
    await expect(toggle).toHaveAttribute("aria-pressed","false");
    await expect(arena.locator(".ios-quiz-arena__pico").first())
      .toHaveCSS("visibility","visible");
  },
);

test("WebGL failure restores 2D Pico without changing Quiz state",
  async({page})=>{
    await page.addInitScript(()=>{
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type:never,...args:never[]){
        if(String(type).toLowerCase().includes("webgl"))return null;
        return original.call(this,type,...args);
      } as typeof original;
    });
    await page.goto(BASE+"/app/quiz");
    const arena=page.getByTestId("ios-quiz-arena");
    await expect(arena).toHaveAttribute("data-phase","preview");
    await page.getByTestId("toggle-pico-3d").click();
    await expect(arena.getByText(/3D is unavailable here/)).toBeVisible({timeout:20_000});
    await expect(arena).toHaveAttribute("data-render-mode","illustration");
    await expect(arena.locator(".ios-quiz-arena__pico").first())
      .toHaveCSS("visibility","visible");
    await expect(arena).toHaveAttribute("data-phase","preview");
    await expect(page.getByText("Free challenge · 0 credits at stake")).toBeVisible();
  },
);
