import {test,expect,type Page} from '@playwright/test';
const BASE=process.env.TEST_BASE_URL??'http://localhost:3000';
const A='input_memory_owner_a',B='input_memory_owner_b';
const original='Keep this unsent challenge 原文 <3 & "rules"';
const reply={userVisibleReply:'Synthetic reviewed response',agentAction:'draft_ready',draftPatch:{},toolName:null,toolArgs:null,draftState:{title:'Synthetic reviewed challenge',proposition:'First to three',participants:'you + 1 invited friend',stake:0,stakeType:'none',evidenceType:'text',judgeRule:'Count rallies',timeWindow:'24 hours',safetyNotes:[],readyToPublish:true}};
test.use({viewport:{width:390,height:844},locale:'en-US',video:'off'});test.setTimeout(45000);
async function setup(page:Page,initialOwner:string|null=null){
 let owner=initialOwner;const writes:string[]=[];
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>{try{localStorage.setItem('sum-language','en');}catch{}});
 await page.route('**/api/auth/session',r=>r.fulfill({json:owner?{user:{id:owner,name:owner},expires:'2027-01-01T00:00:00Z'}:{}}));
 await page.route('**/api/challenges?*',r=>r.fulfill({json:{challenges:[],total:0}}));
 await page.route('**/api/**',r=>{
  if(['GET','HEAD','OPTIONS'].includes(r.request().method()))return r.fallback();
  writes.push(new URL(r.request().url()).pathname);
  return r.fulfill({status:503,json:{error:'Unconfigured synthetic write blocked'}});
 });
 return {writes,changeOwner:async(next:string|null)=>{
  owner=next;const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/session');
  await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'nextauth.message',newValue:JSON.stringify({event:'session',data:{trigger:'getSession'},timestamp:Date.now()})})));
  await response;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 }};
}
const input=(page:Page)=>page.getByTestId('pact-composer').locator('textarea');
async function away(page:Page){await input(page).blur();await page.getByTestId('ios-tabbar').locator('a[href="/app/discover"]').click();await expect(page).toHaveURL(/\/app\/discover$/);}
async function back(page:Page){await page.getByTestId('ios-tabbar').locator('a[href="/app/create"]').click();await expect(input(page)).toBeVisible();}
async function setTerms(page:Page){await page.locator('.quest-terms summary').click();await page.locator('input[type="number"]').fill('17');await page.getByRole('button',{name:'Open match',exact:true}).click();await page.getByRole('button',{name:'72 hours',exact:true}).click();}

