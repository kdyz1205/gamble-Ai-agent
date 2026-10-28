import {expect,test} from '@playwright/test';
import {allTracksStopped,leaveAppPage,mediaFixture,proofFixture,MEDIA_QUEST} from './synthetic-media-fixture';
const BASE=process.env.TEST_BASE_URL??'http://localhost:3000';
test.use({viewport:{width:390,height:844},video:'off',permissions:['camera','microphone'],launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}});
test.setTimeout(45000);
test('recording cancel discards data and never produces a saved preview',async({page})=>{
 const session=await mediaFixture(page);await proofFixture(page);await page.goto(BASE+'/app/evidence-add?id='+MEDIA_QUEST);
 await page.getByRole('button',{name:/^Record video/}).click();await page.getByRole('button',{name:/Start recording/}).click();await page.waitForTimeout(350);await page.getByRole('button',{name:'Cancel',exact:true}).click();await allTracksStopped(page);
 await expect(page.getByRole('button',{name:/^Record video/})).toBeVisible();await page.waitForTimeout(250);await expect(page.getByRole('button',{name:'Re-record',exact:true})).toHaveCount(0);await expect(page.locator('.proof-camp video[controls]')).toHaveCount(0);expect(session.writes).toEqual([]);
});
test('camera permission requests are single-owner and can be cancelled before resolving',async({page})=>{
 await mediaFixture(page,{hold:true});await proofFixture(page);await page.goto(BASE+'/app/evidence-add?id='+MEDIA_QUEST);
 await page.getByRole('button',{name:/^Record video/}).evaluate(el=>{el.dispatchEvent(new MouseEvent('click',{bubbles:true}));el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
 await expect.poll(()=>page.evaluate(()=>window.__sumMediaProbe.requests)).toBe(1);await expect.poll(()=>page.evaluate(()=>window.__sumMediaProbe.streams.length)).toBe(1);
 await page.getByRole('button',{name:'Cancel media capture',exact:true}).click();await page.evaluate(()=>window.__sumMediaProbe.release());await allTracksStopped(page);await expect(page.locator('.proof-camp video')).toHaveCount(0);await expect(page.getByRole('button',{name:/^Record video/})).toBeVisible();
});
test('recording start failure releases camera and microphone before showing retry',async({page})=>{
 await mediaFixture(page);await proofFixture(page);await page.goto(BASE+'/app/evidence-add?id='+MEDIA_QUEST);await page.getByRole('button',{name:/^Record video/}).click();await page.evaluate(()=>{window.__sumMediaProbe.failStart=true;});
 await page.getByRole('button',{name:/Start recording/}).click();await expect(page.locator('.proof-camp').getByRole('alert')).toContainText('Synthetic start failure');await allTracksStopped(page);await expect(page.getByRole('button',{name:/^Record video/})).toBeVisible();
});
test('normal stop saves one playable browser recording and repeated stop does not throw',async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const session=await mediaFixture(page);await proofFixture(page);await page.goto(BASE+'/app/evidence-add?id='+MEDIA_QUEST);await page.getByRole('button',{name:/^Record video/}).click();await page.getByRole('button',{name:/Start recording/}).click();await page.waitForTimeout(500);
 await page.getByRole('button',{name:/Stop & save/}).evaluate(el=>{el.dispatchEvent(new MouseEvent('click',{bubbles:true}));el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});await expect(page.getByRole('button',{name:'Re-record',exact:true})).toBeVisible();await allTracksStopped(page);
 await expect.poll(()=>page.locator('.proof-camp video[controls]').evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(1);
 const player=page.locator('.proof-camp video[controls]');await player.evaluate(async(v:HTMLVideoElement)=>{v.muted=true;await v.play();});await expect.poll(()=>player.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(0);
 await page.screenshot({path:testInfo.outputPath('synthetic-video-stop-save.png'),fullPage:true});expect(errors).toEqual([]);expect(session.writes).toEqual([]);
});
test('typing a proof description first does not hide the file and camera choices',async({page})=>{
 await mediaFixture(page);await proofFixture(page,'photo');await page.goto(BASE+'/app/evidence-add?id='+MEDIA_QUEST);await page.locator('.proof-camp textarea').fill('A description before choosing the proof');
 await expect(page.getByRole('button',{name:/^Upload photo/})).toBeVisible();await expect(page.getByRole('button',{name:/^Take photo/})).toBeVisible();await expect(page.getByRole('button',{name:'Or paste a public HTTPS link',exact:true})).toBeVisible();
});
test('photo capture releases its stream if navigation occurs before detached video play resolves',async({page})=>{
 await mediaFixture(page);await proofFixture(page,'photo');await page.goto(BASE+'/app/evidence-add?id='+MEDIA_QUEST);
 await page.evaluate(()=>{const original=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){return this.isConnected?original.call(this):new Promise<void>(()=>{});};});
 await page.getByRole('button',{name:/^Take photo/}).click();await expect.poll(()=>page.evaluate(()=>window.__sumMediaProbe.streams.length)).toBe(1);await leaveAppPage(page);await allTracksStopped(page);
});
test('a late photo permission grant cannot restore capture after cancellation',async({page})=>{
 const session=await mediaFixture(page,{hold:true});await proofFixture(page,'photo');await page.goto(BASE+'/app/evidence-add?id='+MEDIA_QUEST);await page.getByRole('button',{name:/^Take photo/}).click();await expect.poll(()=>page.evaluate(()=>window.__sumMediaProbe.streams.length)).toBe(1);
 await page.getByRole('button',{name:'Cancel media capture',exact:true}).click();await page.evaluate(()=>window.__sumMediaProbe.release());await allTracksStopped(page);await expect(page.locator('.proof-camp img[alt="proof preview"]')).toHaveCount(0);expect(session.writes).toEqual([]);
});

test('normal photo capture creates a decodable preview and releases the generated device',async({page},testInfo)=>{
 const session=await mediaFixture(page);await proofFixture(page,'photo');await page.goto(BASE+'/app/evidence-add?id='+MEDIA_QUEST);await page.getByRole('button',{name:/^Take photo/}).click();
 const image=page.locator('.proof-camp img[alt="proof preview"]');await expect(image).toBeVisible();await expect.poll(()=>image.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);await allTracksStopped(page);expect(session.writes).toEqual([]);
 await page.screenshot({path:testInfo.outputPath('synthetic-photo-preview.png'),fullPage:true});await page.getByRole('button',{name:'Remove',exact:true}).click();await expect(image).toHaveCount(0);await expect(page.getByRole('button',{name:/^Take photo/})).toBeVisible();
});


test('switching from a URL to an actual file does not validate the superseded URL',async({page})=>{
 await mediaFixture(page);await proofFixture(page,'photo');let blobCalls=0,presignCalls=0;
 await page.route(`**/api/challenges/${MEDIA_QUEST}/evidence/blob-handle`,r=>{blobCalls++;return r.fulfill({status:503,json:{error:'Synthetic Blob unavailable'}});});
 await page.route('**/api/uploads/evidence-presign',r=>{presignCalls++;return r.fulfill({status:503,json:{error:'SYNTHETIC_TRANSFER_NOT_CONFIGURED'}});});
 await page.goto(BASE+'/app/evidence-add?id='+MEDIA_QUEST);await page.getByRole('button',{name:'Or paste a public HTTPS link',exact:true}).click();await page.locator('.proof-camp input[type="url"]').fill('this is not a URL');await page.getByRole('button',{name:/Back to upload options/}).click();
 await page.locator('.proof-camp textarea').fill('Keep my description');const picker=page.waitForEvent('filechooser');await page.getByRole('button',{name:/^Upload photo/}).click();await(await picker).setFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
 await page.getByRole('button',{name:'Submit proof',exact:true}).click();await expect(page.locator('.proof-camp').getByRole('alert')).toContainText('SYNTHETIC_TRANSFER_NOT_CONFIGURED');expect(blobCalls).toBe(1);expect(presignCalls).toBe(1);await expect(page.locator('.proof-camp textarea')).toHaveValue('Keep my description');
});

test('cancelling replacement capture retains the prior link and description',async({page})=>{
 await mediaFixture(page,{hold:true});await proofFixture(page,'photo');await page.goto(BASE+'/app/evidence-add?id='+MEDIA_QUEST);await page.getByRole('button',{name:'Or paste a public HTTPS link',exact:true}).click();await page.locator('.proof-camp input[type="url"]').fill('https://example.invalid/original-proof.png');await page.getByRole('button',{name:/Back to upload options/}).click();
 await page.locator('.proof-camp textarea').fill('Keep my original note');await page.getByRole('button',{name:/^Take photo/}).click();await expect.poll(()=>page.evaluate(()=>window.__sumMediaProbe.streams.length)).toBe(1);await page.getByRole('button',{name:'Cancel media capture',exact:true}).click();await page.evaluate(()=>window.__sumMediaProbe.release());await allTracksStopped(page);
 await page.getByRole('button',{name:'Or paste a public HTTPS link',exact:true}).click();await expect(page.locator('.proof-camp input[type="url"]')).toHaveValue('https://example.invalid/original-proof.png');await expect(page.locator('.proof-camp textarea')).toHaveValue('Keep my original note');
});

for(const language of ['en','zh']as const)test(`header-only recording is not uploadable and preserves the previous source in ${language}`,async({page})=>{
 const fixture=await mediaFixture(page);await proofFixture(page);
 await page.addInitScript(()=>{
  const Recorder=window.MediaRecorder;
  window.MediaRecorder=class extends Recorder{
   constructor(stream:MediaStream,options?:MediaRecorderOptions){super(stream,options);
    this.addEventListener('dataavailable',event=>{
     event.stopImmediatePropagation();
     const handler=this.ondataavailable;
     // Deliberately corrupt the synthetic recorder output; app code must reject
     // nonempty invalid media, not use its byte count as proof of recording.
     const data=new Blob([new Uint8Array([26,69,223,163,159,66,134,129,1,66,247,129,1])],{type:'video/webm'});
     handler?.call(this,new BlobEvent('dataavailable',{data}));
    });
   }
  };
 });
 await page.goto(BASE+'/app/evidence-add?id='+MEDIA_QUEST);await page.getByRole('button',{name:'Or paste a public HTTPS link',exact:true}).click();await page.locator('.proof-camp input[type="url"]').fill('https://example.invalid/prior-video.mp4');await page.getByRole('button',{name:/Back to upload options/}).click();await page.locator('.proof-camp textarea').fill('Keep this original proof description');
 await page.getByRole('button',{name:/^Record video/}).click();await page.getByRole('button',{name:/Start recording/}).click();await page.waitForTimeout(500);
 if(language==='zh')await page.getByTestId('sum-lang-zh').click();
 await page.getByRole('button',{name:language==='zh'?/停止并保存/:/Stop & save/}).click();
 await expect(page.locator('.proof-camp').getByRole('alert')).toContainText(language==='zh'?'无法解码':'could not be decoded');await allTracksStopped(page);await expect(page.locator('.proof-camp video[controls]')).toHaveCount(0);await expect(page.getByRole('button',{name:language==='zh'?'重新录制':'Re-record',exact:true})).toHaveCount(0);await expect(page.locator('.proof-camp textarea')).toHaveValue('Keep this original proof description');
 await page.getByRole('button',{name:language==='zh'?'或粘贴公开 HTTPS 链接':'Or paste a public HTTPS link',exact:true}).click();await expect(page.locator('.proof-camp input[type="url"]')).toHaveValue('https://example.invalid/prior-video.mp4');expect(fixture.writes).toEqual([]);
});
