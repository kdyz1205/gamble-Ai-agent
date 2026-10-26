import {expect,test} from "@playwright/test";
import {mkdirSync} from "node:fs";

const BASE=process.env.TEST_BASE_URL||"http://127.0.0.1:3000";
test.use({viewport:{width:390,height:844},video:"off"});

test("Public website and SUM client are distinct products with a shared language",
  async({page,context})=>{
    await page.addInitScript(()=>{
      window.localStorage.setItem("sum-language","en");
    });
    const website=await page.goto(BASE+"/");
    expect(website?.status()).toBe(200);
    await expect(page.getByTestId("sum-marketing-site")).toBeVisible();
    await expect(page.getByRole("heading",{name:/Make reality/})).toBeVisible();
    await expect(page.getByTestId("world-summon-cta")).toHaveAttribute("href","/app");
    await expect(page.getByTestId("ios-full-app")).toHaveCount(0);
    await expect(page.getByTestId("ios-tabbar")).toHaveCount(0);
    await expect(page.getByTestId("sum-app-dock")).toHaveCount(0);

    // No marketing shortcut is allowed to send guests to the deprecated,
    // competing client pages. The website stays informational.
    const oldProductLinks=await page.locator('[data-testid="sum-marketing-site"] a')
      .evaluateAll(elements=>elements.map(e=>e.getAttribute("href")).filter(
        href=>href&&/^\/(summons|markets|rituals|judgment)(?:\/|\?|$)/.test(href)));
    expect(oldProductLinks).toEqual([]);

    const lang=page.getByTestId("sum-language-switch");
    await expect(lang.getByTestId("sum-lang-en")).toHaveAttribute("aria-pressed","true");
    await lang.getByTestId("sum-lang-zh").click();
    await expect(page.getByRole("heading",{name:/让真实世界/})).toBeVisible();
    await expect(page.getByTestId("world-summon-cta")).toContainText("进入 SUM 客户端");
    await expect(lang.getByTestId("sum-lang-zh")).toHaveAttribute("aria-pressed","true");
    expect(await page.evaluate(()=>document.documentElement.lang)).toBe("zh-CN");
    mkdirSync("output/ios-full-app",{recursive:true});
    await page.screenshot({path:"output/ios-full-app/summoner-site-zh-390.png",fullPage:true});

    await page.getByTestId("world-summon-cta").click();
    await expect(page).toHaveURL(/\/app\/today$/);
    await expect(page.getByTestId("sum-marketing-site")).toHaveCount(0);
    await expect(page.getByTestId("ios-full-app")).toBeVisible();
    await expect(page.getByTestId("ios-tabbar")).toHaveCount(1);
    await expect(page.getByTestId("sum-app-dock")).toHaveCount(0);
    await expect(page.getByText("你的世界。")).toBeVisible();
    await expect(page.getByTestId("ios-start-quest")).toContainText("创建 Quest");
    await expect(page.getByRole("link",{name:"首页"})).toHaveAttribute("href","/app/today");
    await expect(page.getByTestId("sum-lang-zh")).toHaveAttribute("aria-pressed","true");
    await expect(page.getByTestId("pico-story-open")).toContainText("进入序章");
    await page.screenshot({path:"output/ios-full-app/sum-client-zh-390.png",fullPage:true});

    // The language preference is not coupled to onboarding completion or login.
    await page.reload();
    await expect(page.getByText("你的世界。")).toBeVisible();
    await page.getByTestId("sum-lang-en").click();
    await expect(page.getByRole("heading",{name:/Your world/})).toBeVisible();
    await expect(page.getByRole("link",{name:"Home"})).toHaveAttribute("href","/app/today");
    const story=page.getByTestId("pico-story-open");
    await story.click();
    await expect(page).toHaveURL(/\/app\/story$/);
    await expect(page.getByTestId("sum-marketing-site")).toHaveCount(0);
    await expect(page.getByTestId("ios-tabbar")).toHaveCount(0);
    await expect(page.getByTestId("pico-story")).toHaveAttribute("data-content-type","local-playable-prologue");
    await expect(page.getByTestId("sum-lang-en")).toHaveAttribute("aria-pressed","true");

    // Different languages do not create different players or reward ledgers.
    expect(await page.evaluate(()=>localStorage.getItem("sum-language"))).toBe("en");
    expect(await context.cookies()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({name:"sum-language-user-id"})]));
  });

