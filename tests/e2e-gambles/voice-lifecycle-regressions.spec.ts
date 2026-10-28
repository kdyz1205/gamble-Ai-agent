import {expect,test} from '@playwright/test';
import {allTracksStopped,doubleClick,leaveAppPage,mediaFixture,MEDIA_A,MEDIA_B} from './synthetic-media-fixture';
const BASE=process.env.TEST_BASE_URL??'http://localhost:3000';
test.use({viewport:{width:390,height:844},video:'off',permissions:['microphone','camera'],launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}});
test.setTimeout(45000);
const draft={title:'A_PRIVATE_REVIEWED_DRAFT',proposition:'Compare three rallies',participants:'you + 1 invited friend',stake:0,stakeType:'none',evidenceType:'text',judgeRule:'Count verified rallies',timeWindow:'24 hours',safetyNotes:[],readyToPublish:true};
const reply={userVisibleReply:'A_PRIVATE_REVIEWED_DRAFT',agentAction:'draft_ready',draftPatch:{},toolName:null,toolArgs:null,draftState:draft};
test('permission-pending voice starts have a single synchronous owner',async({page})=>{
 await mediaFixture(page,{hold:true});await page.goto(BASE+'/app/create');await doubleClick(page,'button[aria-label="Describe quest by voice"]');
 await expect.poll(()=>page.evaluate(()=>window.__sumMediaProbe.requests)).toBe(1);
 await page.evaluate(()=>window.__sumMediaProbe.release());await expect(page.getByRole('button',{name:'Stop voice recording',exact:true})).toBeVisible();
 await leaveAppPage(page);await allTracksStopped(page);
});
test('a late microphone permission result is stopped after leaving the composer',async({page})=>{
 await mediaFixture(page,{hold:true});let transcription=0;await page.route('**/api/transcribe',r=>{transcription++;return r.fulfill({json:{transcript:'Should not appear'}});});
 await page.goto(BASE+'/app/create');await page.getByRole('button',{name:'Describe quest by voice',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__sumMediaProbe.streams.length)).toBe(1);await leaveAppPage(page);await page.evaluate(()=>window.__sumMediaProbe.release());
 await allTracksStopped(page);expect(transcription).toBe(0);expect(await page.evaluate(()=>window.__sumMediaProbe.recorders.length)).toBe(0);
});
test('pending microphone permission can be cancelled and a stale result cannot start recording',async({page},testInfo)=>{
 await mediaFixture(page,{hold:true});await page.goto(BASE+'/app/create');await page.getByRole('button',{name:'Describe quest by voice',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__sumMediaProbe.streams.length)).toBe(1);
 await page.screenshot({path:testInfo.outputPath('synthetic-voice-permission-cancel.png'),fullPage:true});
 await page.getByRole('button',{name:'Cancel voice recording',exact:true}).click();await page.evaluate(()=>window.__sumMediaProbe.release());await allTracksStopped(page);
 await expect(page.getByRole('button',{name:'Describe quest by voice',exact:true})).toBeEnabled();expect(await page.evaluate(()=>window.__sumMediaProbe.recorders.length)).toBe(0);
});
test('normal voice stop transcribes once, releases tracks and retains existing text',async({page})=>{
 await mediaFixture(page);let calls=0;await page.route('**/api/transcribe',r=>{calls++;return r.fulfill({json:{transcript:'synthetic spoken addition'}});});
 await page.goto(BASE+'/app/create');const input=page.getByTestId('pact-composer').locator('textarea');await input.fill('Existing draft');await input.blur();
 await page.getByRole('button',{name:'Describe quest by voice',exact:true}).click();await expect(page.getByRole('button',{name:'Stop voice recording',exact:true})).toBeVisible();await page.waitForTimeout(350);
 await doubleClick(page,'button[aria-label="Stop voice recording"]');await expect(input).toHaveValue('Existing draft synthetic spoken addition');await allTracksStopped(page);expect(calls).toBe(1);
});
test('a recorder error discards partial audio instead of transcribing it',async({page})=>{
 await mediaFixture(page);let calls=0;await page.route('**/api/transcribe',r=>{calls++;return r.fulfill({json:{transcript:'BAD_PARTIAL_AUDIO'}});});
 await page.goto(BASE+'/app/create');await page.getByRole('button',{name:'Describe quest by voice',exact:true}).click();await expect(page.getByRole('button',{name:'Stop voice recording',exact:true})).toBeVisible();await page.waitForTimeout(350);
 await page.evaluate(()=>window.__sumMediaProbe.recorders[0].dispatchEvent(new Event('error')));await allTracksStopped(page);await expect(page.getByTestId('pact-composer').getByRole('alert')).toBeVisible();await page.waitForTimeout(250);expect(calls).toBe(0);
});
test('voice start failure releases the microphone and allows an explicit retry',async({page})=>{
 await mediaFixture(page);await page.goto(BASE+'/app/create');await page.evaluate(()=>{window.__sumMediaProbe.failStart=true;});await page.getByRole('button',{name:'Describe quest by voice',exact:true}).click();
 await expect(page.getByTestId('pact-composer').getByRole('alert')).toContainText('Synthetic start failure');await allTracksStopped(page);
 await page.evaluate(()=>{window.__sumMediaProbe.failStart=false;});await page.getByRole('button',{name:'Describe quest by voice',exact:true}).click();await expect(page.getByRole('button',{name:'Stop voice recording',exact:true})).toBeVisible();await leaveAppPage(page);await allTracksStopped(page);
});
test('switching signed-in owners clears prior drafts and ignores a late agent response',async({page})=>{
 const session=await mediaFixture(page);let sent=false,release=()=>{};const held=new Promise<void>(r=>{release=r;});
 await page.route('**/api/agent/respond',async r=>{sent=true;await held;await r.fulfill({json:reply});});
 await page.goto(BASE+'/app/create');const input=page.getByTestId('pact-composer').locator('textarea');await input.fill('A_PRIVATE_INPUT');await page.getByRole('button',{name:'Summon',exact:true}).click();await expect.poll(()=>sent).toBe(true);
 await session.changeOwner(MEDIA_B);release();await expect(input).toBeEnabled();await expect(input).toHaveValue('');await expect(page.getByTestId('challenge-contract-result')).toHaveCount(0);await expect(page.getByRole('log')).toHaveCount(0);
});
test('switching owners stops active voice and prevents delayed transcript insertion',async({page})=>{
 const session=await mediaFixture(page);let sent=false,release=()=>{};const held=new Promise<void>(r=>{release=r;});await page.route('**/api/transcribe',async r=>{sent=true;await held;await r.fulfill({json:{transcript:'A_PRIVATE_TRANSCRIPT'}});});
 await page.goto(BASE+'/app/create');await page.getByRole('button',{name:'Describe quest by voice',exact:true}).click();await expect(page.getByRole('button',{name:'Stop voice recording',exact:true})).toBeVisible();await page.waitForTimeout(350);await page.getByRole('button',{name:'Stop voice recording',exact:true}).click();await expect.poll(()=>sent).toBe(true);
 await session.changeOwner(MEDIA_B);release();await expect(page.getByRole('button',{name:'Describe quest by voice',exact:true})).toBeEnabled();await expect(page.getByTestId('pact-composer').locator('textarea')).toHaveValue('');await allTracksStopped(page);
});
test('guest login and same-owner session refresh preserve a draft without auto-publishing',async({page})=>{
 const session=await mediaFixture(page,{owner:null});await page.goto(BASE+'/app/create');const input=page.getByTestId('pact-composer').locator('textarea');await input.fill('Preserve my guest draft');
 await session.changeOwner(MEDIA_A);await expect(input).toHaveValue('Preserve my guest draft');await session.changeOwner(MEDIA_A);await expect(input).toHaveValue('Preserve my guest draft');expect(session.writes).toEqual([]);
 await session.changeOwner(null);await expect(input).toHaveValue('');
});
test('voice cancel while transcribing preserves typed text and discards the late response',async({page})=>{
 await mediaFixture(page);let sent=false,release=()=>{};const held=new Promise<void>(r=>{release=r;});await page.route('**/api/transcribe',async r=>{sent=true;await held;await r.fulfill({json:{transcript:'CANCELLED_VOICE'}});});
 await page.goto(BASE+'/app/create');const input=page.getByTestId('pact-composer').locator('textarea');await input.fill('Keep typed text');await input.blur();await page.getByRole('button',{name:'Describe quest by voice',exact:true}).click();await expect(page.getByRole('button',{name:'Stop voice recording',exact:true})).toBeVisible();await page.waitForTimeout(350);await page.getByRole('button',{name:'Stop voice recording',exact:true}).click();await expect.poll(()=>sent).toBe(true);
 await page.getByRole('button',{name:'Cancel voice recording',exact:true}).click();release();await expect(page.getByRole('button',{name:'Describe quest by voice',exact:true})).toBeEnabled();await expect(input).toHaveValue('Keep typed text');await allTracksStopped(page);
});

