import "dotenv/config";
import {randomUUID} from "node:crypto";
import {mkdirSync} from "node:fs";
import {Pool} from "pg";
import {expect,test,type BrowserContext} from "@playwright/test";
import {revealQuizAnswers,answerCommitment}
  from "../../src/lib/quiz/quiz-bank";

const BASE=process.env.TEST_BASE_URL||"http://localhost:3017";
test.use({viewport:{width:390,height:844}});

test("two authenticated friends create, accept, answer and verify a no-money voice-ready Quiz",
  async({browser},testInfo)=>{
  test.setTimeout(180_000);
  const dbUrl=new URL(process.env.DATABASE_URL||"postgresql://missing");
  test.skip(!["localhost","127.0.0.1"].includes(dbUrl.hostname)||
    dbUrl.pathname!=="/summoner_verification",
    "Requires dedicated, isolated PostgreSQL");
  const db=new Pool({connectionString:process.env.DATABASE_URL});
  const creatorCtx=await browser.newContext({reducedMotion:"reduce"}),
    friendCtx=await browser.newContext({reducedMotion:"reduce"}),
    guestCtx=await browser.newContext({reducedMotion:"reduce"});
  const userIds:string[]=[],challengeIds:string[]=[];
  const suffix=randomUUID().replaceAll("-","").slice(0,16);
  async function register(context:BrowserContext,label:string){
    const username=`quiz_e2e_${label}_${suffix}`;
    const email=`quiz-e2e-${label}-${suffix}@example.invalid`;
    const password=randomUUID()+"Aa9!";
    const csrf=(await (await context.request.get(BASE+"/api/auth/csrf")).json()) as {csrfToken:string};
    const created=await context.request.post(BASE+"/api/auth/callback/credentials",{
      form:{csrfToken:csrf.csrfToken,email,username,password,action:"register",
        callbackUrl:BASE+"/app/quiz",json:"true"},
    });
    expect(created.status(),await created.text()).toBe(200);
    const session=await (await context.request.get(BASE+"/api/auth/session")).json();
    expect(session.user.email).toBe(email);
    userIds.push(session.user.id as string);
    return {id:session.user.id as string,username};
  }
  const balances=()=>db.query(
    'SELECT id,credits,"totalCreditsWon","totalCreditsLost" FROM "User" WHERE id=ANY($1::text[]) ORDER BY id',
    [userIds]).then(r=>r.rows);
  try{
    const creator=await register(creatorCtx,"creator");
    const friend=await register(friendCtx,"friend");
    const initialBalances=await balances();
    const a=await creatorCtx.newPage();
    // Deterministic browser-media fixture tests the actual mic→multipart
    // upload→editable transcript path without using a paid external voice API.
    await a.addInitScript(()=>{
      Object.defineProperty(navigator,"mediaDevices",{
        configurable:true,value:{getUserMedia:async()=>({
          getTracks:()=>[{stop:()=>{}}],
        })},
      });
      class TestRecorder{
        static isTypeSupported(_t:string){return true;}
        mimeType:string;
        state:"inactive"|"recording"="inactive";
        ondataavailable:((event:{data:Blob})=>void)|null=null;
        onstop:(()=>void)|null=null;
        onerror:(()=>void)|null=null;
        constructor(_stream:unknown,options?:{mimeType?:string}){
          this.mimeType=options?.mimeType||"audio/mp4";
        }
        start(){this.state="recording";}
        stop(){
          this.state="inactive";
          this.ondataavailable?.({data:new Blob(["test-audio"],{type:this.mimeType})});
          this.onstop?.();
        }
      }
      Object.defineProperty(window,"MediaRecorder",{configurable:true,value:TestRecorder});
      Object.defineProperty(window,"SpeechRecognition",{configurable:true,value:undefined});
      Object.defineProperty(window,"webkitSpeechRecognition",{configurable:true,value:undefined});
    });
    let transcriptCalls=0;
    await a.route("**/api/transcribe",async route=>{
      transcriptCalls++;
      expect(route.request().method()).toBe("POST");
      const bytes=route.request().postDataBuffer();
      expect(bytes&&bytes.length>20).toBeTruthy();
      expect(bytes!.toString("utf8")).toContain("filename=");
      await route.fulfill({status:200,contentType:"application/json",
        body:JSON.stringify({transcript:"Challenge my friend to a science Quiz",
          language:"en",provider:"test-fixture",usedFallback:false}),
      });
    });
    await a.goto(BASE+"/app/quiz");
    await expect(a.getByTestId("quiz-create-form")).toBeVisible({timeout:30_000});
    const microphone=a.getByTestId("quiz-microphone");
    await expect(microphone).toBeVisible();
    await microphone.click();
    await expect(microphone).toContainText("Stop recording");
    await microphone.click();
    await expect(a.getByTestId("quiz-voice-transcript"))
      .toHaveValue("Challenge my friend to a science Quiz");
    expect(transcriptCalls).toBe(1);
    expect((await db.query(
      'SELECT COUNT(*)::int AS n FROM "Challenge" WHERE "creatorId"=$1',[creator.id]
    )).rows[0].n).toBe(0);
    await a.getByTestId("quiz-voice-transcript").fill(
      "I challenge a friend to three Software and AI questions.");
    await a.getByRole("combobox",{name:"Quiz topic"}).selectOption("technology");
    await a.getByPlaceholder("Leave blank to invite with a link").fill(friend.username);
    const createdResponse=a.waitForResponse(r=>r.url().endsWith("/api/quiz")&&
      r.request().method()==="POST");
    await a.getByTestId("quiz-create-submit").click();
    const receipt=await createdResponse;
    expect(receipt.status(),await receipt.text()).toBe(201);
    const created=await receipt.json();
    const id=created.challengeId as string;
    expect(id).toMatch(/^[a-zA-Z0-9_-]{8,128}$/);
    challengeIds.push(id);
    await expect(a).toHaveURL(new RegExp("/app/quiz\\?id="+id));
    await expect(a.getByTestId("quiz-duel-room")).toBeVisible();
    await expect(a.getByTestId("quiz-share-invite")).toBeVisible();
    await expect(a.getByTestId("ios-quiz-arena")).toHaveAttribute("data-phase","open");
    await expect(a.getByTestId("ios-quiz-arena")).toHaveAttribute("data-vfx","static");
    expect(await a.locator(".ios-quiz-arena__sky").evaluate(el=>
      getComputedStyle(el).animationName)).toBe("none");
    await expect(a.getByText("Free challenge · 0 credits at stake")).toBeVisible();
    await a.screenshot({path:testInfo.outputPath("creator-invite.png"),fullPage:true});

    expect((await guestCtx.request.get(BASE+"/api/quiz/"+id)).status()).toBe(401);
    expect((await guestCtx.request.post(BASE+"/api/quiz/"+id+"/accept")).status()).toBe(401);
    const b=await friendCtx.newPage();
    await b.goto(BASE+"/app/quiz?id="+id);
    await expect(b.getByTestId("quiz-accept-invite")).toBeVisible({timeout:30_000});
    const accepting=b.waitForResponse(r=>r.url().endsWith("/api/quiz/"+id+"/accept")&&
      r.request().method()==="POST");
    await b.getByTestId("quiz-accept-invite").click();
    expect((await accepting).status()).toBe(200);
    await expect(b.locator(".ios-quiz-question")).toHaveCount(3,{timeout:15_000});
    await expect(b.getByTestId("ios-quiz-arena")).toHaveAttribute("data-phase","live");
    await a.reload();
    await expect(a.locator(".ios-quiz-question")).toHaveCount(3,{timeout:15_000});
    await expect(a.getByTestId("ios-quiz-arena")).toHaveAttribute("data-phase","live");
    await a.getByTestId("toggle-pico-3d").click();
    const live3D=a.getByTestId("pico-3d-canvas");
    await expect(live3D).toHaveAttribute("data-vfx-phase","live",{timeout:20_000});
    await expect(live3D).toHaveAttribute("data-vfx-winner","none");
    await expect(live3D).toHaveAttribute("data-vfx-meshes",/^[1-9][0-9]*$/);
    mkdirSync("output/ios-full-app",{recursive:true});
    await a.emulateMedia({reducedMotion:"no-preference"});
    await expect(live3D).toHaveAttribute("data-animating","true");
    await a.screenshot({path:"output/ios-full-app/pico-live-mutual-charge-3d.png",
      fullPage:true});
    await a.emulateMedia({reducedMotion:"reduce"});
    const aView=(await (await creatorCtx.request.get(BASE+"/api/quiz/"+id)).json()).quiz;
    const bView=(await (await friendCtx.request.get(BASE+"/api/quiz/"+id)).json()).quiz;
    expect(aView.status).toBe("live");
    expect(aView.questions).toEqual(bView.questions);
    const ids=(aView.questions as Array<{id:string}>).map(q=>q.id);
    const correct=revealQuizAnswers(ids).map(q=>q.answer);
    expect(answerCommitment(ids)).toBe(aView.answerCommitment);
    expect(JSON.stringify(aView.questions)).not.toContain("correctAnswers");
    await expect(a.getByTestId("quiz-final-verdict")).toHaveCount(0);
    for(let i=0;i<3;i++){
      await a.locator(".ios-quiz-question").nth(i).locator('input[type="radio"]')
        .nth(correct[i]).check();
    }
    const answeredA=a.waitForResponse(r=>r.url().endsWith("/api/quiz/"+id+"/answer")&&
      r.request().method()==="POST");
    await a.getByTestId("quiz-submit-answers").click();
    expect((await answeredA).status()).toBe(200);
    expect((await (await creatorCtx.request.get(BASE+"/api/quiz/"+id)).json()).quiz.result).toBeNull();
    await expect(a.getByTestId("quiz-final-verdict")).toHaveCount(0);
    const wrong=correct.map(x=>(x+1)%4);
    for(let i=0;i<3;i++){
      await b.locator(".ios-quiz-question").nth(i).locator('input[type="radio"]')
        .nth(wrong[i]).check();
    }
    const answeredB=b.waitForResponse(r=>r.url().endsWith("/api/quiz/"+id+"/answer")&&
      r.request().method()==="POST");
    await b.getByTestId("quiz-submit-answers").click();
    expect((await answeredB).status()).toBe(200);
    await expect(b.getByTestId("quiz-final-verdict")).toBeVisible({timeout:15_000});
    await expect(b.getByTestId("ios-quiz-arena")).toHaveAttribute("data-phase","completed");
    await expect(b.getByTestId("ios-quiz-arena")).not.toContainText("Verified victory");
    await expect(b.getByTestId("quiz-final-verdict")).toContainText("3 / 3 correct");
    await a.reload();
    await expect(a.getByTestId("quiz-final-verdict")).toBeVisible({timeout:15_000});
    await expect(a.getByTestId("quiz-final-verdict")).toContainText("You won on correct answers");
    await expect(a.getByTestId("ios-quiz-arena")).toHaveAttribute("data-phase","completed");
    await expect(a.getByTestId("ios-quiz-arena")).toContainText("Verified victory");
    await expect(a.getByTestId("ios-quiz-arena").getByText("WINNER",{exact:true})).toBeVisible();
    await a.getByTestId("toggle-pico-3d").click();
    const verified3D=a.getByTestId("pico-3d-canvas");
    await expect(verified3D).toHaveAttribute("data-vfx-phase","completed",{timeout:20_000});
    await expect(verified3D).toHaveAttribute("data-vfx-winner","creator");
    await a.emulateMedia({reducedMotion:"no-preference"});
    await expect(verified3D).toHaveAttribute("data-animating","true");
    await a.screenshot({path:"output/ios-full-app/pico-server-verified-winner-3d.png",
      fullPage:true});
    await a.emulateMedia({reducedMotion:"reduce"});
    await a.screenshot({path:testInfo.outputPath("verified-quiz-result.png"),fullPage:true});

    const final=(await (await creatorCtx.request.get(BASE+"/api/quiz/"+id)).json()).quiz;
    expect(final.status).toBe("completed");
    expect(final.result.winnerId).toBe(creator.id);
    expect(final.result.scores).toEqual(expect.arrayContaining([
      expect.objectContaining({userId:creator.id,score:3}),
      expect.objectContaining({userId:friend.id,score:0}),
    ]));
    expect(final.result.creditsTransferred).toBe(0);
    expect(final.result.answerCommitment).toBe(aView.answerCommitment);
    expect(final.result.scores.find((s:{userId:string})=>s.userId===creator.id).answers).toEqual(correct);
    expect(final.result.scores.find((s:{userId:string})=>s.userId===friend.id).answers).toEqual(wrong);
    expect(final.resolutionHash).toMatch(/^[a-f0-9]{64}$/);
    await a.getByTestId("quiz-verified-answer-receipt").locator("summary").click();
    await expect(a.getByTestId("quiz-verified-answer-receipt")).toContainText(
      "Final Quiz resolution SHA-256");
    expect((await creatorCtx.request.post(BASE+"/api/quiz/"+id+"/answer",
      {data:{answers:wrong}})).status()).toBe(409);
    expect((await creatorCtx.request.post(BASE+"/api/quiz/"+id+"/answer",
      {data:{answers:correct}})).status()).toBe(200);

    // The same completed Quiz must remain reachable inside the shared Web App,
    // not only through a standalone Quiz URL or a marketing page.
    await a.goto(BASE + "/app/today");
    const recent = a.getByRole("region", { name: "Recent settled Quest receipts" });
    await expect(recent).toBeVisible();
    await expect(recent.getByTestId("ios-quest-card")).toHaveCount(1);
    await recent.getByTestId("ios-quest-card").click();
    await expect(a.getByTestId("ios-quiz-flow")).toBeVisible();
    await a.getByRole("link", { name: "Open Quiz and final receipt" }).click();
    await expect(a.getByTestId("quiz-final-verdict")).toBeVisible();

    const rows=await db.query(
      'SELECT c.status,c.stake,c."resolutionHash",j.method,j."aiModel" FROM "Challenge" c JOIN "Judgment" j ON j."challengeId"=c.id WHERE c.id=$1',
      [id]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({status:"settled",stake:0,
      method:"rules",aiModel:"quiz-curated-mcq-v1"});
    expect(rows.rows[0].resolutionHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await db.query('SELECT count(*)::int AS n FROM "QuizAttempt" WHERE "challengeId"=$1',[id])).rows[0].n).toBe(2);
    expect((await db.query('SELECT count(*)::int AS n FROM "CreditTx" WHERE "challengeId"=$1',[id])).rows[0].n).toBe(0);

    // The same server-verifiable receipt becomes a *read-only* match history
    // for each participant, never spendable career XP or a Summon ticket.
    expect((await guestCtx.request.get(BASE+"/api/quiz/history")).status()).toBe(401);
    const creatorHistoryResponse=await creatorCtx.request.get(BASE+"/api/quiz/history");
    expect(creatorHistoryResponse.status()).toBe(200);
    const creatorHistory=(await creatorHistoryResponse.json()).history;
    expect(creatorHistory.items.find((row:{challengeId:string})=>
      row.challengeId===id)).toMatchObject({
      outcome:"won",myScore:3,opponentScore:0,
      opponentUsername:friend.username,creditedCareerXp:0,
      creditedSummonTickets:0,stakeCredits:0,
    });
    const otherHistory=(await (await friendCtx.request.get(
      BASE+"/api/quiz/history")).json()).history;
    expect(otherHistory.items.find((row:{challengeId:string})=>
      row.challengeId===id)).toMatchObject({
      outcome:"lost",myScore:0,opponentScore:3,
      opponentUsername:creator.username,creditedCareerXp:0,
    });
    expect(JSON.stringify(creatorHistory)).not.toContain("correctAnswers");
    expect(JSON.stringify(creatorHistory)).not.toContain("answersJson");
    expect((await db.query(
      'SELECT count(*)::int AS n FROM "ProfessionXpEvent" WHERE "challengeId"=$1',
      [id])).rows[0].n).toBe(0);
    expect((await db.query(
      'SELECT count(*)::int AS n FROM "SummonTicket" WHERE "ownerId"=$1',
      [creator.id])).rows[0].n).toBe(0);
    await a.goto(BASE+"/app/quiz");
    await expect(a.getByTestId("quiz-verified-history")).toBeVisible();
    const historyRow=a.getByTestId("quiz-history-"+id);
    await expect(historyRow).toBeVisible({timeout:15_000});
    await expect(historyRow).toContainText("Victory");
    await expect(historyRow).toContainText("3 / 3");
    // The same immutable server receipt must survive a bilingual switch:
    // only the localized UI labels change, not scores, winner or awards.
    await a.evaluate(()=>localStorage.setItem("sum-language","zh"));
    await a.reload();
    const historyZh=a.getByTestId("quiz-verified-history");
    await expect(historyZh.getByRole("heading",{name:"对战记录"})).toBeVisible();
    const historyRowZh=a.getByTestId("quiz-history-"+id);
    await expect(historyRowZh).toContainText("胜利");
    await expect(historyRowZh).toContainText("3 / 3");
    await expect(historyRowZh.getByRole("link",{name:/查看 Quiz 验证收据/})).toBeVisible();
    await a.evaluate(()=>localStorage.setItem("sum-language","en"));
    await a.reload();
    await expect(historyRow).toContainText("Victory");
    await historyRow.getByRole("link",{name:/View verified receipt/i}).click();
    await expect(a).toHaveURL(new RegExp("/app/quiz\\?id="+id));
    await expect(a.getByTestId("quiz-final-verdict")).toBeVisible();

    // Creator can revoke a second, still-unaccepted invitation without
    // exposing stale "open" state or writing a credit refund.
    const pending=await creatorCtx.request.post(BASE+"/api/quiz",{
      data:{topic:"sports",requestKey:randomUUID(),stakeCredits:0},
    });
    expect(pending.status(),await pending.text()).toBe(201);
    const pendingId=(await pending.json()).challengeId as string;
    challengeIds.push(pendingId);
    await a.goto(BASE+"/app/quiz?id="+pendingId);
    await expect(a.getByTestId("quiz-cancel-invite")).toBeVisible({timeout:15000});
    const cancelling=a.waitForResponse(r=>r.url().endsWith(
      "/api/quiz/"+pendingId+"/cancel")&&r.request().method()==="POST");
    await a.getByTestId("quiz-cancel-invite").click();
    expect((await cancelling).status()).toBe(200);
    await expect(a.getByTestId("quiz-cancelled")).toBeVisible();
    await expect(a.getByTestId("ios-quiz-arena")).toHaveAttribute("data-phase","cancelled");
    const failedJoin=await friendCtx.request.post(
      BASE+"/api/quiz/"+pendingId+"/accept");
    expect(failedJoin.status()).toBe(409);
    expect((await db.query('SELECT count(*)::int AS n FROM "CreditTx" WHERE "challengeId"=$1',
      [pendingId])).rows[0].n).toBe(0);
    // A lost success response must be safe to retry, while starting the NEXT
    // Quiz with the same settings must not silently reopen the old room.
    // Exercise both sides with the real authenticated browser + isolated DB.
    await a.getByRole("link",{name:"Create a new Quiz"}).click();
    await expect(a.getByTestId("quiz-create-form")).toBeVisible();
    await a.getByTestId("quiz-voice-transcript").fill(
      "Challenge a friend to three mathematics Quiz questions.");
    await a.getByRole("combobox",{name:"Quiz topic"}).selectOption("math");
    const createKeys:string[]=[];
    let committedId="";
    let swallowFirstSuccess=true;
    await a.route("**/api/quiz",async route=>{
      if(route.request().method()!=="POST")return route.continue();
      const data=route.request().postDataJSON() as {requestKey:string};
      createKeys.push(data.requestKey);
      if(!swallowFirstSuccess)return route.continue();
      swallowFirstSuccess=false;
      const committed=await route.fetch();
      expect(committed.status()).toBe(201);
      committedId=((await committed.json()) as {challengeId:string}).challengeId;
      challengeIds.push(committedId);
      // The server DID create a room. Simulate the client losing the 201 reply.
      await route.fulfill({status:503,contentType:"application/json",
        body:JSON.stringify({error:"Temporary reply lost; retry safely"})});
    });
    await a.getByTestId("quiz-create-submit").click();
    await expect(a.getByRole("alert")).toContainText("Temporary reply lost");
    const retried=a.waitForResponse(r=>r.url().endsWith("/api/quiz")&&
      r.request().method()==="POST"&&r.status()===201);
    await a.getByTestId("quiz-create-submit").click();
    const retryReply=await retried;
    expect((await retryReply.json()).challengeId).toBe(committedId);
    expect(createKeys).toHaveLength(2);
    expect(createKeys[0]).toBe(createKeys[1]);
    await expect(a).toHaveURL(new RegExp("/app/quiz\\?id="+committedId));
    await expect(a.getByTestId("quiz-cancel-invite")).toBeVisible();
    await a.getByTestId("quiz-cancel-invite").click();
    await expect(a.getByTestId("quiz-cancelled")).toBeVisible();

    await a.getByRole("link",{name:"Create a new Quiz"}).click();
    await expect(a.getByTestId("quiz-create-form")).toBeVisible();
    // Same unchanged form when client state is preserved; a remounted form
    // is also legitimate. Either way, this new game needs a new request key.
    const nextResponse=a.waitForResponse(r=>r.url().endsWith("/api/quiz")&&
      r.request().method()==="POST"&&r.status()===201);
    await a.getByTestId("quiz-create-submit").click();
    const newGame=await nextResponse;
    const newId=(await newGame.json()).challengeId as string;
    challengeIds.push(newId);
    expect(newId).not.toBe(committedId);
    expect(createKeys).toHaveLength(3);
    expect(createKeys[2]).not.toBe(createKeys[0]);
    await expect(a).toHaveURL(new RegExp("/app/quiz\\?id="+newId));
    await expect(a.getByTestId("quiz-cancel-invite")).toBeVisible();
    await a.getByTestId("quiz-cancel-invite").click();
    await expect(a.getByTestId("quiz-cancelled")).toBeVisible();
    await a.unroute("**/api/quiz");
    expect((await db.query('SELECT COUNT(*)::int AS n FROM "CreditTx" WHERE "challengeId"=ANY($1::text[])',
      [[committedId,newId]])).rows[0].n).toBe(0);
    expect(await balances()).toEqual(initialBalances);
    console.log(JSON.stringify({challengeId:id,creator:creator.id,friend:friend.id,
      objectiveScores:[3,0],winnerId:creator.id,creditsTransferred:0,verdictCount:1,
      rematchCreatedDistinct:true,retryStayedIdempotent:true}));
  }finally{
    for(const ctx of [creatorCtx,friendCtx,guestCtx])await ctx.close();
    for(const id of challengeIds){
      await db.query('DELETE FROM "AuditLog" WHERE "challengeId"=$1',[id]).catch(()=>{});
      await db.query('DELETE FROM "ActivityEvent" WHERE "challengeId"=$1',[id]).catch(()=>{});
      await db.query('DELETE FROM "Challenge" WHERE id=$1',[id]).catch(()=>{});
    }
    if(userIds.length){
      await db.query('DELETE FROM "CreditTx" WHERE "userId"=ANY($1::text[])',[userIds]).catch(()=>{});
      await db.query('DELETE FROM "AuditLog" WHERE "actorUserId"=ANY($1::text[]) OR "targetUserId"=ANY($1::text[])',[userIds]).catch(()=>{});
      await db.query('DELETE FROM "ActivityEvent" WHERE "userId"=ANY($1::text[])',[userIds]).catch(()=>{});
      await db.query('DELETE FROM "User" WHERE id=ANY($1::text[])',[userIds]).catch(()=>{});
    }
    await db.end();
  }
});


