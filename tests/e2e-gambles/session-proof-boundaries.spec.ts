import {expect,test,type Page} from '@playwright/test';
const BASE=process.env.TEST_BASE_URL??'http://localhost:3000';
const QUEST='synthetic_session_proof_20261028';
const A='synthetic_account_a',B='synthetic_account_b';
const privateText='SYNTHETIC_PRIVATE_A_DO_NOT_REUSE';
test.use({viewport:{width:390,height:844},video:'off'});
test.setTimeout(45000);
function quest(id=QUEST){return {id,title:privateText,description:'Synthetic controlled client boundary; not a production account.',creatorId:A,creator:{id:A,username:'Synthetic A'},status:'live',type:'General',visibility:'invite_only',isPublic:false,stake:0,evidenceType:'text',rules:'Each participant submits their own note.',proposition:'Compare notes',arbiter:'ai',maxParticipants:2,deadline:'2027-01-01T12:00:00.000Z',createdAt:'2026-10-28T00:00:00.000Z',participants:[A,B].map((id,i)=>({user:{id,username:i?'Synthetic B':'Synthetic A'},userId:id,role:i?'opponent':'creator',status:'accepted'})),evidence:[],judgments:[],_count:{evidence:0,judgments:0}};}
async function setup(page:Page){
 let owner:string|null=A;
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>localStorage.setItem('sum-language','en'));
 await page.route('**/api/auth/session',route=>route.fulfill({json:owner?{user:{id:owner,name:owner,username:owner,email:owner+'@example.invalid'},expires:'2027-01-01T00:00:00.000Z'}:{}}));
 return {owner:()=>owner,change:async(next:string|null)=>{
  owner=next;const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/session');
  await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'nextauth.message',newValue:JSON.stringify({event:'session',data:{trigger:'getSession'},timestamp:Date.now()})})));
  await response;
 }};
}
// Actual shipped React components; all identities and protected endpoint replies
// here are explicit fixtures. No production credentials, evidence or mutations.
test('changing account refreshes the current private Quest and removes the old authorized response',async({page})=>{
 const session=await setup(page);let reads=0;
 await page.route(`**/api/challenges/${QUEST}`,route=>{reads++;return session.owner()===A?route.fulfill({json:{challenge:quest()}}):route.fulfill({status:403,json:{error:'Synthetic B has no access'}});});
 await page.goto(BASE+'/app/quest?id='+QUEST);await expect(page.getByRole('heading',{name:privateText,exact:true})).toBeVisible();
 await session.change(B);await expect.poll(()=>reads).toBeGreaterThan(1);
 await expect(page.getByRole('heading',{name:privateText,exact:true})).toHaveCount(0);
 await expect(page.getByText('Synthetic B has no access',{exact:true})).toBeVisible();
});
test('logout removes previously authorized private Quest content without a reload',async({page})=>{
 const session=await setup(page);
 await page.route(`**/api/challenges/${QUEST}`,route=>session.owner()?route.fulfill({json:{challenge:quest()}}):route.fulfill({status:401,json:{error:'Synthetic session ended'}}));
 await page.goto(BASE+'/app/quest?id='+QUEST);await expect(page.getByRole('heading',{name:privateText,exact:true})).toBeVisible();
 await session.change(null);await expect(page.getByRole('heading',{name:privateText,exact:true})).toHaveCount(0);
 await expect(page.getByText('Synthetic session ended',{exact:true})).toBeVisible();
});
test('a slow prior-account read cannot restore protected content after the identity changes',async({page})=>{
 const session=await setup(page);let started=false;let release=()=>{};const held=new Promise<void>(resolve=>{release=resolve});
 await page.route(`**/api/challenges/${QUEST}`,async route=>{const owner=session.owner();if(owner===A){started=true;await held;await route.fulfill({json:{challenge:quest()}});}else await route.fulfill({status:403,json:{error:'Synthetic B has no access'}});});
 await page.goto(BASE+'/app/quest?id='+QUEST);await expect.poll(()=>started).toBe(true);await session.change(B);
 await expect(page.getByText('Synthetic B has no access',{exact:true})).toBeVisible();release();await page.waitForTimeout(300);
 await expect(page.getByRole('heading',{name:privateText,exact:true})).toHaveCount(0);
});
test('proof drafts and success belong to the current account, not the mounted page',async({page})=>{
 const session=await setup(page);
 await page.route(`**/api/challenges/${QUEST}`,r=>r.fulfill({json:{challenge:quest()}}));
 await page.route(`**/api/challenges/${QUEST}/evidence`,r=>r.fulfill({status:201,json:{evidence:{id:'synthetic_saved_a',challengeId:QUEST,userId:session.owner(),type:'text'}}}));
 await page.goto(BASE+'/app/evidence-add?id='+QUEST);await page.locator('#ios-proof-note').fill('A private unsent note');
 await session.change(B);await expect(page.locator('#ios-proof-note')).toHaveValue('');
 await page.locator('#ios-proof-note').fill('B verified note');await page.getByRole('button',{name:'Save written evidence',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your proof was saved.',exact:true})).toBeVisible();
 await session.change(A);await expect(page.getByRole('heading',{name:'Your proof was saved.',exact:true})).toHaveCount(0);await expect(page.locator('#ios-proof-note')).toHaveValue('');
});
test('a delayed save from the prior account cannot mark another account as submitted',async({page})=>{
 const session=await setup(page);let sent=false,release=()=>{};const held=new Promise<void>(r=>{release=r});
 await page.route(`**/api/challenges/${QUEST}`,r=>r.fulfill({json:{challenge:quest()}}));
 await page.route(`**/api/challenges/${QUEST}/evidence`,async r=>{sent=true;await held;await r.fulfill({status:201,json:{evidence:{id:'synthetic_late_a',challengeId:QUEST,userId:A,type:'text'}}});});
 await page.goto(BASE+'/app/evidence-add?id='+QUEST);await page.locator('#ios-proof-note').fill('Only A submitted this');
 await page.getByRole('button',{name:'Save written evidence',exact:true}).click();await expect.poll(()=>sent).toBe(true);await session.change(B);release();
 await expect(page.locator('#ios-proof-note')).toHaveValue('');await expect(page.getByRole('heading',{name:'Your proof was saved.',exact:true})).toHaveCount(0);
});
test('two synchronous proof clicks send once and prevent edits from disappearing mid-save',async({page})=>{
 await setup(page);let calls=0,release=()=>{};const held=new Promise<void>(r=>{release=r});
 await page.route(`**/api/challenges/${QUEST}`,r=>r.fulfill({json:{challenge:quest()}}));
 await page.route(`**/api/challenges/${QUEST}/evidence`,async r=>{calls++;await held;await r.fulfill({status:201,json:{evidence:{id:'synthetic_once',challengeId:QUEST,userId:A,type:'text'}}});});
 await page.goto(BASE+'/app/evidence-add?id='+QUEST);const note=page.locator('#ios-proof-note');await note.fill('A reviewed proof');
 await page.getByRole('button',{name:'Save written evidence',exact:true}).evaluate(el=>{el.dispatchEvent(new MouseEvent('click',{bubbles:true}));el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
 await expect.poll(()=>calls).toBe(1);await expect(note).toBeDisabled();release();await expect(page.getByRole('heading',{name:'Your proof was saved.',exact:true})).toBeVisible();expect(calls).toBe(1);
});
for(const body of [{},{evidence:{id:'wrong_owner',challengeId:QUEST,userId:B,type:'text'}}])test(`an invalid success receipt preserves the note: ${JSON.stringify(body)}`,async({page})=>{
 await setup(page);await page.route(`**/api/challenges/${QUEST}`,r=>r.fulfill({json:{challenge:quest()}}));
 await page.route(`**/api/challenges/${QUEST}/evidence`,r=>r.fulfill({status:200,json:body}));
 await page.goto(BASE+'/app/evidence-add?id='+QUEST);await page.locator('#ios-proof-note').fill('Keep this proof until confirmed');await page.getByRole('button',{name:'Save written evidence',exact:true}).click();
 await expect(page.locator('#ios-proof-note')).toHaveValue('Keep this proof until confirmed');await expect(page.locator('.ios-proof-form').getByRole('alert')).toBeVisible();await expect(page.getByRole('heading',{name:'Your proof was saved.',exact:true})).toHaveCount(0);
});
test('a failed save unlocks the original note and allows a valid retry',async({page})=>{
 await setup(page);let fail=true;await page.route(`**/api/challenges/${QUEST}`,r=>r.fulfill({json:{challenge:quest()}}));
 await page.route(`**/api/challenges/${QUEST}/evidence`,r=>fail?r.fulfill({status:503,json:{error:'Synthetic recoverable evidence failure'}}):r.fulfill({status:201,json:{evidence:{id:'synthetic_retry',challengeId:QUEST,userId:A,type:'text'}}}));
 await page.goto(BASE+'/app/evidence-add?id='+QUEST);const note=page.locator('#ios-proof-note');await note.fill('Do not lose the original attempt');await page.getByRole('button',{name:'Save written evidence',exact:true}).click();
 await expect(page.locator('.ios-proof-form').getByRole('alert')).toContainText('Synthetic recoverable evidence failure');await expect(note).toBeEnabled();await expect(note).toHaveValue('Do not lose the original attempt');
 fail=false;await page.getByRole('button',{name:'Save written evidence',exact:true}).click();await expect(page.getByRole('heading',{name:'Your proof was saved.',exact:true})).toBeVisible();
});

test('private evidence gallery never shows the prior account while the new account loads',async({page})=>{
 const session=await setup(page);let release=()=>{};const held=new Promise<void>(r=>{release=r});
 await page.route('**/api/challenges?*',async r=>{if(session.owner()===A)await r.fulfill({json:{challenges:[{...quest(),_count:{evidence:1,judgments:0}}],total:1}});else{await held;await r.fulfill({json:{challenges:[],total:0}});}});
 await page.route(`**/api/challenges/${QUEST}`,r=>r.fulfill({json:{challenge:{...quest(),evidence:[{id:'synthetic_private_gallery',userId:A,type:'text',url:null,description:'A_PRIVATE_GALLERY_NOTE',createdAt:'2026-10-28T00:00:00Z'}]}}}));
 await page.goto(BASE+'/app/evidence');await expect(page.getByText('A_PRIVATE_GALLERY_NOTE',{exact:false})).toBeVisible();
 await session.change(B);await expect(page.getByText('A_PRIVATE_GALLERY_NOTE',{exact:false})).toHaveCount(0);release();await expect(page.getByText('No evidence yet.',{exact:false})).toBeVisible();
});
test('media proof rejects an unconfirmed receipt without clearing the selected URL or description',async({page})=>{
 await setup(page);await page.route(`**/api/challenges/${QUEST}`,r=>r.fulfill({json:{challenge:{...quest(),evidenceType:'photo'}}}));
 await page.route(`**/api/challenges/${QUEST}/evidence`,r=>r.fulfill({status:200,json:{}}));
 await page.goto(BASE+'/app/evidence-add?id='+QUEST);await page.getByRole('button',{name:'Or paste a public HTTPS link',exact:true}).click();
 await page.locator('.proof-camp input[type="url"]').fill('https://example.invalid/synthetic-proof.png');const note=page.locator('.proof-camp textarea');await note.fill('Preserve the original media description');
 await page.getByRole('button',{name:'Submit proof',exact:true}).click();await expect(page.locator('.proof-camp').getByRole('alert')).toContainText('did not confirm');
 await expect(note).toHaveValue('Preserve the original media description');await expect(page.locator('.proof-camp input[type="url"]')).toHaveValue('https://example.invalid/synthetic-proof.png');
});
test('media proof has one save owner and retains nothing from another signed-in account',async({page})=>{
 const session=await setup(page);let calls=0,release=()=>{};const held=new Promise<void>(r=>{release=r});
 await page.route(`**/api/challenges/${QUEST}`,r=>r.fulfill({json:{challenge:{...quest(),evidenceType:'photo'}}}));
 await page.route(`**/api/challenges/${QUEST}/evidence`,async r=>{calls++;await held;await r.fulfill({status:201,json:{evidence:{id:'synthetic_media_a',challengeId:QUEST,userId:A,type:'photo'}}});});
 await page.goto(BASE+'/app/evidence-add?id='+QUEST);await page.getByRole('button',{name:'Or paste a public HTTPS link',exact:true}).click();
 await page.locator('.proof-camp input[type="url"]').fill('https://example.invalid/a-private-photo.png');await page.locator('.proof-camp textarea').fill('A private media draft');
 await page.getByRole('button',{name:'Submit proof',exact:true}).evaluate(el=>{el.dispatchEvent(new MouseEvent('click',{bubbles:true}));el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
 await expect.poll(()=>calls).toBe(1);await expect(page.locator('.proof-camp textarea')).toBeDisabled();await session.change(B);release();
 await expect(page.locator('.proof-camp textarea')).toHaveValue('');await expect(page.getByRole('heading',{name:'Your proof was saved.',exact:true})).toHaveCount(0);expect(calls).toBe(1);
});
