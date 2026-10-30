import {test,expect,type Page} from '@playwright/test';
const BASE=process.env.TEST_BASE_URL??'http://localhost:3000';
const A='synthetic_history_account_a',B='synthetic_history_account_b';
test.use({viewport:{width:390,height:844},video:'off'});
test.setTimeout(60000);
const make=(index:number,owner=A)=>{
  return {id:'synthetic_history_'+index,title:'Synthetic Quest '+index,
    creatorId:owner,creator:{id:owner,username:owner},status:index<35?'open':'settled',
    type:'General',description:'Synthetic fixture; never a real player',rules:'Synthetic',proposition:'Sample',
    visibility:'invite_only',isPublic:false,stake:0,maxParticipants:2,evidenceType:'text',arbiter:'ai',
    createdAt:new Date(Date.now()-index*3600_000).toISOString(),deadline:null,
    participants:[{userId:owner,user:{id:owner,username:owner},role:'creator',status:'accepted'}],
    _count:{evidence:index<26?1:0,judgments:0},evidence:[],judgments:[]};
};
async function setup(page:Page,count=75){
  let owner=A;let rows=Array.from({length:count},(_,i)=>make(i,A));
  const offsets:number[]=[];
  await page.addInitScript(()=>{localStorage.setItem('sum-language','en');localStorage.setItem('sum-ios-onboarding-complete','true');});
  await page.route('**/api/auth/session',r=>r.fulfill({json:{user:{id:owner,name:owner,email:owner+'@example.invalid'},expires:'2027-01-01T00:00:00Z'}}));
  await page.route('**/api/challenges?*',r=>{
    const url=new URL(r.request().url());const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||20);
    if(url.searchParams.get('mine')!=='true')return r.fulfill({json:{challenges:[],total:0}});
    offsets.push(offset);return r.fulfill({json:{challenges:rows.slice(offset,offset+limit),total:rows.length}});
  });
  return {offsets,owner:()=>owner,change:async(next:string,newRows:ReturnType<typeof make>[])=>{
    owner=next;rows=newRows;
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/session');
    await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'nextauth.message',newValue:JSON.stringify({event:'session',data:{trigger:'getSession'},timestamp:Date.now()})})));
    await response;
  }};
}
test('73 Quest records produce 73 total and complete status breakdown rather than a silent first-50 result',async({page})=>{
 const m=await setup(page,73);await page.goto(BASE+'/app/stats');
 const metrics=page.locator('.ios-metrics--large strong');await expect(metrics.first()).toHaveText('73');
 await expect(metrics.nth(1)).toHaveText('38');await expect(metrics.nth(2)).toHaveText('35');
 expect(m.offsets).toEqual([0,50]);await expect(page.getByTestId('quest-history-coverage')).not.toBeVisible();
});
test('a bounded 270-record history never mislabels loaded counts as account-wide totals',async({page})=>{
 const m=await setup(page,270);await page.goto(BASE+'/app/stats');
 const metrics=page.locator('.ios-metrics--large strong');
 await expect(metrics.first()).toHaveText('270');
 await expect(page.getByTestId('quest-history-coverage')).toContainText('250 of 270');
 await expect(metrics.nth(1)).toContainText('≥');
 expect(m.offsets).toEqual([0,50,100,150,200]);
});
test('the same account can show a verified milestone from more than fifty distinct records',async({page})=>{
 await setup(page,80);await page.route('**/api/summons/me',r=>r.fulfill({status:503,json:{error:'Synthetic unavailable'}}));
 await page.goto(BASE+'/app/picos');
 const area=page.getByRole('region',{name:'Your Quest Milestone Level'});
 await expect(area).toContainText('Level 5');
 await expect(area).not.toContainText('limited to 50 records');
});
test('personal evidence gallery never misattributes an accepted opponent’s evidence to the current account',async({page})=>{
 await setup(page,1);
 await page.route('**/api/challenges/synthetic_history_0',r=>r.fulfill({json:{challenge:{...make(0),evidence:[
 {id:'synthetic_b_proof',type:'text',url:null,description:'PRIVATE_OPPONENT_ONLY_NOT_MINE',createdAt:'2026-10-30T10:00:00Z',userId:B},
 {id:'synthetic_a_proof',type:'text',url:null,description:'OWN_PROOF_A_ONLY',createdAt:'2026-10-30T11:00:00Z',userId:A}
 ]}}}));
 await page.goto(BASE+'/app/evidence');
 await expect(page.getByText('OWN_PROOF_A_ONLY',{exact:false})).toBeVisible();
 await expect(page.getByText('PRIVATE_OPPONENT_ONLY_NOT_MINE',{exact:false})).toHaveCount(0);
});
test('older authorized evidence is reachable through explicit Load more instead of being silently capped at twenty quests',async({page})=>{
 await setup(page,26);
 await page.route('**/api/challenges/synthetic_history_*',r=>{
  const id=r.request().url().split('/').pop()||'';const index=Number(id.replace('synthetic_history_',''));
  const owner=index===22?A:B;
  return r.fulfill({json:{challenge:{...make(index),evidence:[{id:'proof_'+index,type:'text',url:null,userId:owner,description:owner===A?'OLDER_OWN_PROOF_ACCESSIBLE':'Opponent row',createdAt:'2026-10-30T10:00:00Z'}]}}});
 });
 await page.goto(BASE+'/app/evidence');await expect(page.getByRole('button',{name:'Load more proof',exact:true})).toBeVisible();
 await expect(page.getByText('OLDER_OWN_PROOF_ACCESSIBLE',{exact:false})).toHaveCount(0);
 await page.getByRole('button',{name:'Load more proof',exact:true}).click();
 await expect(page.getByText('OLDER_OWN_PROOF_ACCESSIBLE',{exact:false})).toBeVisible();
 await expect(page.getByTestId('evidence-gallery-coverage')).toContainText('26 of 26');
});
test('a failed detail read cannot be silently misrepresented as a complete empty evidence gallery',async({page})=>{
 await setup(page,2);
 await page.route('**/api/challenges/synthetic_history_*',r=>{
  if(r.request().url().endsWith('_1'))return r.fulfill({status:503,json:{error:'Synthetic blocked detail'}});
  return r.fulfill({json:{challenge:{...make(0),evidence:[{id:'proof_success',userId:A,type:'text',url:null,description:'A_VALID_PROOF',createdAt:'2026-10-30T10:00:00Z'}]}}});
 });
 await page.goto(BASE+'/app/evidence');await expect(page.getByText('A_VALID_PROOF',{exact:false})).toBeVisible();
 await expect(page.getByRole('alert')).toContainText('could not be loaded');
 await expect(page.getByRole('button',{name:'Retry evidence',exact:true})).toBeVisible();
});
test('pagination reads from the prior signed-in account never become the next account’s history',async({page})=>{
 const m=await setup(page,73);let resolve=()=>{},secondStarted=false;const held=new Promise<void>(r=>{resolve=r});
 await page.route('**/api/challenges?*',async route=>{
  const url=new URL(route.request().url());if(url.searchParams.get('mine')!=='true')return route.fulfill({json:{challenges:[],total:0}});
  if(url.searchParams.get('offset')==='50'&&m.owner()===A){secondStarted=true;await held;return route.fulfill({json:{challenges:Array.from({length:23},(_,i)=>make(i+50)),total:73}});}
  const ownerA=m.owner()===A;
  return route.fulfill({json:{challenges:ownerA?Array.from({length:50},(_,i)=>make(i)):[],total:ownerA?73:0}});
 });
 await page.goto(BASE+'/app/stats');await expect.poll(()=>secondStarted).toBe(true);
 await m.change(B,[]);resolve();await expect(page.locator('.ios-metrics--large strong').first()).toHaveText('0');
 await expect(page.getByText('73',{exact:true})).toHaveCount(0);
});
