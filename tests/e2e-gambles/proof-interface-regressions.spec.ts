import {expect,test,type Page} from '@playwright/test';
const BASE=process.env.TEST_BASE_URL??'http://127.0.0.1:3000',ID='proof_interface_fixture_20261028',USER='proof_interface_owner';
test.use({viewport:{width:390,height:844},video:'off'});test.setTimeout(45000);
async function setup(page:Page,policy='photo'){
 await page.addInitScript(()=>localStorage.setItem('sum-language','en'));await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/auth/session',r=>r.fulfill({json:{user:{id:USER,name:'Synthetic owner'},expires:'2027-01-01T00:00:00Z'}}));
 await page.route('**/api/challenges/'+ID,r=>r.fulfill({json:{challenge:{id:ID,title:'My agreed proof title — 原文保留',description:'Original player rules remain unchanged.',type:'Sports',status:'live',creatorId:USER,creator:{id:USER,username:'Host'},visibility:'invite_only',isPublic:false,stake:0,evidenceType:policy,proposition:'Original rules',rules:'Original rules',arbiter:'ai',maxParticipants:2,deadline:'2027-01-01T12:00:00Z',createdAt:'2026-10-28T00:00:00Z',participants:[{userId:USER,user:{id:USER,username:'Host'},status:'accepted',role:'creator'}],evidence:[],judgments:[],_count:{evidence:0,judgments:0}}}}));
}
test('proof has persistent accessible labels rather than placeholder-only instructions',async({page})=>{
 await setup(page);await page.goto(BASE+'/app/evidence-add?id='+ID);await expect(page.getByRole('textbox',{name:'Evidence description',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Or paste a public HTTPS link',exact:true}).click();await expect(page.getByRole('textbox',{name:'Public evidence link',exact:true})).toBeVisible();await expect(page.getByTestId('proof-requirements')).toContainText('80 MB');
});
test('switching proof interface language preserves original description and link',async({page})=>{
 await setup(page);await page.goto(BASE+'/app/evidence-add?id='+ID);await page.locator('.proof-camp textarea').fill('My own claim 原始证据描述');await page.getByRole('button',{name:'Or paste a public HTTPS link',exact:true}).click();await page.locator('.proof-camp input[type="url"]').fill('https://example.invalid/my-evidence.png');await page.getByTestId('sum-lang-zh').click();
 await expect(page.getByRole('textbox',{name:'证据说明',exact:true})).toHaveValue('My own claim 原始证据描述');await expect(page.getByRole('textbox',{name:'公开证据链接',exact:true})).toHaveValue('https://example.invalid/my-evidence.png');await expect(page.getByRole('button',{name:'提交证据',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'My agreed proof title — 原文保留',exact:true})).toBeVisible();
 await page.getByTestId('sum-lang-en').click();await expect(page.getByRole('textbox',{name:'Evidence description',exact:true})).toHaveValue('My own claim 原始证据描述');
});
for(const width of [320,390,1440])test(`proof header, labels and actions do not overlap at ${width}px`,async({page},info)=>{
 await setup(page);await page.setViewportSize({width,height:844});await page.goto(BASE+'/app/evidence-add?id='+ID);await expect(page.locator('.proof-camp')).toBeVisible();await page.getByTestId('sum-lang-zh').click();await page.evaluate(()=>document.fonts.ready);
 const layout=await page.locator('.proof-camp').evaluate(el=>{const header=el.querySelector('.proof-camp__header')!;const icon=header.firstElementChild!.getBoundingClientRect(),text=header.lastElementChild!.getBoundingClientRect();return {viewport:innerWidth,scroll:document.documentElement.scrollWidth,icon:{left:icon.left,right:icon.right},text:{left:text.left,right:text.right},controls:[...el.querySelectorAll('button,input,textarea')].filter(x=>x.getBoundingClientRect().height).map(x=>{const b=x.getBoundingClientRect();return {left:b.left,right:b.right,client:x.clientWidth,scroll:x.scrollWidth};})};});
 expect(layout.scroll).toBeLessThanOrEqual(width+1);expect(layout.icon.right).toBeLessThanOrEqual(layout.text.left+1);for(const b of layout.controls){expect(b.left).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(width+1);expect(b.scroll).toBeLessThanOrEqual(b.client+1);}
 await page.screenshot({path:info.outputPath(`proof-zh-${width}.png`),fullPage:true});
});
test('Chinese validation is actionable and does not erase the failed input',async({page})=>{
 await setup(page);await page.goto(BASE+'/app/evidence-add?id='+ID);await page.getByRole('button',{name:'Or paste a public HTTPS link',exact:true}).click();await page.locator('.proof-camp input[type="url"]').fill('not-a-link');await page.getByTestId('sum-lang-zh').click();await page.getByRole('button',{name:'提交证据',exact:true}).click();
 await expect(page.locator('.proof-camp').getByRole('alert')).toContainText('有效的公开 HTTPS');await expect(page.getByRole('textbox',{name:'公开证据链接',exact:true})).toHaveValue('not-a-link');
});
test('a selected photo and authored caption survive language changes and pending error recovery',async({page})=>{
 await setup(page);await page.route('**/api/challenges/'+ID+'/evidence/blob-handle',r=>r.fulfill({status:503,json:{error:'Synthetic upload unavailable'}}));await page.route('**/api/uploads/evidence-presign',r=>r.fulfill({status:503,json:{error:'SYNTHETIC_UPLOAD_NOT_CONFIGURED'}}));
 await page.goto(BASE+'/app/evidence-add?id='+ID);const picker=page.waitForEvent('filechooser');await page.getByRole('button',{name:/^Upload photo/}).click();await(await picker).setFiles({name:'original-proof.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});await page.locator('.proof-camp textarea').fill('Do not translate my content');await page.getByTestId('sum-lang-zh').click();await expect(page.getByText(/original-proof.png/)).toBeVisible();await page.getByRole('button',{name:'提交证据',exact:true}).click();await expect(page.locator('.proof-camp').getByRole('alert')).toContainText('SYNTHETIC_UPLOAD_NOT_CONFIGURED');await expect(page.locator('.proof-camp textarea')).toHaveValue('Do not translate my content');await expect(page.getByText(/original-proof.png/)).toBeVisible();
});

test('optional review guidance stays collapsed and does not reset entered evidence',async({page})=>{
 await setup(page);await page.goto(BASE+'/app/evidence-add?id='+ID);const help=page.getByTestId('proof-review-help');await expect(help).not.toHaveAttribute('open','');const note=page.getByRole('textbox',{name:'Evidence description',exact:true});await note.fill('Original proof text');await note.blur();await help.locator('summary').click();await expect(help).toHaveAttribute('open','');await expect(note).toHaveValue('Original proof text');await help.locator('summary').click();await expect(note).toHaveValue('Original proof text');
});
test('night proof fields stay readable and focused mobile input is not covered by navigation',async({page})=>{
 await setup(page);await page.addInitScript(()=>localStorage.setItem('sum-ios-appearance','night'));await page.goto(BASE+'/app/evidence-add?id='+ID);await expect(page.getByTestId('ios-full-app')).toHaveClass(/ios-app--night/);
 const note=page.getByRole('textbox',{name:'Evidence description',exact:true});const contrast=await note.evaluate(el=>{const s=getComputedStyle(el);const rgb=(s:string)=>s.match(/[\d.]+/g)!.slice(0,3).map(Number);const l=(s:string)=>{const v=rgb(s).map(c=>{c/=255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;});return .2126*v[0]+.7152*v[1]+.0722*v[2];};const a=l(s.color),b=l(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});expect(contrast).toBeGreaterThanOrEqual(4.5);
 await page.setViewportSize({width:390,height:460});await note.fill('Keyboard-sized viewport');await expect(page.getByTestId('ios-tabbar')).not.toBeVisible();await note.blur();await expect(page.getByTestId('ios-tabbar')).toBeVisible();
});
