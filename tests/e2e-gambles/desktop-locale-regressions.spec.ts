import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
test.use({ video: "off", viewport: { width: 390, height: 844 } });
async function english(page: Page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("locale-fixture-once")) {
      localStorage.setItem("sum-language", "en"); sessionStorage.setItem("locale-fixture-once", "yes");
    }
  });
}
async function noOverflow(page: Page) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, page: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) }));
  expect(size.page, JSON.stringify(size)).toBeLessThanOrEqual(size.viewport + 1);
}
for (const width of [900, 1280, 1440]) {
  test(`desktop ${width}px uses a real workspace and a single accessible navigation`, async ({ page }) => {
    await english(page); await page.setViewportSize({ width, height: 900 });
    await page.goto(BASE + "/app/today");
    const frame = page.getByTestId("ios-full-app");
    await expect(frame).toBeVisible();
    const layout = await page.evaluate(() => {
      const app = document.querySelector('.ios-app')!.getBoundingClientRect();
      const nav = document.querySelector('.ios-tabbar')!.getBoundingClientRect();
      const main = document.querySelector('.ios-main')!.getBoundingClientRect();
      return { app: app.width, navRight: nav.right, mainLeft: main.left, mainWidth: main.width };
    });
    expect(layout.app).toBeGreaterThan(width === 900 ? 760 : 1000);
    expect(layout.navRight).toBeLessThanOrEqual(layout.mainLeft + 1);
    expect(layout.mainWidth).toBeGreaterThan(500);
    expect(await page.locator('.ios-tab').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
    expect(await page.locator('.ios-command-mode small').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    await expect(page.getByTestId("ios-tabbar")).toHaveCount(1);
    await expect(page.getByTestId("ios-tabbar").getByRole("link")).toHaveCount(5);
    if (width >= 1280) {
      const a = await page.locator('.ios-command-hud').boundingBox();
      const b = await page.getByTestId('pico-story-home-entry').boundingBox();
      expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
      expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x);
    }
    await page.getByTestId("ios-tabbar").getByRole("link", { name: "Profile", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/profile$/);
    await noOverflow(page);
    await test.info().attach(`desktop-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
}

test('Chinese preference survives navigation, reload and theme changes without business writes', async ({ page }) => {
  await english(page);
  const writes: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/') && !['GET','HEAD','OPTIONS'].includes(r.method())) writes.push(r.method() + ' ' + r.url()); });
  await page.goto(BASE + '/app/today');
  await page.getByTestId('sum-lang-zh').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByTestId('ios-start-quest')).toContainText('创建 Quest');
  await expect(page.locator('.ios-command-hud h1')).toContainText('你的世界');
  await page.getByTestId('ios-tabbar').getByRole('link', {name:'我的',exact:true}).click();
  await expect(page.getByRole('link', {name:'我的证据',exact:true})).toBeVisible();
  await page.getByRole('link', {name:'设置',exact:true}).click();
  await expect(page.getByRole('heading', {name:'外观设置'})).toBeVisible();
  await page.getByRole('combobox', {name:'应用主题'}).selectOption('night');
  await page.reload();
  await expect(page.getByTestId('sum-lang-zh')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('combobox', {name:'应用主题'})).toHaveValue('night');
  await expect(page.getByRole('combobox', {name:'界面语言'})).toHaveValue('zh');
  await page.getByRole('combobox', {name:'界面语言'}).selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.getByRole('heading', {name:'Appearance',exact:true})).toBeVisible();
  await expect(page.getByRole('combobox', {name:'App theme'})).toHaveValue('night');
  await noOverflow(page);
  expect(writes).toEqual([]);
});

test('fresh Chinese browser gets Chinese UI and can explicitly choose English', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width:320, height:740 } });
  const page = await context.newPage();
  try {
    await page.goto(BASE + '/app/today');
    await expect(page.getByTestId('sum-lang-zh')).toHaveAttribute('aria-pressed','true');
    await expect(page.getByTestId('ios-start-quest')).toContainText('创建 Quest');
    await noOverflow(page);
    await page.getByTestId('sum-lang-en').click();
    await page.reload();
    await expect(page.getByTestId('ios-start-quest')).toHaveText(/Start a Quest/);
    await noOverflow(page);
  } finally { await context.close(); }
});

test('language choice still works when localStorage is unavailable', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window,'localStorage',{ configurable:true,get(){throw new DOMException('Storage disabled','SecurityError');} }); });
  await page.goto(BASE + '/app/today');
  await page.getByTestId('sum-lang-zh').click();
  await expect(page.getByTestId('ios-start-quest')).toContainText('创建 Quest');
  await page.getByTestId('ios-tabbar').getByRole('link',{name:'我的',exact:true}).click();
  await expect(page.getByRole('link',{name:'我的证据',exact:true})).toBeVisible();
  await page.getByTestId('sum-lang-en').click();
  await expect(page.getByRole('link',{name:'Your Evidence',exact:true})).toBeVisible();
});

test('language changes synchronize existing tabs without resetting a local story', async ({ context }) => {
  const first = await context.newPage(), second = await context.newPage();
  try {
    await first.goto(BASE + '/app/story');
    await first.getByTestId('sum-lang-en').click();
    await second.goto(BASE + '/app/settings');
    await first.bringToFront();
    await first.getByTestId('pico-story-start').click();
    await expect(first.getByTestId('pico-story')).toHaveAttribute('data-phase','ready',{timeout:20000});
    await second.bringToFront();
    await second.getByTestId('sum-lang-zh').click();
    await expect(first.getByTestId('sum-lang-zh')).toHaveAttribute('aria-pressed','true');
    await expect(first.getByTestId('pico-story')).toHaveAttribute('data-phase','ready');
    await expect(first.getByTestId('pico-story-cast')).toContainText('释放星辉');
    await first.bringToFront();
    await first.getByTestId('pico-story-cast').click();
    await expect(first.getByTestId('pico-story')).toHaveAttribute('data-phase','complete',{timeout:20000});
  } finally { await first.close(); await second.close(); }
});

test('switching interface language preserves the creation draft and login form fields', async ({ page }) => {
  await english(page);
  const writes: string[]=[];
  page.on('request', r=>{if(r.url().includes('/api/')&&!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push(r.method()+' '+r.url());});
  await page.goto(BASE+'/app/create');
  await page.getByRole('textbox',{name:'Describe your challenge',exact:true}).fill('My original rules 原始规则 must remain unchanged.');
  await page.getByTestId('sum-lang-zh').click();
  await expect(page.getByRole('textbox',{name:'描述你的挑战',exact:true})).toHaveValue('My original rules 原始规则 must remain unchanged.');
  await expect(page.getByRole('heading',{name:'告诉 Pico 你的想法。'})).toBeVisible();
  await page.goto(BASE+'/app/profile');
  await page.getByRole('button',{name:'登录或创建账号'}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('邮箱',{exact:true}).fill('unsubmitted@example.invalid');
  await dialog.getByLabel('昵称',{exact:true}).fill('Unsubmitted原始昵称');
  await dialog.getByLabel('密码',{exact:true}).fill('not-a-real-account-password');
  await dialog.getByTestId('sum-lang-en').click();
  await expect(dialog.getByLabel('Email',{exact:true})).toHaveValue('unsubmitted@example.invalid');
  await expect(dialog.getByLabel('Nickname',{exact:true})).toHaveValue('Unsubmitted原始昵称');
  await expect(dialog.getByLabel('Password',{exact:true})).toHaveValue('not-a-real-account-password');
  await dialog.getByTestId('sum-lang-zh').click();
  await dialog.getByRole('button',{name:'关闭登录'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
  expect(writes).toEqual([]);
});

test('unresolved discovery and community reads display real bilingual loading placeholders', async ({ page }) => {
  await english(page);
  for(const item of [
    {route:'/app/discover',pattern:'**/api/challenges?**',en:'Finding public Quests…',zh:'正在寻找公开 Quest…',body:{challenges:[],total:0}},
    {route:'/app/community',pattern:'**/api/feed?**',en:'Loading public community activity…',zh:'正在读取公开社区动态…',body:{events:[],total:0}},
  ]) {
    let release:()=>void=()=>{};
    const held=new Promise<void>(resolve=>{release=resolve;});
    await page.route(item.pattern,async route=>{await held;await route.fulfill({json:item.body});});
    try {
      await page.goto(BASE+item.route);
      await page.getByTestId('sum-lang-en').click();
      await expect(page.getByRole('status',{name:item.en,exact:true})).toBeVisible();
      await page.getByTestId('sum-lang-zh').click();
      await expect(page.getByRole('status',{name:item.zh,exact:true})).toBeVisible();
      release();
      await expect(page.locator('.ios-loading-list')).toHaveCount(0);
      await expect(page.locator('.ios-empty')).toBeVisible();
    } finally {release();await page.unroute(item.pattern);}
  }
});

test('language switches preserve original public Quest content and status', async ({ page }) => {
  await english(page);
  const id='locale_read_fixture_20261027';
  const title='Untranslated original title 原始标题 '+ 'A'.repeat(70);
  await page.route('**/api/challenges/'+id, route => route.fulfill({ json:{ challenge:{
    id,title,status:'disputed',type:'General',stake:0,maxParticipants:2,creatorId:'original_creator',
    creator:{id:'original_creator',username:'Original玩家'},description:'Original user description 原始描述',
    rules:'Original accepted rule 原始规则',proposition:null,evidenceType:'text',visibility:'public',
    isPublic:true,deadline:null,participants:[],evidence:[],judgments:[],_count:{evidence:0},
  } } }));
  await page.goto(BASE+'/app/quest?id='+id);
  await expect(page.locator('.ios-quest-description h1')).toHaveText(title);
  await page.getByTestId('sum-lang-zh').click();
  await expect(page.locator('.ios-quest-description h1')).toHaveText(title);
  await expect(page.locator('.ios-quest-description')).toContainText('Original user description 原始描述');
  await expect(page.locator('.ios-quest-detail-card')).toContainText('Original accepted rule 原始规则');
  await expect(page.locator('.ios-status').first()).toHaveText('结果复核中');
  await noOverflow(page);
  await expect(page.getByRole('button',{name:/Accept Quest/})).toHaveCount(0);
});
