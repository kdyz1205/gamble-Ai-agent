import {test,expect} from '@playwright/test';
const BASE=process.env.TEST_BASE_URL??'http://localhost:3000';
test.use({video:'off',locale:'en-US'});test.setTimeout(45000);
for(const width of[320,390])test(`profile menu end-scroll leaves the ledger link above the dock at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto(BASE+'/app/profile');await expect(page.getByTestId('ios-full-app')).toHaveAttribute('data-hydrated','true');await page.evaluate(()=>document.fonts.ready);
 const link=page.getByRole('link',{name:'Credit activity',exact:true});await expect(link).toHaveAttribute('href','/me');
 await link.evaluate(el=>el.scrollIntoView({block:'end'}));
 const bounds=await link.evaluate(el=>{const r=el.getBoundingClientRect(),dock=document.querySelector('[data-testid="ios-tabbar"]')!.getBoundingClientRect();return {top:r.top,bottom:r.bottom,dockTop:dock.top,hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),root:getComputedStyle(document.documentElement).scrollBehavior};});
 expect(bounds.root).toBe('auto');expect(bounds.top).toBeGreaterThanOrEqual(0);expect(bounds.bottom).toBeLessThanOrEqual(bounds.dockTop);expect(bounds.hit).toBe(true);
 await link.click();await expect(page).toHaveURL(BASE+'/me');await expect(page.getByRole('heading',{name:'Keep your quest history together'})).toBeVisible();
});
test('app scroll targeting is scoped and returns to the existing site policy outside the app',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(BASE+'/app/profile');await expect(page.getByTestId('ios-full-app')).toHaveAttribute('data-hydrated','true');expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
 await page.getByRole('link',{name:'Help & Support',exact:true}).click();await expect(page).toHaveURL(BASE+'/support');await expect(page.getByTestId('ios-full-app')).toHaveCount(0);expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior)).toBe('smooth');
});
test('reduced motion keeps programmatic app navigation stable without hiding any destination',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:667});await page.goto(BASE+'/app/profile');await expect(page.getByTestId('ios-full-app')).toHaveAttribute('data-hydrated','true');
 const link=page.getByRole('link',{name:'All Quest records',exact:true});await link.evaluate(el=>el.scrollIntoView({block:'end'}));expect(await link.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);await link.press('Enter');await expect(page).toHaveURL(BASE+'/quests');
});
