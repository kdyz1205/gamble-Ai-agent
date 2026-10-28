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
