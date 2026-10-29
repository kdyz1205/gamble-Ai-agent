import {expect,test,type Page} from '@playwright/test';
const BASE=process.env.TEST_BASE_URL??'http://localhost:3000';
test.use({viewport:{width:390,height:844},video:'off'});test.setTimeout(45000);
async function guest(page:Page){await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(()=>localStorage.setItem('sum-language','en'));await page.route('**/api/auth/session',r=>r.fulfill({json:{}}));await page.goto(BASE+'/app/picos');await expect(page.getByTestId('ios-full-app')).toHaveAttribute('data-hydrated','true');}
test('companions give one real next action while account records and simulations start collapsed',async({page})=>{
 await guest(page);await expect(page.getByRole('link',{name:'Create a Quest with Pico',exact:true})).toHaveAttribute('href','/app/create');await expect(page.getByRole('region',{name:'Your Owned Familiars',exact:true})).toBeVisible();
 await expect(page.getByTestId('companion-records')).not.toHaveAttribute('open','');await expect(page.getByTestId('companion-concepts')).not.toHaveAttribute('open','');await expect(page.getByRole('tablist',{name:'Summon design chapters'})).not.toBeVisible();
 await page.getByRole('link',{name:'Create a Quest with Pico',exact:true}).click();await expect(page).toHaveURL(BASE+'/app/create');await expect(page.getByTestId('pact-composer')).toBeVisible();
});
test('section navigation reveals the requested content and never grants items or changes credits',async({page})=>{
 const writes:string[]=[];page.on('request',r=>{if(r.url().includes('/api/')&&r.method()==='POST')writes.push(r.url());});await guest(page);
 await page.getByRole('navigation',{name:'Companion sections'}).getByRole('link',{name:'Recorded progress',exact:true}).click();await expect(page.getByTestId('companion-records')).toHaveAttribute('open','');await expect(page.getByRole('region',{name:'Recorded Profession XP',exact:true})).toContainText('Sign in to check server-verified Quest XP');
 await page.getByRole('navigation',{name:'Companion sections'}).getByRole('link',{name:'Concept atlas',exact:true}).click();await expect(page.getByTestId('companion-concepts')).toHaveAttribute('open','');await expect(page.getByRole('group',{name:'Twelve concept creature families'}).getByRole('button')).toHaveCount(12);expect(writes).toEqual([]);
});
test('keyboard chapter navigation has one focus target and retains concept choices through disclosure toggles',async({page})=>{
 await guest(page);await page.getByTestId('companion-concepts').locator('summary').click();await page.getByTestId('creature-family-software').click();await page.getByRole('combobox',{name:'Specific profession or skill'}).selectOption('robotics');
 const tabs=page.getByRole('tablist',{name:'Summon design chapters'});const first=tabs.getByRole('tab',{name:'Career Atlas',exact:true});await first.focus();await page.keyboard.press('ArrowRight');await expect(tabs.getByRole('tab',{name:'Summon Preview',exact:true})).toBeFocused();await expect(tabs.getByRole('tab',{name:'Summon Preview',exact:true})).toHaveAttribute('aria-selected','true');await expect(tabs.locator('[tabindex="0"]')).toHaveCount(1);
 await page.keyboard.press('End');await expect(tabs.getByRole('tab',{name:'XP Guide',exact:true})).toBeFocused();await page.keyboard.press('Home');await expect(first).toBeFocused();await expect(page.getByRole('combobox',{name:'Specific profession or skill'})).toHaveValue('robotics');
 await page.getByTestId('companion-concepts').locator('summary').click();await page.getByTestId('companion-concepts').locator('summary').click();await expect(page.getByRole('combobox',{name:'Specific profession or skill'})).toHaveValue('robotics');
});
for(const width of [320,390,1440])test(`overview, records and concept navigation fit ${width}px in Chinese`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await guest(page);await page.getByTestId('sum-lang-zh').click();await expect(page.getByRole('link',{name:'和 Pico 创建 Quest',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Your Owned Familiars',exact:true})).toContainText('登录后查看');
 await page.getByRole('navigation',{name:'召唤兽页面分区'}).getByRole('link',{name:'概念图鉴',exact:true}).click();await expect(page.getByTestId('companion-concepts')).toHaveAttribute('open','');await expect(page.getByRole('tab',{name:'职业图鉴',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await page.getByTestId('companion-concepts').locator('summary').click();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:info.outputPath(`companion-overview-${width}-zh.png`),fullPage:true});
});
test('an unavailable owned inventory stays unknown, never a fabricated empty collection',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(()=>localStorage.setItem('sum-language','en'));
 await page.route('**/api/auth/session',r=>r.fulfill({json:{user:{id:'synthetic_inventory_owner',name:'Synthetic',email:'synthetic@example.invalid'},expires:'2027-01-01T00:00:00Z'}}));
 await page.route('**/api/challenges?*',r=>r.fulfill({json:{challenges:[],total:0}}));await page.route('**/api/summons/me',r=>r.fulfill({status:503,json:{error:'Synthetic account service unavailable'}}));
 await page.goto(BASE+'/app/picos');const region=page.getByRole('region',{name:'Your Owned Familiars',exact:true});await expect(region).toBeVisible();await expect(region.getByRole('alert')).toBeVisible();await expect(region).not.toContainText('0 confirmed items');
});