for(const width of [320,390])for(const lang of ['en','zh'])test(`pending voice controls fit ${width}px in ${lang}`,async({page},testInfo)=>{
 await mediaFixture(page,{hold:true});await page.setViewportSize({width,height:667});await page.goto(BASE+'/app/create');if(lang==='zh')await page.getByTestId('sum-lang-zh').click();
 await page.getByRole('button',{name:'Describe quest by voice',exact:true}).click();await expect(page.getByRole('button',{name:'Cancel voice recording',exact:true})).toBeVisible();
 const boxes=await page.locator('.quest-composer__actions').evaluate(el=>({doc:document.documentElement.scrollWidth,viewport:innerWidth,buttons:[...el.querySelectorAll('button')].map(button=>{const r=button.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,client:button.clientWidth,scroll:button.scrollWidth};})}));
 expect(boxes.doc).toBeLessThanOrEqual(width+1);for(const b of boxes.buttons){expect(b.left).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(width+1);expect(b.scroll).toBeLessThanOrEqual(b.client+1);}
 for(let i=0;i<boxes.buttons.length;i++)for(let j=i+1;j<boxes.buttons.length;j++){const a=boxes.buttons[i],b=boxes.buttons[j];expect(Math.min(a.right,b.right)-Math.max(a.left,b.left)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=1).toBe(true);}
 await page.screenshot({path:testInfo.outputPath(`synthetic-voice-${width}-${lang}.png`),fullPage:true});await expect.poll(()=>page.evaluate(()=>window.__sumMediaProbe.streams.length)).toBe(1);await page.getByRole('button',{name:'Cancel voice recording',exact:true}).click();await page.evaluate(()=>window.__sumMediaProbe.release());await allTracksStopped(page);
});

