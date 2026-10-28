import {expect,test} from '@playwright/test';
const BASE=process.env.TEST_BASE_URL??'http://localhost:3000';
const destinations=['/app/today','/app/discover','/app/create','/app/picos','/app/profile'];
test.use({viewport:{width:390,height:844},video:'off'});
test.setTimeout(45000);
for(const route of ['/me','/quests','/summons'])test(`legacy ${route} has only one primary navigation with canonical destinations`,async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto(BASE+route);
  const docks=page.locator('nav.sum-app-dock, nav.quest-mobile-dock');
  await expect(docks).toHaveCount(1);await expect(docks).toBeVisible();
  expect(await docks.locator('a').evaluateAll(rows=>rows.map(r=>r.getAttribute('href')))).toEqual(destinations);
  await expect(docks.locator('[aria-current="page"]')).toHaveCount(1);
  await docks.getByRole('link',{name:'Create',exact:true}).click();
  await expect(page).toHaveURL(BASE+'/app/create');
  await expect(page.getByTestId('ios-tabbar')).toHaveCount(1);
  await expect(page.getByTestId('sum-app-dock')).toHaveCount(0);
});
for(const route of ['/privacy','/terms','/support','/calculator'])test(`informational ${route} does not render a player dock`,async({page})=>{
  await page.goto(BASE+route);await expect(page.locator('nav.sum-app-dock, nav.quest-mobile-dock')).toHaveCount(0);
  await expect(page.getByRole('heading').first()).toBeVisible();
});
test('marketing launch links enter the current game and retain selected starting categories',async({page})=>{
  await page.goto(BASE+'/enter');
  const oldLinks=await page.locator('main a, nav.sum-premium-shortcuts a').evaluateAll(rows=>rows.map(r=>r.getAttribute('href')).filter(href=>href&&/^\/(summons|markets|rituals)(?:\?|$)/.test(href)));
  expect(oldLinks).toEqual([]);
  const seed=page.locator('a.sw-realm').filter({has:page.getByRole('heading',{name:'An idea worth bringing to life.'})});
  await expect(seed).toHaveAttribute('href','/app/create?seed=craft');await seed.click();
  await expect(page).toHaveURL(BASE+'/app/create?seed=craft');
  await expect(page.locator('[data-testid="pact-composer"] textarea')).toHaveValue(/creative project/);
});
test('the account ledger and complete Quest history remain reachable from the new profile',async({page})=>{
  await page.goto(BASE+'/app/profile');
  const ledger=page.getByRole('link',{name:'Credit activity',exact:true});await expect(ledger).toHaveAttribute('href','/me');
  await expect(page.getByRole('link',{name:'All Quest records',exact:true})).toHaveAttribute('href','/quests');
  await ledger.click();await expect(page).toHaveURL(BASE+'/me');
  // Anonymous identity must still be rejected; do not mock a balance or make an account.
  await expect(page.getByRole('heading',{name:'Keep your quest history together'})).toBeVisible();
});

for(const width of [320,390])test(`site and legacy headers preserve brand and action at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});
  for(const route of ['/me','/enter']){
    await page.goto(BASE+route);
    const brand=page.locator('.sum-scene-brand-compact');await expect(brand).toBeVisible();await expect(brand).toHaveText('SUM');
    const bounds=await brand.evaluate(el=>({visible:el.clientWidth,content:el.scrollWidth,overflow:document.documentElement.scrollWidth-innerWidth}));
    expect(bounds.content).toBeLessThanOrEqual(bounds.visible);expect(bounds.overflow).toBeLessThanOrEqual(1);
    const action=page.locator('.quest-hud .sum-world-button');
    expect(await action.evaluate(el=>{const r=el.getBoundingClientRect();return r.right<=innerWidth&&r.left>=0&&r.height>=44;})).toBe(true);
    await page.getByTestId('sum-lang-zh').click();await expect(brand).toHaveText('SUM');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  }
});
