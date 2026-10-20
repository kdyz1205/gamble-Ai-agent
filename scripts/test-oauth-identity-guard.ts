/** Actual PG + installed NextAuth adapter/handler contracts; no external OAuth or invented provider tokens. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import bcrypt from 'bcryptjs';
import prisma from '../src/lib/db';
import { authOptions } from '../src/lib/auth-options';
import { provisionSignupUser, OAuthLinkRequiredError, OAuthEmailVerificationError } from '../src/lib/auth-provisioning';

async function main() {
  const url=new URL(process.env.DATABASE_URL??'');assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/summoner_verification');
  const run=randomUUID().replaceAll('-','');const email=(label:string)=>`${label}_${run}@example.invalid`;
  const password=randomUUID();const passwordHash=await bcrypt.hash(password,8);
  let passed=0;const pass=(s:string)=>{passed++;console.log(`PASS ${s}`);};
  const googleProvider=authOptions.providers.find(p=>p.id==='google') as {options?:{allowDangerousEmailAccountLinking?:boolean}};
  assert.equal(googleProvider.options?.allowDangerousEmailAccountLinking,false);
  const pre=await provisionSignupUser({source:'credentials',email:email('preregistered'),username:`pre_${run}`,passwordHash});
  const state=async()=>({user:await prisma.user.findUniqueOrThrow({where:{id:pre.id}}),accounts:await prisma.account.findMany({where:{userId:pre.id}}),credits:await prisma.creditTx.findMany({where:{userId:pre.id}})});
  const before=await state();
  const googleInput={source:'google' as const,email:pre.email,username:`google_${run}`,verifiedGoogleEmail:true,googleAccount:{providerAccountId:`google_pre_${run}`}};
  await assert.rejects(provisionSignupUser(googleInput),OAuthLinkRequiredError);assert.deepEqual(await state(),before);
  await assert.rejects(provisionSignupUser({...googleInput,authenticatedUserId:'not-the-owner'}),OAuthLinkRequiredError);assert.deepEqual(await state(),before);
  assert(await bcrypt.compare(password,(await state()).user.passwordHash!));
  pass('credential preregistration cannot silently merge with Google or another session; password/balance/ledger/accounts unchanged');
  const signIn=authOptions.callbacks!.signIn!;
  const googleProfile=(email:string,email_verified=true)=>({email,email_verified});
  await assert.rejects(async()=>await signIn({user:{id:`unverified_${run}`,email:email('not-verified')},account:{provider:'google',type:'oauth',providerAccountId:`not_verified_${run}`},profile:googleProfile(email('not-verified'),false)}),OAuthEmailVerificationError);
  assert.equal(await prisma.user.findUnique({where:{email:email('not-verified')}}),null);
  await assert.rejects(async()=>await signIn({user:{id:`missing_claim_${run}`,email:email('missing-claim')},account:{provider:'google',type:'oauth',providerAccountId:`missing_claim_${run}`},profile:{email:email('missing-claim')}}),OAuthEmailVerificationError);
  await assert.rejects(async()=>await signIn({user:{id:`missing_email_${run}`},account:{provider:'google',type:'oauth',providerAccountId:`missing_email_${run}`},profile:googleProfile(email('unmapped'))}),OAuthEmailVerificationError);
  await assert.rejects(provisionSignupUser({...googleInput,verifiedGoogleEmail:false,authenticatedUserId:pre.id}),OAuthEmailVerificationError);
  pass('unverified Google profile rejected even when an existing session owns the account');
  const freshEmail=email('fresh');const googleId=`google_fresh_${run}`;
  const user={id:`oauth_user_${run}`,email:freshEmail,name:'Verified callback fixture'};
  const account={provider:'google',type:'oauth' as const,providerAccountId:googleId};
  assert.equal(await signIn({user,account,profile:googleProfile(freshEmail)}),true);
  const fresh=await prisma.user.findUniqueOrThrow({where:{email:freshEmail}});
  assert(fresh.emailVerified);assert.equal(fresh.passwordHash,null);assert.equal(await prisma.account.count({where:{userId:fresh.id,provider:'google',providerAccountId:googleId}}),1);
  // Exercise the installed next-auth callback handler after our production signIn
  // callback. This catches fresh signup failing AccountNotLinked after we disable
  // automatic linking. Adapter/database calls are real and unmodified.
  const require=createRequire(join(process.cwd(),'package.json'));
  const installed=require(join(dirname(require.resolve('next-auth')),'core/lib/callback-handler.js')) as {default:(params:Record<string,unknown>)=>Promise<{user:{id:string}}>};
  const sdk=await installed.default({profile:user,account,options:{...authOptions,jwt:{},events:{},session:{strategy:'jwt',generateSessionToken:randomUUID}}});
  assert.equal(sdk.user.id,fresh.id);
  const repeat={id:googleId,email:freshEmail};assert.equal(await signIn({user:repeat,account,profile:googleProfile(freshEmail)}),true);assert.equal(repeat.id,fresh.id);
  assert.equal(await prisma.creditTx.count({where:{userId:fresh.id,type:'bonus'}}),1);assert.equal(await prisma.account.count({where:{userId:fresh.id}}),1);
  pass('fresh verified Google signup atomically links identity and installed NextAuth handler completes with autolink disabled; repeat idempotent');
  const ownerLink=await provisionSignupUser({...googleInput,authenticatedUserId:pre.id});assert.equal(ownerLink.id,pre.id);
  assert.equal((await state()).user.passwordHash,before.user.passwordHash);assert.equal((await state()).user.credits,before.user.credits);assert.equal((await state()).credits.length,before.credits.length);assert.equal((await state()).accounts.length,1);
  const existing={id:googleInput.googleAccount.providerAccountId,email:pre.email};
  assert.equal(await signIn({user:existing,account:{provider:'google',type:'oauth',providerAccountId:googleInput.googleAccount.providerAccountId},profile:googleProfile(pre.email)}),true);assert.equal(existing.id,pre.id);
  pass('only matching server-owned identity can explicitly link; historical linked credential account continues Google login');
  const changed=await provisionSignupUser({source:'google',email:email('changed'),username:`changed_${run}`,verifiedGoogleEmail:true,googleAccount:{providerAccountId:googleId}});assert.equal(changed.id,fresh.id);assert.equal(await prisma.user.findUnique({where:{email:email('changed')}}),null);
  pass('linked stable Google subject preserves identity if provider email changes');
  console.log(`${passed} OAuth identity guard contracts passed; fixtures retained; external OAuth/2FA not exercised`);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());