test("Legacy landing URL is a canonical site alias and the installed PWA starts in SUM",
  async({page})=>{
    await page.goto(BASE+"/enter");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("sum-marketing-site")).toBeVisible();
    await expect(page.getByTestId("ios-tabbar")).toHaveCount(0);
    const response=await page.request.get(BASE+"/manifest.webmanifest");
    expect(response.status(),await response.text()).toBe(200);
    const manifest=await response.json();
    expect(manifest.start_url).toBe("/app/today");
    expect(manifest.scope).toBe("/app/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
    const mobile=await page.request.get(BASE+"/app/today");
    expect(mobile.status()).toBe(200);
    const markup=await mobile.text();
    expect(markup).toContain("ios-full-app");
  });

test("English and Chinese site copy changes without changing navigation destinations",
  async({page})=>{
    await page.goto(BASE+"/");
    const shortcuts=page.locator('nav[aria-label="Explore Summoner.world"] a');
    await expect(shortcuts).toHaveCount(4);
    const before=await shortcuts.evaluateAll(nodes=>nodes.map(n=>n.getAttribute("href")));
    expect(before).toEqual(["#how-it-works","#companion","#realms","#story"]);
    await page.getByTestId("sum-lang-zh").click();
    await expect(shortcuts.first()).toContainText("了解玩法");
    const after=await shortcuts.evaluateAll(nodes=>nodes.map(n=>n.getAttribute("href")));
    expect(after).toEqual(before);
    await expect(page.getByTestId("sum-marketing-pico-chapter")).toHaveAttribute("href","/app/story");
    await page.getByTestId("sum-lang-en").click();
    await expect(shortcuts.first()).toContainText("How Quests Work");
    await expect(page.getByTestId("sum-marketing-footer-cta")).toHaveAttribute("href","/app");
  });


test("Desktop SUM is a responsive Web App, not a phone mock or landing page",
  async({page})=>{
    await page.addInitScript(()=>localStorage.setItem("sum-language","en"));
    await page.setViewportSize({width:1280,height:900});
    await page.goto(BASE+"/");
    await expect(page.getByTestId("sum-marketing-site")).toBeVisible();
    await expect(page.getByTestId("ios-tabbar")).toHaveCount(0);
    mkdirSync("output/ios-full-app",{recursive:true});
    await page.screenshot({
      path:"output/ios-full-app/summoner-website-desktop-1280.png",
      fullPage:true,
    });

    await page.getByTestId("world-summon-cta").click();
    await expect(page).toHaveURL(/\/app\/today$/);
    await expect(page.getByTestId("sum-marketing-site")).toHaveCount(0);
    const app=page.getByTestId("ios-full-app");
    await expect(app).toBeVisible();
    await expect(app).toHaveAttribute("data-product-surface","web-app");
    await expect(page.getByTestId("ios-tabbar")).toHaveCount(1);
    await expect(page.getByTestId("sum-app-dock")).toHaveCount(0);
    const dims=await page.evaluate(()=>{
      const app=document.querySelector('[data-product-surface="web-app"]');
      const rect=app?.getBoundingClientRect();
      const banner=document.querySelector(".ios-command-hud")?.getBoundingClientRect();
      const story=document.querySelector(".ios-pico-story-entry")?.getBoundingClientRect();
      return {
        width:rect?.width??0,
        overflow:document.documentElement.scrollWidth-innerWidth,
        columns:!!banner&&!!story&&Math.abs(banner.top-story.top)<20,
      };
    });
    expect(dims.width).toBeGreaterThan(900);
    expect(dims.width).toBeLessThanOrEqual(1180);
    expect(dims.overflow).toBeLessThanOrEqual(1);
    expect(dims.columns).toBe(true);
    await page.screenshot({
      path:"output/ios-full-app/sum-webapp-desktop-1280.png",
      fullPage:true,
    });

    await page.getByTestId("sum-lang-zh").click();
    await expect(page.getByRole("link",{name:"首页"})).toBeVisible();
    await expect(page.getByTestId("ios-start-quest")).toContainText("创建 Quest");
    await page.reload();
    await expect(page.getByTestId("sum-lang-zh")).toHaveAttribute("aria-pressed","true");
    await page.goto(BASE+"/app/discover");
    await expect(page.getByRole("button",{name:"全部"})).toBeVisible();
    await expect(page.getByTestId("ios-tabbar")).toHaveCount(1);
    await page.goto(BASE+"/app/story");
    await expect(page.getByTestId("pico-story-dialogue")).toContainText("第一颗星升起之前");
    await expect(page.getByTestId("ios-tabbar")).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
      .toBeLessThanOrEqual(1);
  },
);
