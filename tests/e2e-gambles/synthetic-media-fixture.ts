import {expect,type Page} from '@playwright/test';
export const MEDIA_A='synthetic_media_owner_a',MEDIA_B='synthetic_media_owner_b';
export const MEDIA_QUEST='synthetic_media_quest_20261028';
export type MediaProbe={requests:number;hold:boolean;failStart:boolean;streams:MediaStream[];recorders:MediaRecorder[];release:()=>void};
declare global {interface Window{__sumMediaProbe:MediaProbe}}
/** The suites using this helper MUST launch Chromium with fake-device flags.
 * These are real browser MediaStreams/MediaRecorders, never physical devices.
 * Network identities/transcripts/Quest replies are explicit synthetic fixtures. */
export async function mediaFixture(page:Page,{hold=false,owner=MEDIA_A}:{hold?:boolean;owner?:string|null}={}){
 let currentOwner=owner;const writes:string[]=[];
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(({hold})=>{
  localStorage.setItem('sum-language','en');
  const native=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const waiting:Array<()=>void>=[];
  const probe:MediaProbe={requests:0,hold,failStart:false,streams:[],recorders:[],release:()=>{probe.hold=false;waiting.splice(0).forEach(fn=>fn());}};
  window.__sumMediaProbe=probe;
  navigator.mediaDevices.getUserMedia=async constraints=>{
   probe.requests++;const stream=await native(constraints);probe.streams.push(stream);
   if(probe.hold)await new Promise<void>(resolve=>waiting.push(resolve));
   return stream;
  };
  const Recorder=window.MediaRecorder;
  window.MediaRecorder=class extends Recorder{
   constructor(stream:MediaStream,options?:MediaRecorderOptions){super(stream,options);probe.recorders.push(this);}
   start(timeslice?:number){if(probe.failStart)throw new DOMException('Synthetic start failure','NotSupportedError');super.start(timeslice);}
  };
 },{hold});
 await page.route('**/api/auth/session',r=>r.fulfill({json:currentOwner?{user:{id:currentOwner,name:currentOwner,email:currentOwner+'@example.invalid'},expires:'2027-01-01T00:00:00Z'}:{}}));
 // Block unintended writes so the harness cannot submit real proofs or contact
 // paid transcription/agent endpoints. Individual tests install exact overrides.
 await page.route('**/api/**',async r=>{
  if(['GET','HEAD','OPTIONS'].includes(r.request().method()))return r.fallback();
  writes.push(new URL(r.request().url()).pathname);
  return r.fulfill({status:503,json:{error:'Unconfigured synthetic write blocked'}});
 });
 return {writes,changeOwner:async(value:string|null)=>{
  currentOwner=value;const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/session');
  await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'nextauth.message',newValue:JSON.stringify({event:'session',data:{trigger:'getSession'},timestamp:Date.now()})})));
  await response;
 }};
}
export async function proofFixture(page:Page,kind='video'){
 await page.route(`**/api/challenges/${MEDIA_QUEST}`,r=>r.fulfill({json:{challenge:{id:MEDIA_QUEST,title:'Synthetic media lifecycle Quest',creatorId:MEDIA_A,creator:{id:MEDIA_A,username:'Synthetic A'},status:'live',type:'General',visibility:'invite_only',isPublic:false,stake:0,evidenceType:kind,rules:'Synthetic device lifecycle verification only',proposition:'Capture agreed proof',arbiter:'ai',maxParticipants:2,createdAt:'2026-10-28T00:00:00Z',deadline:'2027-01-01T00:00:00Z',participants:[MEDIA_A,MEDIA_B].map(userId=>({userId,user:{id:userId,username:userId},status:'accepted',role:userId===MEDIA_A?'creator':'opponent'})),evidence:[],judgments:[],_count:{evidence:0,judgments:0}}}}));
}
export async function allTracksStopped(page:Page){
 await expect.poll(()=>page.evaluate(()=>window.__sumMediaProbe.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
}
export async function doubleClick(page:Page,selector:string){await page.locator(selector).evaluate(el=>{el.dispatchEvent(new MouseEvent('click',{bubbles:true}));el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});}
export async function leaveAppPage(page:Page){await page.getByTestId('ios-tabbar').getByRole('link',{name:'Discover',exact:true}).click();await expect(page).toHaveURL(/\/app\/discover/);}