test('a delayed publication receipt from a previous account never appears as the new account result',async({page})=>{
 const session=await mediaFixture(page);let publishing=false,release=()=>{};const held=new Promise<void>(r=>{release=r;});
 const reply={userVisibleReply:'PRIVATE_OWNER_A_REVIEW',agentAction:'draft_ready',draftPatch:{},toolName:null,toolArgs:null,draftState:{title:'PRIVATE_OWNER_A_REVIEW',proposition:'First to three',participants:'you + 1 invited friend',stake:0,stakeType:'none',evidenceType:'text',judgeRule:'Count rallies',timeWindow:'24 hours',safetyNotes:[],readyToPublish:true}};
 await page.route('**/api/agent/respond',async r=>{if(r.request().postDataJSON().intent==='publish'){publishing=true;await held;await r.fulfill({json:{...reply,toolResult:{challengeId:'synthetic_private_published_a'}}});}else await r.fulfill({json:reply});});
 await page.goto(BASE+'/app/create');await page.getByTestId('pact-composer').locator('textarea').fill('A reviewed draft');await page.getByRole('button',{name:'Summon',exact:true}).click();await page.getByRole('button',{name:'Publish free quest',exact:true}).click();await expect.poll(()=>publishing).toBe(true);
 await session.changeOwner(MEDIA_B);const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/agent/respond');release();await response;await page.waitForTimeout(200);
 await expect(page.getByRole('link',{name:'Open Quest',exact:true})).toHaveCount(0);await expect(page.getByTestId('challenge-contract-result')).toHaveCount(0);await expect(page.getByTestId('pact-composer').locator('textarea')).toHaveValue('');
});
