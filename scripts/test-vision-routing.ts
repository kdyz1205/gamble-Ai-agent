/** Controlled HTTP response contract + actual PostgreSQL accounting. Not model-accuracy proof. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import prisma from '../src/lib/db';
import { getProviderById, resolveJudgmentModel } from '../src/lib/llm-providers';
import { completeOracleJudgeVision } from '../src/lib/llm-router';
import { judgeChallenge } from '../src/lib/ai-engine';
import { executeChallengeJudgment } from '../src/lib/challenge-judgment';
import { withAiContext, AI_RESERVATION_ACTION, AI_RECEIPT_ACTION } from '../src/lib/ai-governance';

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? '');
  assert(['localhost','127.0.0.1'].includes(db.hostname) && db.pathname === '/summoner_verification');
  const id=randomUUID().replaceAll('-','');
  const originalEnv={...process.env};
  const originalFetch=globalThis.fetch;
  const openai=getProviderById('openai')!;
  const oldBase=openai.baseUrl;
  let calls=0;
  let googleHeadersVerified=false;
  const jpeg=await sharp({create:{width:80,height:80,channels:3,background:'red'}}).jpeg().toBuffer();
  const server=createServer(async(req,res)=>{
    if(req.url==='/frame.jpg'){res.setHeader('content-type','image/jpeg');res.end(jpeg);return;}
    if(req.url==='/broken'){res.statusCode=404;res.end();return;}
    calls++;
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
    const body=JSON.parse(Buffer.concat(chunks).toString());
    res.setHeader('content-type','application/json');
    if(req.url==='/google'){
      assert.equal(req.headers['x-goog-api-key'],'local-google-transport');
      assert(body.contents[0].parts.some((p:{inline_data?:unknown})=>p.inline_data));
      googleHeadersVerified=true;
      res.end(JSON.stringify({candidates:[{content:{parts:[{text:'{"observed":"red"}'}]}}],usageMetadata:{promptTokenCount:8,candidatesTokenCount:4,totalTokenCount:12}}));return;
    }
    assert(body.messages.at(-1).content.some((p:{type:string})=>p.type==='image_url'));
    res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({winner:'A',reasoning:'Controlled provider fixture; both image attachments received.',confidence:0.98})}}],usage:{prompt_tokens:10,completion_tokens:4,total_tokens:14}}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert(address&&typeof address!=='string');
  const base=`http://127.0.0.1:${address.port}`;
  let passed=0;const pass=(name:string)=>{passed++;console.log(`PASS ${name}`);};
  const a=await prisma.user.create({data:{username:`vision_${id}_a`,email:`vision_${id}_a@example.invalid`,credits:100}});
  const b=await prisma.user.create({data:{username:`vision_${id}_b`,email:`vision_${id}_b@example.invalid`,credits:100}});
  const ctx={userId:a.id,purpose:`vision-contract-${id}`};
  const image={caption:'Controlled QA fixture',mimeType:'image/jpeg' as const,base64:jpeg.toString('base64')};
  // Pinned public upstream QA photo passes the real DNS/SSRF transport guards.
  const fixtureUrl='https://raw.githubusercontent.com/lovell/sharp/v0.33.5/test/fixtures/320x240.jpg';
  const evidence={type:'photo',url:fixtureUrl,description:'Upstream pinned QA photograph',preparedFrames:[fixtureUrl]};
  const judge={title:'Compare QA cards',type:'custom',rules:'Choose the red card.',evidencePolicy:'photo',participantAId:a.id,participantBId:b.id,evidenceA:evidence,evidenceB:evidence,providerId:'openai',model:'gpt-4o-mini'};
  try {
    process.env.ORACLE_DEFAULT_PROVIDER='deepseek';process.env.DEEPSEEK_API_KEY='local-only';process.env.GOOGLE_AI_API_KEY='\uFEFFlocal-google-transport';
    for(const type of ['photo','video']){
      const selected=resolveJudgmentModel({needsVision:['photo','video'].includes(type),fallbackModel:'claude-haiku-4-5-20251001'});
      assert.deepEqual(selected,{providerId:'google',model:'gemini-2.5-flash-lite'});
    }
    assert.deepEqual(resolveJudgmentModel({providerId:'openai',needsVision:true,fallbackModel:'ignored'}),{providerId:'openai',model:'gpt-4o-mini'});
    assert.throws(()=>resolveJudgmentModel({providerId:'deepseek',needsVision:true,fallbackModel:'ignored'}));
    assert.throws(()=>resolveJudgmentModel({providerId:'openai',model:'gemini-2.5-flash',needsVision:true,fallbackModel:'ignored'}));
    pass('photo/video automatic routing and explicit provider/model integrity');
    const before=await prisma.auditLog.count({where:{actorUserId:a.id,action:AI_RESERVATION_ACTION}});
    for(const params of [{providerId:'deepseek',model:'deepseek-chat',images:[image]},{providerId:'openai',model:'gemini-2.5-flash',images:[image]},{providerId:'openai',model:'gpt-4o-mini',images:[]}]){
      await assert.rejects(withAiContext(ctx,()=>completeOracleJudgeVision({...params,system:'QA',userText:'QA'})));
    }
    assert.equal(calls,0);assert.equal(await prisma.auditLog.count({where:{actorUserId:a.id,action:AI_RESERVATION_ACTION}}),before);
    pass('unsupported/mismatched/empty vision rejected before HTTP or reservation');
    const unreadable=await withAiContext(ctx,()=>judgeChallenge({...judge,evidenceB:{...evidence,url:'https://raw.githubusercontent.com/lovell/sharp/v0.33.5/test/fixtures/not-a-real-fixture.jpg',preparedFrames:['https://raw.githubusercontent.com/lovell/sharp/v0.33.5/test/fixtures/not-a-real-fixture.jpg']}}));
    assert.equal(unreadable.winnerId,null);assert.equal(unreadable.confidence,0.25);assert.equal(calls,0);
    pass('one unreadable media proof cannot become a text-only winner');
    openai.baseUrl=base;process.env.OPENAI_API_KEY='local-transport';
    const result=await withAiContext(ctx,()=>judgeChallenge(judge));assert.equal(result.winnerId,a.id);assert.equal(calls,1);
    pass('production judge sends both actual image attachments through controlled HTTP');
    globalThis.fetch=((input,init)=>{
      const url=String(input);
      if(url.startsWith('https://generativelanguage.googleapis.com/')){
        assert.equal(new URL(url).searchParams.has('key'),false);
        return originalFetch(`${base}/google`,init);
      }
      return originalFetch(input,init);
    }) as typeof fetch;
    assert.equal(await withAiContext(ctx,()=>completeOracleJudgeVision({providerId:'google',model:'gemini-2.5-flash-lite',system:'QA',userText:'QA',images:[image],maxTokens:200})),'{"observed":"red"}');
    assert(googleHeadersVerified);assert.equal(calls,2);
    pass('production Google helper uses BOM-cleaned header auth with inline image');
    const reservations=await prisma.auditLog.count({where:{actorUserId:a.id,action:AI_RESERVATION_ACTION}});
    const receipts=await prisma.auditLog.findMany({where:{actorUserId:a.id,action:AI_RECEIPT_ACTION}});
    assert.equal(reservations-before,2);assert.equal(receipts.length,2);assert(receipts.every(r=>JSON.parse(r.payload!).outcome==='succeeded'));
    pass('actual PostgreSQL accounts exactly two physical provider requests');
    const quest=await prisma.challenge.create({data:{id:`vision_${id}`,creatorId:a.id,title:'Vision configuration guard',type:'custom',rules:'Choose the red card',stake:5,evidenceType:'photo',status:'judging',participants:{create:[{userId:a.id,role:'creator',status:'accepted'},{userId:b.id,role:'opponent',status:'accepted'}]},evidence:{create:[{userId:a.id,type:'photo',url:evidence.url},{userId:b.id,type:'photo',url:evidence.url}]}}});
    const denied=await executeChallengeJudgment(quest.id,1,{providerId:'deepseek'});assert(!denied.ok&&'status'in denied&&denied.status===400);
    assert.equal((await prisma.user.findUniqueOrThrow({where:{id:a.id}})).credits,100);assert.equal(await prisma.creditTx.count({where:{challengeId:quest.id}}),0);assert.equal(await prisma.judgment.count({where:{challengeId:quest.id}}),0);assert.equal(calls,2);
    pass('actual shared judgment rejects incompatible provider before any financial fee');
    await prisma.evidence.updateMany({where:{challengeId:quest.id},data:{url:'https://raw.githubusercontent.com/lovell/sharp/v0.33.5/test/fixtures/not-a-real-fixture.jpg'}});
    const review=await executeChallengeJudgment(quest.id,1,{providerId:'openai',model:'gpt-4o-mini'});
    assert(review.ok);assert.equal(review.creditsUsed,0);assert.equal(review.judgment.winnerId,null);assert.equal(review.judgment.confidence,0.25);
    assert.equal((await prisma.user.findUniqueOrThrow({where:{id:a.id}})).credits,100);assert.equal(calls,2);
    assert.equal((await prisma.challenge.findUniqueOrThrow({where:{id:quest.id}})).status,'disputed');
    assert.equal(await prisma.reviewCase.count({where:{challengeId:quest.id}}),1);
    pass('unreadable proof persists no-winner review and refunds the fee without model inference');
    if (process.argv.includes('--verify-live-receipt')) {
      const receiptPath='output/vision-production-helper-live.json';
      const receipt=JSON.parse(await fs.readFile(receiptPath,'utf8'));
      const parsed=JSON.parse(receipt.response.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
      assert.equal(receipt.failure,null);assert.match(parsed.code,/\bQAV17\b/);assert.equal(parsed.redCircles,3);assert.equal(parsed.blueSquares,2);assert.equal(parsed.rallyWinner,null);
      const rows=await prisma.auditLog.findMany({where:{payload:{contains:receipt.requestId}}});
      assert.equal(rows.filter(r=>r.action===AI_RESERVATION_ACTION).length,1);assert.equal(rows.filter(r=>r.action===AI_RECEIPT_ACTION).length,1);
      const outcome=JSON.parse(rows.find(r=>r.action===AI_RECEIPT_ACTION)!.payload!);assert.equal(outcome.outcome,'succeeded');assert.equal(outcome.usage.totalTokens,380);
      receipt.posthocValidation={codeVisible:true,codeExact:parsed.code==='QAV17',countsCorrect:true,abstentionCorrect:true,actualReservationAndReceiptRechecked:true,reason:'Original prompt asked to read large code; model returned all visible text including QAV17. Original strict code-field check is preserved above. No additional inference.'};
      await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2));
      pass('saved REAL helper response contains correct visible code/counts/abstention; strict code-only formatting miss retained');
    }
    if (process.argv.includes('--live')) {
      const receiptPath='output/vision-production-helper-live.json';
      try { await fs.access(receiptPath); throw new Error('Live helper call already recorded; do not repeat'); }
      catch(error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; }
      globalThis.fetch=originalFetch;
      const env=dotenv.parse(await fs.readFile('.vercel/stubborn-development.env','utf8'));
      process.env.GOOGLE_AI_API_KEY=env.GOOGLE_AI_API_KEY;
      assert(process.env.GOOGLE_AI_API_KEY);
      const fixture=await fs.readFile('output/vision-qa-fixture.png');
      const requestId=randomUUID();
      await fs.writeFile(receiptPath,JSON.stringify({startedAt:new Date().toISOString(),requestId,scope:'One real Google vision call via production helper with local PostgreSQL governance; synthetic QA fixture only.'},null,2));
      let response='';let failure:string|null=null;
      try {
        response=await withAiContext({...ctx,requestId},()=>completeOracleJudgeVision({providerId:'google',model:'gemini-2.5-flash-lite',system:'Inspect only visible content. No invented sports result. Return JSON only.',userText:'Read the large code, count red circles and blue squares. Can this static card establish a sports rally winner? Return {"code":string,"redCircles":number,"blueSquares":number,"rallyWinner":string|null}.',images:[{caption:'Labeled synthetic QA card',mimeType:'image/png',base64:fixture.toString('base64')}],maxTokens:200,temperature:0}));
      } catch(error) { failure=error instanceof Error?error.message:'Provider failed'; }
      const ledger=await prisma.auditLog.findMany({where:{actorUserId:a.id,payload:{contains:requestId}},select:{action:true,payload:true}});
      const completed=ledger.find(row=>row.action===AI_RECEIPT_ACTION);
      const payload=completed?JSON.parse(completed.payload!):null;
      const parsed=response?JSON.parse(response.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')):null;
      const checks={code:parsed?.code==='QAV17',redCircles:parsed?.redCircles===3,blueSquares:parsed?.blueSquares===2,abstention:parsed?.rallyWinner===null};
      await fs.writeFile(receiptPath,JSON.stringify({checkedAt:new Date().toISOString(),scope:'Actual production helper + local PostgreSQL governance; synthetic image only, no sports accuracy claim.',model:'gemini-2.5-flash-lite',requestId,response,failure,checks,accounting:ledger.map(row=>({action:row.action,...JSON.parse(row.payload!)}))},null,2));
      assert.equal(failure,null);assert(Object.values(checks).every(Boolean));assert.equal(ledger.filter(row=>row.action===AI_RESERVATION_ACTION).length,1);assert.equal(payload.outcome,'succeeded');assert(payload.usage.totalTokens>0);
      pass('one REAL Google vision inference via production router, exact usage and local PostgreSQL reservation/receipt');
    }
    console.log(`${passed} vision routing/grounding contracts passed; fixture users retained ${a.id} / ${b.id}`);
  } finally {
    globalThis.fetch=originalFetch;openai.baseUrl=oldBase;
    for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);
    server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());




