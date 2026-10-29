import {expect,test,type Page} from '@playwright/test';
const BASE=process.env.TEST_BASE_URL??'http://localhost:3000';
const ID='synthetic_invitation_recovery_20261028',A='synthetic_owner_a',B='synthetic_owner_b';
test.use({viewport:{width:390,height:844},video:'off'});test.setTimeout(45000);
const quest={id:ID,title:'Synthetic invitation — original rules',description:'Controlled transport only',creatorId:A,creator:{id:A,username:'A'},status:'open',type:'General',visibility:'invite_only',isPublic:false,stake:0,evidenceType:'text',rules:'Keep original agreed rules',proposition:'Compare notes',arbiter:'ai',maxParticipants:2,deadline:null,createdAt:'2026-10-28T00:00:00Z',participants:[{userId:A,user:{id:A,username:'A'},role:'creator',status:'accepted'}],evidence:[],judgments:[],_count:{evidence:0,judgments:0}};
async function setup(page:Page,kind:'quest'|'quiz'='quest',native:'missing'|'pending'|'reject'|'cancel'|'success'='missing',clipboard:'reject'|'success'='reject'){
 let owner=A;await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(({native,clipboard})=>{localStorage.setItem('sum-language','en');const state={shares:0,copies:[] as string[],resolve:()=>{}};(window as unknown as {shareProbe:typeof state}).shareProbe=state;
 Object.defineProperty(navigator,'share',{configurable:true,value:native==='missing'?undefined:()=>{state.shares++;if(native==='pending')return new Promise<void>(r=>state.resolve=r);if(native==='reject')return Promise.reject(new DOMException('Synthetic unavailable share','NotAllowedError'));if(native==='cancel')return Promise.reject(new DOMException('Synthetic cancellation','AbortError'));return Promise.resolve();}});
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:(value:string)=>{state.copies.push(value);return clipboard==='success'?Promise.resolve():Promise.reject(new DOMException('Synthetic blocked clipboard','NotAllowedError'));}}});
 },{native,clipboard});
 await page.route('**/api/auth/session',r=>r.fulfill({json:{user:{id:owner,name:owner,username:owner,email:owner+'@example.invalid'},expires:'2027-01-01T00:00:00Z'}}));
 await page.route(`**/api/challenges/${ID}`,r=>r.fulfill({json:{challenge:quest}}));
 await page.route('**/api/ai/runtime',r=>r.fulfill({json:{capabilities:{quiz:{enabled:true},text:{configured:false},speech:{configured:false},quizGrading:{externalAiCalls:0},subscriptionSharing:{availableInThisApp:false}}}}));
 await page.route(`**/api/quiz/${ID}`,r=>r.fulfill({json:{quiz:{id:ID,title:'Synthetic Quiz',topic:'general',bankVersion:'synthetic',status:'open',challengeStatus:'open',stakeCredits:0,stakesEnabled:false,creatorUsername:'A',opponentUsername:null,isCreator:true,playerUserId:owner,accepted:true,canJoin:false,expiresAt:null,answerCommitment:'syntheticcommitment',resolutionHash:null,questions:null,ownSubmitted:false,opponentSubmitted:false,result:null,receiptVersion:'synthetic'}}}));
 await page.goto(BASE+`/app/${kind==='quest'?'quest':'quiz'}?id=${ID}`);
 const trigger=kind==='quiz'?page.getByTestId('quiz-share-invite'):page.getByRole('button',{name:'Share invitation',exact:true});await expect(trigger).toBeVisible();
 return {trigger,changeOwner:async()=>{owner=B;const reply=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/session');await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'nextauth.message',newValue:JSON.stringify({event:'session',data:{trigger:'getSession'},timestamp:Date.now()})})));await reply;}};
}
for(const kind of ['quest','quiz'] as const)test(`${kind}: blocked sharing leaves an accessible manual invitation instead of a silent dead end`,async({page})=>{
 const {trigger}=await setup(page,kind);await trigger.click();const dialog=page.getByRole('dialog',{name:'Invitation link',exact:true});await expect(dialog).toBeVisible();const field=dialog.getByRole('textbox',{name:'Invitation URL',exact:true});await expect(field).toHaveValue(BASE+`/app/${kind==='quest'?'join':'quiz'}?id=${ID}`);await expect(field).toBeFocused();
 await expect(dialog).toContainText('Copy this link manually');await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
});
test('a failed native share falls back, while a cancelled share does not silently copy',async({page})=>{
 const {trigger}=await setup(page,'quest','reject','success');await trigger.click();await expect(page.getByTestId('invitation-share-status')).toHaveText('Invitation link copied.');expect(await page.evaluate(()=>(window as unknown as {shareProbe:{shares:number;copies:string[]}}).shareProbe.copies.length)).toBe(1);
});
test('cancel from native share remains quiet and does not claim success',async({page})=>{
 const {trigger}=await setup(page,'quest','cancel','success');await trigger.click();await expect(trigger).toBeEnabled();await expect(page.getByRole('dialog',{name:'Invitation link',exact:true})).not.toBeVisible();await expect(page.getByTestId('invitation-share-status')).toHaveText('');expect(await page.evaluate(()=>(window as unknown as {shareProbe:{copies:string[]}}).shareProbe.copies.length)).toBe(0);
});
test('same-tick share clicks have one owner until the native request finishes',async({page})=>{
 const {trigger}=await setup(page,'quest','pending');await trigger.evaluate(el=>{el.dispatchEvent(new MouseEvent('click',{bubbles:true}));el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});await expect.poll(()=>page.evaluate(()=>(window as unknown as {shareProbe:{shares:number}}).shareProbe.shares)).toBe(1);await expect(trigger).toBeDisabled();await page.evaluate(()=>(window as unknown as {shareProbe:{resolve:()=>void}}).shareProbe.resolve());await expect(trigger).toBeEnabled();await expect(page.getByTestId('invitation-share-status')).toHaveText('Handed to system sharing.');
});
test('a late share result does not label a different signed-in account as successful',async({page})=>{
 const {trigger,changeOwner}=await setup(page,'quest','pending');await trigger.click();await changeOwner();await expect(page.getByRole('button',{name:'Share invitation',exact:true})).toBeEnabled();await page.evaluate(()=>(window as unknown as {shareProbe:{resolve:()=>void}}).shareProbe.resolve());await expect(page.getByTestId('invitation-share-status')).toHaveText('');
});
for(const width of [320,390])test(`manual invitation stays usable at ${width}px and when language switches`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:844});await setup(page);await page.getByTestId('sum-lang-zh').click();await page.getByRole('button',{name:'分享邀请',exact:true}).click();const dialog=page.getByRole('dialog',{name:'邀请链接',exact:true});await expect(dialog).toBeVisible();await expect(dialog.getByRole('textbox',{name:'邀请网址',exact:true})).toHaveValue(BASE+'/app/join?id='+ID);
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1&&el.getBoundingClientRect().right<=innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath(`invite-fallback-${width}-zh.png`)});await dialog.getByRole('button',{name:'关闭',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(page.getByRole('button',{name:'分享邀请',exact:true})).toBeVisible();
});

test('an ambiguous native abort always leaves an explicit manual-copy exit',async({page})=>{
 const {trigger}=await setup(page,'quest','cancel','reject');await trigger.click();await expect(trigger).toBeEnabled();const copy=page.getByRole('button',{name:'Copy invitation link',exact:true});await expect(copy).toBeVisible();await copy.click();const dialog=page.getByRole('dialog',{name:'Invitation link',exact:true});await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(copy).toBeFocused();
});
test('explicit copying bypasses the native sheet and does not claim recipient delivery',async({page})=>{
 await setup(page,'quest','pending','success');await page.getByRole('button',{name:'Copy invitation link',exact:true}).click();await expect(page.getByTestId('invitation-share-status')).toHaveText('Invitation link copied.');expect(await page.evaluate(()=>(window as unknown as {shareProbe:{shares:number}}).shareProbe.shares)).toBe(0);
});