test('cross-section navigation restores exact unsent input and chosen terms without sending',async({page},info)=>{
 const f=await setup(page);await page.goto(BASE+'/app/create');await input(page).fill(original);await setTerms(page);await away(page);await back(page);
 await expect(input(page)).toHaveValue(original);await expect(page.getByTestId('composer-input-restored')).toBeVisible();await page.locator('.quest-terms summary').click();await expect(page.locator('input[type="number"]')).toHaveValue('17');await expect(page.getByRole('button',{name:'Open match',exact:true})).toHaveAttribute('data-selected','true');await expect(page.getByRole('button',{name:'72 hours',exact:true})).toHaveAttribute('data-selected','true');
 await expect(page.getByTestId('challenge-contract-result')).toHaveCount(0);expect(f.writes).toEqual([]);await page.screenshot({path:info.outputPath('restored-unsent-input.png'),fullPage:true});
});
test('browser back recovers the unsent message after leaving the editor',async({page})=>{
 await setup(page);await page.goto(BASE+'/app/create');await input(page).fill(original);await away(page);await page.goBack();await expect(input(page)).toHaveValue(original);
});
test('deleted input is not resurrected by a second navigation',async({page})=>{
 await setup(page);await page.goto(BASE+'/app/create');await input(page).fill(original);await away(page);await back(page);await expect(input(page)).toHaveValue(original);await input(page).fill('');await away(page);await back(page);await expect(input(page)).toHaveValue('');await expect(page.getByTestId('composer-input-restored')).toHaveCount(0);
});
test('changing accounts while the editor is absent clears the old input even after returning to A',async({page})=>{
 const f=await setup(page,A);await page.goto(BASE+'/app/create');await input(page).fill('PRIVATE_OWNER_A');await away(page);await f.changeOwner(B);await back(page);await expect(input(page)).toHaveValue('');await input(page).fill('PRIVATE_OWNER_B');await away(page);await f.changeOwner(A);await back(page);await expect(input(page)).toHaveValue('');expect(f.writes).toEqual([]);
});
test('logout on another section clears prior account input before a later login',async({page})=>{
 const f=await setup(page,A);await page.goto(BASE+'/app/create');await input(page).fill('PRIVATE_BEFORE_LOGOUT');await away(page);await f.changeOwner(null);await f.changeOwner(A);await back(page);await expect(input(page)).toHaveValue('');
});
test('an intentional guest login and same-owner refresh preserve the unsent input',async({page})=>{
 const f=await setup(page);await page.goto(BASE+'/app/create');await input(page).fill(original);await away(page);await f.changeOwner(A);await f.changeOwner(A);await back(page);await expect(input(page)).toHaveValue(original);expect(f.writes).toEqual([]);
});
test('another tab cannot read this tabs in-memory input',async({page,context})=>{
 await setup(page,A);await page.goto(BASE+'/app/create');await input(page).fill(original);await away(page);const other=await context.newPage();try{await setup(other,A);await other.goto(BASE+'/app/create');await expect(input(other)).toHaveValue('');}finally{await other.close();}await back(page);await expect(input(page)).toHaveValue(original);
});
test('navigation recovery works when all Web Storage access is denied',async({page})=>{
 const f=await setup(page);await page.addInitScript(()=>{for(const method of ['getItem','setItem','removeItem']as const)Object.defineProperty(Storage.prototype,method,{configurable:true,value:()=>{throw new DOMException('Blocked by privacy policy','SecurityError');}});});
 await page.goto(BASE+'/app/create');await input(page).fill(original);await away(page);await back(page);await expect(input(page)).toHaveValue(original);expect(f.writes).toEqual([]);
});
test('a full reload does not leave private input on disk or claim a server draft',async({page})=>{
 const f=await setup(page);await page.goto(BASE+'/app/create');await input(page).fill(original);await away(page);await back(page);await expect(input(page)).toHaveValue(original);const storage=await page.evaluate(()=>[...Object.values(localStorage),...Object.values(sessionStorage)].join('\n'));expect(storage).not.toContain(original);await page.reload();await expect(input(page)).toHaveValue('');await expect(page.getByTestId('composer-input-restored')).toHaveCount(0);expect(f.writes).toEqual([]);
});
test('Chinese restoration keeps authored text and chosen values unchanged',async({page},info)=>{
 await setup(page);await page.goto(BASE+'/app/create');await page.getByTestId('sum-lang-zh').click();await input(page).fill(original);await away(page);await back(page);await expect(input(page)).toHaveValue(original);await expect(page.getByTestId('composer-input-restored')).toContainText('不会自动发送');await page.screenshot({path:info.outputPath('restored-unsent-input-zh.png'),fullPage:true});
});
test('a failed first-message request remains recoverable but is never resent on return',async({page})=>{
 await setup(page);let requests=0;await page.route('**/api/agent/respond',r=>{requests++;return r.fulfill({status:503,json:{error:'Synthetic draft outage'}});});await page.goto(BASE+'/app/create');await input(page).fill(original);await page.getByRole('button',{name:'Summon',exact:true}).click();await expect(page.getByTestId('pact-composer').getByRole('alert')).toContainText('Synthetic draft outage');await away(page);await back(page);await expect(input(page)).toHaveValue(original);expect(requests).toBe(1);
});
test('sending an input clears navigation memory instead of restoring a reviewed turn as new',async({page})=>{
 await setup(page);let requests=0;await page.route('**/api/agent/respond',r=>{requests++;return r.fulfill({json:reply});});await page.goto(BASE+'/app/create');await input(page).fill(original);await page.getByRole('button',{name:'Summon',exact:true}).click();await expect(page.getByTestId('challenge-contract-result')).toBeVisible();await away(page);await back(page);await expect(input(page)).toHaveValue('');await expect(page.getByRole('button',{name:'Publish free quest',exact:true})).toHaveCount(0);expect(requests).toBe(1);
});
test('an in-flight request is not replayed or restored as unsent after navigation',async({page})=>{
 await setup(page);let requests=0,release=()=>{};const held=new Promise<void>(r=>{release=r;});await page.route('**/api/agent/respond',async r=>{requests++;await held;try{await r.fulfill({json:reply});}catch{}});await page.goto(BASE+'/app/create');await input(page).fill(original);await page.getByRole('button',{name:'Summon',exact:true}).click();await expect.poll(()=>requests).toBe(1);await away(page);await back(page);release();await expect(input(page)).toHaveValue('');await expect(page.getByTestId('challenge-contract-result')).toHaveCount(0);expect(requests).toBe(1);
});
test('manual terms alone survive an empty initial message without implying a ready challenge',async({page})=>{
 const f=await setup(page);await page.goto(BASE+'/app/create');await setTerms(page);await away(page);await back(page);await expect(input(page)).toHaveValue('');await page.locator('.quest-terms summary').click();await expect(page.locator('input[type="number"]')).toHaveValue('17');await expect(page.getByRole('button',{name:'Summon',exact:true})).toBeDisabled();expect(f.writes).toEqual([]);
});

test('a valid one-use authentication checkpoint takes precedence over older navigation input',async({page})=>{
 const f=await setup(page);await page.goto(BASE+'/app/create');await input(page).fill('OLDER_LOCAL_INPUT');await away(page);
 await page.evaluate(draft=>sessionStorage.setItem('summoner:composer:auth-return:v1',JSON.stringify({ownerId:null,savedAt:Date.now(),input:'NEWER_AUTH_RETURN',settings:{stake:'0',opponentMode:'Invite only',proofWindow:'24 hours'},draft,turns:[]})),reply.draftState);
 await back(page);await expect(input(page)).toHaveValue('NEWER_AUTH_RETURN');expect(await page.evaluate(()=>sessionStorage.getItem('summoner:composer:auth-return:v1'))).toBeNull();expect(f.writes).toEqual([]);
});
test('typing during slow initial authentication is never overwritten by an older checkpoint',async({page})=>{
 await setup(page,A);let release=()=>{};const held=new Promise<void>(r=>{release=r;});await page.route('**/api/auth/session',async r=>{await held;await r.fulfill({json:{user:{id:A,name:A},expires:'2027-01-01T00:00:00Z'}});});
 await page.addInitScript(draft=>sessionStorage.setItem('summoner:composer:auth-return:v1',JSON.stringify({ownerId:'input_memory_owner_a',savedAt:Date.now(),input:'OLD_CHECKPOINT',settings:{stake:'0',opponentMode:'Invite only',proofWindow:'24 hours'},draft,turns:[]})),reply.draftState);
 await page.goto(BASE+'/app/create',{waitUntil:'domcontentloaded'});await input(page).fill('NEW_CURRENT_TYPING');await setTerms(page);const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/session');release();await response;await expect(input(page)).toHaveValue('NEW_CURRENT_TYPING');await expect(page.locator('input[type="number"]')).toHaveValue('17');await away(page);await back(page);await expect(input(page)).toHaveValue('NEW_CURRENT_TYPING');
});
