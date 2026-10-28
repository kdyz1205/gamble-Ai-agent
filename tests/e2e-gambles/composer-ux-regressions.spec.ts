import { expect, test, type Page } from '@playwright/test';
const BASE=process.env.TEST_BASE_URL??'http://localhost:3000';
test.use({viewport:{width:390,height:844},video:'off'});
test.setTimeout(45000);
const reply={userVisibleReply:'The reviewed rule is first to three rallies.',agentAction:'draft_ready',draftPatch:{},toolName:null,toolArgs:null,
  draftState:{title:'Reviewed badminton game',proposition:'First to three rallies',participants:'you + 1 invited friend',stake:0,stakeType:'none',evidenceType:'text',judgeRule:'Count verified rallies',timeWindow:'24 hours',safetyNotes:[],readyToPublish:true}};
async function prepare(page:Page){
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>localStorage.setItem('sum-language','en'));
  // This suite exercises actual deployed components with explicit, synthetic
  // transport fixtures. It never sends a business mutation to production.
  await page.route('**/api/agent/respond',r=>r.fulfill({json:reply}));
  await page.route('**/api/auth/session',r=>r.fulfill({json:{}}));
}
async function ideas(page:Page){
  const details=page.getByTestId('composer-starter-ideas');
  if(await details.count() && (await details.getAttribute('open'))===null)await details.locator('summary').click();
}
for(const width of [320,390])test(`the first draft action is unobscured at ${width}px`,async({page})=>{
  await prepare(page);await page.setViewportSize({width,height:width===320?667:844});
  await page.goto(BASE+'/app/create');
  const input=page.locator('[data-testid="pact-composer"] textarea');
  await input.fill('A real draft that has not been sent');
  await input.blur();await page.evaluate(()=>scrollTo(0,0));
  const action=page.getByRole('button',{name:'Summon',exact:true});
  await expect(action).toBeEnabled();
  const layout=await action.evaluate(el=>{const r=el.getBoundingClientRect();const dock=document.querySelector('[data-testid="ios-tabbar"]')!.getBoundingClientRect();
    return {top:r.top,bottom:r.bottom,dockTop:dock.top,viewport:innerHeight,hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),overflow:document.documentElement.scrollWidth-innerWidth};});
  expect(layout.overflow).toBeLessThanOrEqual(1);expect(layout.top).toBeGreaterThan(0);
  expect(layout.bottom).toBeLessThan(layout.dockTop);expect(layout.hit).toBe(true);
});
test('starter categories never silently discard typed input or chosen terms',async({page})=>{
  await prepare(page);await page.goto(BASE+'/app/create');
  const input=page.locator('[data-testid="pact-composer"] textarea');
  await input.fill('KEEP THIS personal rule 123');
  await page.locator('.quest-terms summary').click();
  await page.locator('input[type="number"]').fill('17');
  await page.locator('.quest-terms summary').click();
  await ideas(page);await page.getByRole('button',{name:'Grow',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Replace the current message?'});
  await expect(dialog).toBeVisible();await expect(input).toHaveValue('KEEP THIS personal rule 123');
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  await expect(input).toHaveValue('KEEP THIS personal rule 123');
  await page.getByRole('button',{name:'Grow',exact:true}).click();
  await dialog.getByRole('button',{name:'Replace message',exact:true}).click();
  await expect(input).toHaveValue(/walk for 20 minutes/);
  await page.locator('.quest-terms summary').click();
  await expect(page.locator('input[type="number"]')).toHaveValue('17');
});
test('category suggestions preserve the reviewed conversation and cannot publish unreviewed edits',async({page})=>{
  await prepare(page);await page.goto(BASE+'/app/create');
  const input=page.locator('[data-testid="pact-composer"] textarea');
  await input.fill('Badminton first to three');await page.getByRole('button',{name:'Summon',exact:true}).click();
  const publish=page.getByRole('button',{name:'Publish free quest',exact:true});
  await expect(publish).toBeEnabled();
  await ideas(page);await page.getByRole('button',{name:'Grow',exact:true}).click();
  await expect(page.getByRole('log')).toContainText(reply.userVisibleReply);
  await expect(page.getByTestId('challenge-contract-result')).toContainText('Reviewed badminton game');
  await expect(input).toHaveValue(/walk for 20 minutes/);
  await expect(publish).toBeDisabled();
  await expect(page.getByTestId('composer-pending-edit')).toBeVisible();
  await input.fill('');await expect(publish).toBeEnabled();
});
test('repeated submit events produce one draft request and suggestions stay disabled until it returns',async({page})=>{
  await prepare(page);let calls=0;let release=()=>{};const held=new Promise<void>(r=>{release=r});
  await page.route('**/api/agent/respond',async route=>{calls++;await held;await route.fulfill({json:reply});});
  await page.goto(BASE+'/app/create');await ideas(page);
  await page.locator('[data-testid="pact-composer"] textarea').fill('Do not duplicate this request');
  await page.locator('[data-testid="pact-composer"] form').evaluate(form=>{
    form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  });
  await expect.poll(()=>calls).toBe(1);
  await expect(page.getByRole('button',{name:'Grow',exact:true})).toBeDisabled();
  release();await expect(page.getByRole('log')).toContainText(reply.userVisibleReply);
  expect(calls).toBe(1);
});
test('failed draft request preserves text and can be retried without losing the reviewed rules',async({page})=>{
  await prepare(page);let fail=true;
  await page.route('**/api/agent/respond',r=>fail?r.fulfill({status:503,json:{error:'Synthetic recoverable draft outage'}}):r.fulfill({json:reply}));
  await page.goto(BASE+'/app/create');const input=page.locator('[data-testid="pact-composer"] textarea');
  await input.fill('Preserve this retry draft');await page.getByRole('button',{name:'Summon',exact:true}).click();
  await expect(page.getByTestId('pact-composer').getByRole('alert')).toContainText('Synthetic recoverable draft outage');
  await expect(input).toHaveValue('Preserve this retry draft');
  fail=false;await page.getByRole('button',{name:'Summon',exact:true}).click();
  await expect(page.getByRole('log')).toContainText(reply.userVisibleReply);
});
test('editing on a short mobile viewport keeps the draft action reachable and restores navigation on blur',async({page})=>{
  await prepare(page);await page.goto(BASE+'/app/create');
  await page.setViewportSize({width:390,height:460});
  const input=page.locator('[data-testid="pact-composer"] textarea');await input.fill('Keyboard-sized viewport');
  await expect(page.getByTestId('ios-tabbar')).not.toBeVisible();
  const action=page.getByRole('button',{name:'Summon',exact:true});await action.scrollIntoViewIfNeeded();
  expect(await action.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  await input.blur();await expect(page.getByTestId('ios-tabbar')).toBeVisible();
});
test('Chinese replacement confirmation preserves typed text and operates without business writes',async({page})=>{
  await prepare(page);let writes=0;page.on('request',r=>{if(r.method()==='POST')writes++;});
  await page.goto(BASE+'/app/create');await page.getByTestId('sum-lang-zh').click();
  const input=page.locator('[data-testid="pact-composer"] textarea');await input.fill('保留双方商定的原始文字');
  await ideas(page);await page.getByRole('button',{name:'成长',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'替换当前输入？'});await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'保留我的输入',exact:true}).click();
  await expect(input).toHaveValue('保留双方商定的原始文字');expect(writes).toBe(0);
});
