import "dotenv/config";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {expect,test,type BrowserContext} from "@playwright/test";
import {revealQuizAnswers,answerCommitment}
  from "../../src/lib/quiz/quiz-bank";

const BASE=process.env.TEST_BASE_URL||"http://localhost:3017";
test.use({viewport:{width:390,height:844},reducedMotion:"reduce"});

test("two authenticated friends create, accept, answer and verify a no-money voice-ready Quiz",
  async({browser},testInfo)=>{
  test.setTimeout(180_000);
  const dbUrl=new URL(process.env.DATABASE_URL||"postgresql://missing");
  test.skip(!["localhost","127.0.0.1"].includes(dbUrl.hostname)||
    dbUrl.pathname!=="/summoner_verification",
    "Requires dedicated, isolated PostgreSQL");
  const db=new Pool({connectionString:process.env.DATABASE_URL});
  const creatorCtx=await browser.newContext(),friendCtx=await browser.newContext(),
    guestCtx=await browser.newContext();
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
    await a.goto(BASE+"/app/quiz");
    await expect(a.getByTestId("quiz-create-form")).toBeVisible({timeout:30_000});
    await expect(a.getByTestId("quiz-microphone")).toBeVisible();
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
    await a.reload();
    await expect(a.locator(".ios-quiz-question")).toHaveCount(3,{timeout:15_000});
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
    await expect(b.getByTestId("quiz-final-verdict")).toContainText("3 / 3 correct");
    await a.reload();
    await expect(a.getByTestId("quiz-final-verdict")).toBeVisible({timeout:15_000});
    await expect(a.getByTestId("quiz-final-verdict")).toContainText("You won on correct answers");
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
    expect((await creatorCtx.request.post(BASE+"/api/quiz/"+id+"/answer",
      {data:{answers:wrong}})).status()).toBe(409);
    expect((await creatorCtx.request.post(BASE+"/api/quiz/"+id+"/answer",
      {data:{answers:correct}})).status()).toBe(200);

    const rows=await db.query(
      'SELECT c.status,c.stake,c."resolutionHash",j.method,j."aiModel" FROM "Challenge" c JOIN "Judgment" j ON j."challengeId"=c.id WHERE c.id=$1',
      [id]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({status:"settled",stake:0,
      method:"rules",aiModel:"quiz-curated-mcq-v1"});
    expect(rows.rows[0].resolutionHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await db.query('SELECT count(*)::int AS n FROM "QuizAttempt" WHERE "challengeId"=$1',[id])).rows[0].n).toBe(2);
    expect((await db.query('SELECT count(*)::int AS n FROM "CreditTx" WHERE "challengeId"=$1',[id])).rows[0].n).toBe(0);
    expect(await balances()).toEqual(initialBalances);
    console.log(JSON.stringify({challengeId:id,creator:creator.id,friend:friend.id,
      objectiveScores:[3,0],winnerId:creator.id,creditsTransferred:0,verdictCount:1}));
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
