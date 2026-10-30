import {expect,test,type Page} from '@playwright/test';
const BASE=process.env.TEST_BASE_URL??'http://localhost:3000';
const A='synthetic_ritual_owner_a',B='synthetic_ritual_owner_b';
const secret='SYNTHETIC_A_PERSONAL_RITUAL_DO_NOT_LEAK';
const onlyB='SYNTHETIC_B_RITUAL';
test.use({viewport:{width:390,height:844},video:'off'});test.setTimeout(60000);
async function setup(page:Page){
 let owner:string|null=A;
 await page.addInitScript(({A,B,secret,onlyB})=>{
   localStorage.setItem('sum-language','en');
   localStorage.setItem('sum-ios-onboarding-complete','true');
   for(const [id,label] of [[A,secret],[B,onlyB]]){
     localStorage.setItem('sum-ios-daily-v1:'+id,JSON.stringify([{id:id,label,createdAt:new Date().toISOString(),completedDays:[]}]));
   }
 },{A,B,secret,onlyB});
 await page.route('**/api/auth/session',r=>r.fulfill({json:owner?{user:{id:owner,name:owner,email:owner+'@example.invalid'},expires:'2027-01-01T00:00:00Z'}:{}}));
 await page.route('**/api/challenges?*',r=>r.fulfill({json:{challenges:[],total:0}}));
 return {change:async(id:string|null)=>{
   owner=id;const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/session');
   await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'nextauth.message',newValue:JSON.stringify({event:'session',data:{trigger:'getSession'},timestamp:Date.now()})})));await response;
 }};
}
test('switching accounts never leaves another owner’s local goals or check-ins visible',async({page})=>{
 const session=await setup(page);await page.goto(BASE+'/app/today');await page.locator('details.ios-command-daily > summary').click();
 await expect(page.getByText(secret,{exact:true})).toBeVisible();
 await session.change(B);await expect(page.getByText(onlyB,{exact:true})).toBeVisible();
 await expect(page.getByText(secret,{exact:true})).toHaveCount(0);
 await session.change(A);await expect(page.getByText(secret,{exact:true})).toBeVisible();
 await expect(page.getByText(onlyB,{exact:true})).toHaveCount(0);
});
test('a guest cannot read or overwrite a previous signed-in account’s local goals',async({page})=>{
 const session=await setup(page);await page.goto(BASE+'/app/today');await page.locator('details.ios-command-daily > summary').click();await expect(page.getByText(secret,{exact:true})).toBeVisible();
 await session.change(null);
 await expect(page.getByText(secret,{exact:true})).toHaveCount(0);
 await page.locator('.ios-daily-rituals .ios-text-action').click();
 await page.getByLabel('Create a daily goal').fill('A guest-only habit');
 await page.locator('.ios-ritual-add button[type=submit]').click();
 const saved=await page.evaluate(id=>({original:localStorage.getItem('sum-ios-daily-v1:'+id),guest:localStorage.getItem('sum-ios-daily-v1:guest')}),A);
 expect(saved.original).toContain(secret);expect(saved.original).not.toContain('guest-only');expect(saved.guest).toContain('guest-only');
});
test('same-tick independent goal clicks never overwrite one another through stale state closures',async({page})=>{
 await setup(page);await page.goto(BASE+'/app/today');await page.locator('details.ios-command-daily > summary').click();await expect(page.getByText(secret,{exact:true})).toBeVisible();
 await page.locator('.ios-daily-rituals .ios-text-action').click();
 await page.locator('.ios-ritual-examples button').evaluateAll(buttons=>{
   buttons[0].dispatchEvent(new MouseEvent('click',{bubbles:true}));
   buttons[1].dispatchEvent(new MouseEvent('click',{bubbles:true}));
 });
 const record=await page.evaluate(id=>JSON.parse(localStorage.getItem('sum-ios-daily-v1:'+id)||'[]') as Array<{label:string}>,A);
 expect(record.map(x=>x.label)).toContain('Read 10 minutes');
 expect(record.map(x=>x.label)).toContain('Draw something');
});
test('another tab’s same-owner updates synchronize without borrowing an unrelated account’s storage',async({page})=>{
 await setup(page);await page.goto(BASE+'/app/today');await page.locator('details.ios-command-daily > summary').click();await expect(page.getByText(secret,{exact:true})).toBeVisible();
 await page.evaluate(id=>{
  const key='sum-ios-daily-v1:'+id;
  const next=[{id:'new-synthetic',label:'SYNTHETIC_SYNCED_IN_ANOTHER_TAB',createdAt:new Date().toISOString(),completedDays:[]}];
  localStorage.setItem(key,JSON.stringify(next));
  window.dispatchEvent(new StorageEvent('storage',{key,newValue:JSON.stringify(next)}));
 },A);
 await expect(page.getByText('SYNTHETIC_SYNCED_IN_ANOTHER_TAB',{exact:true})).toBeVisible();
 await expect(page.getByText(secret,{exact:true})).toHaveCount(0);
 await page.evaluate(id=>window.dispatchEvent(new StorageEvent('storage',{key:'sum-ios-daily-v1:'+id,newValue:'[]'})),B);
 await expect(page.getByText('SYNTHETIC_SYNCED_IN_ANOTHER_TAB',{exact:true})).toBeVisible();
});
test('daily goal labels and actions are localized without rewriting saved user-provided goal text',async({page})=>{
 await setup(page);await page.goto(BASE+'/app/today');await page.locator('details.ios-command-daily > summary').click();await expect(page.getByText(secret,{exact:true})).toBeVisible();
 await page.getByTestId('sum-lang-zh').click();
 await expect(page.getByRole('button',{name:'添加每日目标',exact:true})).toBeVisible();
 await expect(page.getByText(secret,{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'添加每日目标',exact:true}).click();
 await expect(page.getByLabel('创建每日目标')).toBeVisible();
 await page.getByRole('button',{name:'取消',exact:true}).click();
 await expect(page.getByLabel('创建每日目标')).toHaveCount(0);
});
