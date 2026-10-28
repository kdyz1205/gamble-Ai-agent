import {test,expect,type Page} from '@playwright/test';
const BASE=process.env.TEST_BASE_URL??'http://127.0.0.1:3000';
const ID='journey_context_fixture_20261028';
const challenge={id:ID,title:'Badminton meetup',description:'Read-only synthetic navigation fixture.',type:'Sports',status:'open',creatorId:'journey_host',creator:{id:'journey_host',username:'Host'},visibility:'public',isPublic:true,stake:0,evidenceType:'photo',proposition:'Play first to three',rules:'First to three verified rallies.',arbiter:'ai',maxParticipants:2,deadline:'2027-01-01T12:00:00Z',createdAt:'2026-10-28T00:00:00Z',participants:[],evidence:[],judgments:[],_count:{evidence:0,judgments:0}};
test.use({viewport:{width:390,height:844},video:'off'});test.setTimeout(45000);
async function setup(page:Page){await page.addInitScript(()=>localStorage.setItem('sum-language','en'));await page.emulateMedia({reducedMotion:'reduce'});await page.route('**/api/auth/session',r=>r.fulfill({json:{}}));await page.route('**/api/challenges?*',r=>r.fulfill({json:{challenges:[challenge,{...challenge,id:'journey_art_fixture',title:'Drawing practice',type:'Art'}],total:2}}));await page.route('**/api/challenges/'+ID,r=>r.fulfill({json:{challenge}}));}
async function filter(page:Page){await page.goto(BASE+'/app/discover');await page.getByRole('textbox',{name:'Search Quests',exact:true}).fill('badminton');await page.getByRole('button',{name:'Move',exact:true}).click();await expect(page.getByTestId('ios-quest-card')).toHaveCount(1);}
test('detail returns to the filtered list and keeps Discover selected',async({page})=>{
 await setup(page);await filter(page);await page.getByTestId('ios-quest-card').click();await expect(page.getByRole('heading',{name:challenge.title,exact:true})).toBeVisible();
 await expect(page.getByTestId('ios-tabbar').getByRole('link',{name:'Discover',exact:true})).toHaveAttribute('aria-current','page');await page.getByRole('link',{name:'Back',exact:true}).click();
 await expect(page).toHaveURL(/\/app\/discover\?/);await expect(page.getByRole('textbox',{name:'Search Quests',exact:true})).toHaveValue('badminton');await expect(page.getByRole('button',{name:'Move',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByTestId('ios-quest-card')).toHaveCount(1);
});
test('refresh restores discovery state from its shareable bounded URL',async({page})=>{
 await setup(page);await filter(page);await expect(page).toHaveURL(/category=move/);await page.reload();await expect(page.getByRole('textbox',{name:'Search Quests',exact:true})).toHaveValue('badminton');await expect(page.getByRole('button',{name:'Move',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('no matches offers clear filters instead of claiming the entire service is empty',async({page})=>{
 await setup(page);await page.goto(BASE+'/app/discover');await page.getByRole('textbox',{name:'Search Quests',exact:true}).fill('nonexistent topic');
 await expect(page.getByRole('heading',{name:'No matching Quests.',exact:true})).toBeVisible();await page.getByRole('button',{name:'Clear filters',exact:true}).click();await expect(page.getByRole('textbox',{name:'Search Quests',exact:true})).toHaveValue('');await expect(page.getByTestId('ios-quest-card')).toHaveCount(2);
});
test('a category with no matches is not called an empty challenge service',async({page})=>{
 await setup(page);await page.goto(BASE+'/app/discover');await page.getByRole('button',{name:'Grow',exact:true}).click();await expect(page.getByRole('heading',{name:'No matching Quests.',exact:true})).toBeVisible();await expect(page.getByText('No public open Quests right now.',{exact:false})).toHaveCount(0);
});
test('list read failure exposes an explicit retry with the filter still intact',async({page})=>{
 await setup(page);let fail=true;await page.route('**/api/challenges?*',r=>fail?r.fulfill({status:503,json:{error:'SYNTHETIC_LIST_UNAVAILABLE'}}):r.fulfill({json:{challenges:[challenge],total:1}}));
 await page.goto(BASE+'/app/discover?category=move&q=badminton');await expect(page.getByTestId('discovery-load-error')).toBeVisible();fail=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByTestId('ios-quest-card')).toHaveCount(1);await expect(page.getByRole('textbox',{name:'Search Quests',exact:true})).toHaveValue('badminton');
});
test('onboarding can go back without marking the introduction complete',async({page})=>{
 await setup(page);await page.goto(BASE+'/app/onboarding');await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.getByRole('heading',{name:'Move · Create · Grow',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Previous step',exact:true}).click();await expect(page.getByRole('heading',{name:'A Kinder, Braver You',exact:true})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('sum-ios-onboarding-complete'))).toBeNull();await page.getByTestId('sum-lang-zh').click();await expect(page.getByText('第 1 步，共 3 步',{exact:true})).toBeVisible();
});
for(const returnTo of ['https://example.invalid/steal','//example.invalid/steal','/api/auth/signout','/app/quest?id=loop','/app/discover?returnTo=https://evil.invalid'])test(`untrusted return destinations stay internal: ${returnTo}`,async({page})=>{
 await setup(page);await page.goto(BASE+'/app/quest?id='+ID+'&returnTo='+encodeURIComponent(returnTo));const back=page.getByRole('link',{name:'Back',exact:true});const href=await back.getAttribute('href');expect(href).toMatch(/^\/app\/(today|discover)(\?|$)/);expect(href).not.toContain('evil');expect(href).not.toContain('signout');
});
test('the invitation and proof/result links keep the originating list context',async({page})=>{
 await setup(page);await filter(page);await page.getByTestId('ios-quest-card').click();await page.getByRole('link',{name:'Review and join Quest',exact:true}).click();await expect(page.getByTestId('ios-quest-invite')).toBeVisible();
 await page.getByRole('link',{name:'Back',exact:true}).click();await expect(page).toHaveURL(/\/app\/quest\?/);await page.getByRole('link',{name:'Back',exact:true}).click();await expect(page.getByRole('textbox',{name:'Search Quests',exact:true})).toHaveValue('badminton');
});
test('browser back restores the selected list card without a private data cache',async({page})=>{
 await setup(page);await filter(page);await page.getByTestId('ios-quest-card').click();await expect(page.getByRole('heading',{name:challenge.title,exact:true})).toBeVisible();await page.goBack();await expect(page.getByRole('textbox',{name:'Search Quests',exact:true})).toHaveValue('badminton');await expect(page.getByRole('button',{name:'Move',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('a transient detail read can be retried without discarding its originating list',async({page})=>{
 await setup(page);let fail=true;await page.route('**/api/challenges/'+ID,r=>fail?r.fulfill({status:503,json:{error:'SYNTHETIC_DETAIL_UNAVAILABLE'}}):r.fulfill({json:{challenge}}));
 await page.goto(BASE+'/app/quest?id='+ID+'&returnTo='+encodeURIComponent('/app/discover?category=move&q=badminton'));
 await expect(page.getByText('SYNTHETIC_DETAIL_UNAVAILABLE',{exact:true})).toBeVisible();fail=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('heading',{name:challenge.title,exact:true})).toBeVisible();await page.getByRole('link',{name:'Back',exact:true}).click();await expect(page.getByRole('textbox',{name:'Search Quests',exact:true})).toHaveValue('badminton');
});
