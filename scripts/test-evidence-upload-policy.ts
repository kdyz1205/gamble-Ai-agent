/** Real PostgreSQL upload policy; --http adds authenticated production-route checks on the shared local Next server. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { request, type APIRequestContext } from '@playwright/test';
import prisma from '../src/lib/db';
import { authorizeEvidenceUpload, EvidenceUploadPolicyError, EVIDENCE_UPLOAD_MAX_BYTES } from '../src/lib/evidence-upload-policy';

async function main() {
  const url=new URL(process.env.DATABASE_URL??'');
  assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/summoner_verification');
  const run=randomUUID().replaceAll('-','');const password=randomUUID();const passwordHash=await hash(password,8);
  const players=await Promise.all(['creator','opponent','spectator','pending','outsider'].map(role=>prisma.user.create({data:{username:`upload_${run}_${role}`,email:`upload_${run}_${role}@example.invalid`,passwordHash,credits:50}})));
  const [creator,opponent,spectator,pending,outsider]=players;
  const contexts:APIRequestContext[]=[];let passed=0;
  const pass=(label:string)=>{passed++;console.log(`PASS ${label}`);};
  const make=(status='live',evidenceType='photo',deadline:Date|null=new Date(Date.now()+5*60_000))=>prisma.challenge.create({data:{title:`Upload policy ${run}`,type:'custom',creatorId:creator.id,stake:0,status,evidenceType,deadline,participants:{create:[{userId:creator.id,role:'creator',status:'accepted'},{userId:opponent.id,role:'opponent',status:'accepted'},{userId:spectator.id,role:'spectator',status:'accepted'},{userId:pending.id,role:'opponent',status:'pending'}]}}});
  const photo=await make();const video=await make('live','video');const text=await make('live','text');
  const cases:Array<{label:string;id:string;userId:string;status:number;contentType?:string;extension?:string}>=[
    {label:'spectator',id:photo.id,userId:spectator.id,status:403},
    {label:'pending',id:photo.id,userId:pending.id,status:403},
    {label:'outsider',id:photo.id,userId:outsider.id,status:403},
    {label:'wrong media',id:photo.id,userId:creator.id,status:400,contentType:'video/mp4',extension:'mp4'},
    {label:'unsupported SVG',id:photo.id,userId:creator.id,status:400,contentType:'image/svg+xml',extension:'svg'},
    {label:'arbitrary MIME',id:text.id,userId:creator.id,status:400,contentType:'text/html',extension:'html'},
    {label:'missing quest',id:`missing_${run}`,userId:creator.id,status:404},
  ];
  for(const status of ['open','judging','disputed','settled','cancelled','draft','pending_settlement']){
    const quest=await make(status);cases.push({label:status,id:quest.id,userId:creator.id,status:409});
  }
  const expired=await make('live','photo',new Date(Date.now()-1000));cases.push({label:'expired',id:expired.id,userId:creator.id,status:409});
  try {
    for(const player of [creator,opponent]){
      const policy=await authorizeEvidenceUpload({userId:player.id,challengeId:photo.id,contentType:'image/jpeg',pathname:`evidence/${photo.id}/proof.jpg`});
      assert.equal(policy.maximumSizeInBytes,EVIDENCE_UPLOAD_MAX_BYTES);assert.equal(policy.maximumSizeInBytes,80*1024*1024);assert(policy.allowedContentTypes.includes('image/jpeg'));assert(!policy.allowedContentTypes.some(t=>t.startsWith('video/')));assert(policy.validUntil<=photo.deadline!.getTime());
    }
    const matched=await make('matched','video');assert((await authorizeEvidenceUpload({userId:creator.id,challengeId:matched.id,contentType:'video/mp4'})).allowedContentTypes.includes('video/mp4'));
    assert((await authorizeEvidenceUpload({userId:opponent.id,challengeId:video.id,pathname:`evidence/${video.id}/clip.webm`})).allowedContentTypes.every(t=>t.startsWith('video/')));
    assert((await authorizeEvidenceUpload({userId:creator.id,challengeId:text.id,contentType:'image/png',pathname:`evidence/${text.id}/support.png`})).allowedContentTypes.includes('image/png'));
    pass('accepted players / live and matched / MIME policy / optional supporting media / 80MB Blob cap / deadline-bounded expiry');
    for(const c of cases){
      await assert.rejects(authorizeEvidenceUpload({userId:c.userId,challengeId:c.id,contentType:c.contentType??'image/jpeg'}),e=>e instanceof EvidenceUploadPolicyError&&e.status===c.status);
      pass(`policy rejects ${c.label}`);
    }
    for(const pathname of [`evidence/another/proof.jpg`,`evidence/${photo.id}/../proof.jpg`,`evidence/${photo.id}/`,`evidence/${photo.id}/bad.exe`]){
      await assert.rejects(authorizeEvidenceUpload({userId:creator.id,challengeId:photo.id,pathname}),e=>e instanceof EvidenceUploadPolicyError&&e.status===400);
    }
    pass('foreign paths, traversal, empty paths and unsupported file extensions rejected');
    if(process.argv.includes('--http')){
      const base=process.env.TEST_UPLOAD_BASE_URL??'http://localhost:3018';assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));
      const anonymous=await request.newContext({baseURL:base});contexts.push(anonymous);
      const auth=new Map<string,APIRequestContext>();
      for(const player of players){
        const client=await request.newContext({baseURL:base});contexts.push(client);auth.set(player.id,client);
        const csrf=await(await client.get('/api/auth/csrf')).json();
        await client.post('/api/auth/callback/credentials',{form:{email:player.email,password,csrfToken:csrf.csrfToken,callbackUrl:`${base}/summons`,json:'true'}});
        assert.equal((await(await client.get('/api/auth/session')).json()).user.email,player.email);
      }
      const endpoints=[{path:'/api/uploads/evidence-presign',body:(id:string,extension='jpg',contentType='image/jpeg')=>({challengeId:id,contentType,filename:`proof.${extension}`})},{path:`/api/challenges/${photo.id}/evidence/blob-handle`,body:(id:string,extension='jpg')=>({type:'blob.generate-client-token',payload:{pathname:`evidence/${id}/proof.${extension}`,clientPayload:null}})}];
      for(const endpoint of endpoints){
        const response=await anonymous.post(endpoint.path,{data:endpoint.body(photo.id)});assert.equal(response.status(),401);
      }
      pass('actual HTTP both upload routes reject anonymous token requests');
      for(const c of cases){
        for(const route of ['s3','blob']){
          const path=route==='s3'?'/api/uploads/evidence-presign':`/api/challenges/${c.id}/evidence/blob-handle`;
          const body=route==='s3'?{challengeId:c.id,contentType:c.contentType??'image/jpeg',filename:`proof.${c.extension??'jpg'}`}:{type:'blob.generate-client-token',payload:{pathname:`evidence/${c.id}/proof.${c.extension??'jpg'}`,clientPayload:null}};
          const response=await auth.get(c.userId)!.post(path,{data:body});assert.equal(response.status(),c.status,`${route} ${c.label}: ${await response.text()}`);
        }
      }
      pass('actual HTTP both routes enforce every spectator/pending/state/deadline/media negative');
      for(const endpoint of endpoints){
        for(const invalid of [null,[],{}, {type:'blob.generate-client-token',payload:null}]){
          const response=await auth.get(creator.id)!.post(endpoint.path,{data:JSON.stringify(invalid),headers:{'content-type':'application/json'}});assert.equal(response.status(),400);
        }
        const response=await auth.get(creator.id)!.post(endpoint.path,{data:endpoint.body(photo.id)});
        assert([200,503].includes(response.status()),`eligible upload unexpected HTTP ${response.status()}`);
        if(response.status()===503){const body=await response.json();assert.equal(body.configured,false);assert(!/AWS_|BLOB_READ_WRITE|SECRET|TOKEN/.test(body.error));console.log('Eligible upload storage unavailable (503); no issued-token success claimed.');}
      }
      pass('actual HTTP malformed bodies sanitized; eligible players pass policy to storage availability gate');
    }
    assert.equal(await prisma.creditTx.count({where:{userId:{in:players.map(p=>p.id)}}}),0);
    assert.equal(await prisma.evidence.count({where:{userId:{in:players.map(p=>p.id)}}}),0);
    assert((await prisma.user.findMany({where:{id:{in:players.map(p=>p.id)}}})).every(p=>p.credits===50));
    pass('upload authorization creates no proof, credit mutations or provider requests');
    console.log(`${passed} upload policy groups passed; retained fixture ${photo.id}`);
  } finally {await Promise.all(contexts.map(c=>c.dispose()));}
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