test("cinematic game-first HUD pauses offscreen and honors motion settings",async({browser},testInfo)=>{
  const context=await browser.newContext({
    viewport:{width:390,height:360},reducedMotion:"no-preference",
  });
  try{
    const page=await context.newPage();
    await page.goto(BASE+"/app/quiz");
    const arena=page.getByTestId("ios-quiz-arena");
    const hud=page.getByTestId("ios-duel-hud");
    await expect(arena).toBeVisible({timeout:30_000});
    await expect(page.getByTestId("ios-quiz-arena-vfx")).toHaveCount(1);
    await expect(hud).toContainText("Free challenge · 0 credits at stake");
    const order=await page.evaluate(()=>{
      const stage=document.querySelector('[data-testid="ios-quiz-arena"]');
      const controls=document.querySelector('[data-testid="ios-duel-hud"]');
      return !!stage&&!!controls&&Boolean(
        stage.compareDocumentPosition(controls)&Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(order).toBe(true);
    // The arena leads the mobile viewport, with the controls below it.
    await expect(arena).toHaveAttribute("data-vfx","canvas",{timeout:15_000});
    await expect(arena).toHaveAttribute("data-vfx-quality",/^(balanced|adaptive)$/);
    await page.screenshot({path:testInfo.outputPath("game-first-duel-mobile.png"),fullPage:true});
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    await expect(arena).toHaveAttribute("data-vfx","static",{timeout:15_000});
    await arena.scrollIntoViewIfNeeded();
    await expect(arena).toHaveAttribute("data-vfx","canvas",{timeout:15_000});

    await page.emulateMedia({reducedMotion:"reduce"});
    await expect(arena).toHaveAttribute("data-vfx","static");
    await page.emulateMedia({reducedMotion:"no-preference"});
    await expect(arena).toHaveAttribute("data-vfx","canvas");
    await page.evaluate(()=>{
      localStorage.setItem("sum-ios-reduced-motion","true");
      window.dispatchEvent(new Event("sum-ios-preferences-changed"));
    });
    await expect(arena).toHaveAttribute("data-vfx","static");
    await page.evaluate(()=>{
      localStorage.setItem("sum-ios-reduced-motion","false");
      window.dispatchEvent(new Event("sum-ios-preferences-changed"));
    });
    await expect(arena).toHaveAttribute("data-vfx","canvas");
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    await expect(arena).toHaveAttribute("data-vfx","static");
  }finally{
    await context.close();
  }
});


test("optional true Pico 3D meshes render and obey motion controls",async({browser},testInfo)=>{
  const ctx=await browser.newContext({
    viewport:{width:390,height:844},
    reducedMotion:"no-preference",
  });
  try{
    const page=await ctx.newPage();
    await page.goto(BASE+"/app/quiz");
    const arena=page.getByTestId("ios-quiz-arena");
    const mode=page.getByTestId("toggle-pico-3d");
    await expect(arena).toBeVisible();
    await expect(mode).toHaveAttribute("aria-pressed","false");
    const webgl=await page.evaluate(()=>{
      try{
        const testCanvas=document.createElement("canvas");
        const ctx=testCanvas.getContext("webgl2")||testCanvas.getContext("webgl");
        return Boolean(ctx);
      }catch{return false;}
    });
    await mode.click();
    const mesh=page.getByTestId("pico-3d-canvas");
    if(!webgl){
      await expect(mode).toHaveAttribute("aria-pressed","false",{timeout:20_000});
      await expect(arena.locator(".ios-quiz-arena__fallback")).toBeVisible();
      await expect(arena.locator(".ios-quiz-arena__pico").first()).toBeVisible();
      return;
    }
    await expect(mesh).toHaveAttribute("data-meshes",/^\d+$/,{timeout:30_000});
    const meshes=Number(await mesh.getAttribute("data-meshes"));
    const triangles=Number(await mesh.getAttribute("data-triangles"));
    expect(meshes).toBeGreaterThan(70);
    expect(triangles).toBeGreaterThan(50_000);
    await expect(mode).toHaveAttribute("aria-pressed","true");
    await expect(arena).toHaveClass(/ios-quiz-arena--3d/);
    await expect(arena.locator(".ios-quiz-arena__prototype-note")).toBeVisible();
    await page.screenshot({path:testInfo.outputPath("actual-pico-3d-meshes-390.png"),fullPage:true});
    await page.emulateMedia({reducedMotion:"reduce"});
    await expect(mesh).toHaveAttribute("data-animating","false");
    await page.emulateMedia({reducedMotion:"no-preference"});
    await expect(mesh).toHaveAttribute("data-animating","true");
    await mode.click();
    await expect(mode).toHaveAttribute("aria-pressed","false");
    await expect(mesh).toHaveCount(0);
    await expect(arena.locator(".ios-quiz-arena__pico").first()).toBeVisible();
    // 2D and 3D are visual options; both keep the same zero-credit Quiz server.
    await expect(arena).toHaveAttribute("data-phase","preview");
  }finally{
    await ctx.close();
  }
});

test("Pico 3D mode safely falls back when WebGL is disabled",async({browser})=>{
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  try{
    const page=await ctx.newPage();
    await page.addInitScript(()=>{
      const original=HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype,"getContext",{configurable:true,
        value:function(this:HTMLCanvasElement,type:string,...args:unknown[]){
        if(type==="webgl"||type==="webgl2"||type==="experimental-webgl")return null;
        return Reflect.apply(original,this,[type,...args]);
      }});
    });
    await page.goto(BASE+"/app/quiz");
    const arena=page.getByTestId("ios-quiz-arena");
    const toggle=page.getByTestId("toggle-pico-3d");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed","false",{timeout:20_000});
    await expect(arena.locator(".ios-quiz-arena__fallback")).toBeVisible();
    await expect(arena.locator(".ios-quiz-arena__pico").first()).toBeVisible();
    await expect(arena).toHaveAttribute("data-phase","preview");
  }finally{
    await ctx.close();
  }
});
