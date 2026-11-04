"use strict";
const assert=require('node:assert/strict');
const path=require('node:path');
const {createRequire}=require('node:module');
const {REVIEW,assessAudit,verifyInstalledSource}=require('./audit-reviewed-dependencies.cjs');
const root=path.resolve(__dirname,'..');
let checks=0;
const fixture=()=>({metadata:{vulnerabilities:{total:2}},vulnerabilities:{
 minimatch:{name:'minimatch',severity:'moderate',nodes:['node_modules/minimatch'],via:[{dependency:'minimatch',severity:'moderate',url:REVIEW.advisory}]},
 eslint:{name:'eslint',severity:'moderate',nodes:['node_modules/eslint'],via:['minimatch']},
}});
const locked=()=>({packages:{'node_modules/minimatch':{version:REVIEW.version,integrity:REVIEW.integrity,dev:true},'node_modules/eslint':{dev:true}}});
const now=new Date('2026-11-04T00:00:00Z');
let sourceChecks=0;
assert.equal(assessAudit(fixture(),locked(),()=>{sourceChecks++;},now).unreviewed,0);checks++;
assert.equal(sourceChecks,1);checks++;
for(const mutate of [
 (a,l)=>{l.packages['node_modules/minimatch'].dev=false;},
 (a,l)=>{l.packages['node_modules/minimatch'].version='3.1.4';},
 (a,l)=>{l.packages['node_modules/minimatch'].integrity='changed';},
 a=>{a.vulnerabilities.minimatch.via[0].url='https://github.com/advisories/NEW';},
 a=>{a.vulnerabilities.minimatch.severity='high';},
 a=>{a.error={message:'registry failed'};},
 a=>{a.vulnerabilities.eslint.via=['unknown'];},
 a=>{a.vulnerabilities.eslint.via=['eslint'];},
 a=>{a.metadata.vulnerabilities.total=0;},
]){const a=fixture(),l=locked();mutate(a,l);assert.throws(()=>assessAudit(a,l,()=>{},now));checks++;}
assert.throws(()=>assessAudit(fixture(),locked(),()=>{},new Date(REVIEW.expiresAt)));checks++;
assert.throws(()=>assessAudit(fixture(),locked(),()=>{throw Error('source changed');},now));checks++;
assert.equal(assessAudit({metadata:{vulnerabilities:{total:0}},vulnerabilities:{}},locked(),()=>{},now).rawFindings,0);checks++;
verifyInstalledSource(root,'node_modules/minimatch');checks++;
const legacy=require('minimatch');
for(const pattern of ['**/../x','**/../**/../x','**/../**/../**/../x']){
 const baseline=new legacy.Minimatch(pattern),withOption=new legacy.Minimatch(pattern,{optimizationLevel:2});
 assert.deepEqual(withOption.set,baseline.set);assert.equal(withOption.globSet.length,1);checks+=2;
}
const modern=createRequire(require.resolve('@typescript-eslint/typescript-estree'))('minimatch');
assert(new modern.Minimatch('src/**/*.tsx',{dot:true}).match('src/app/page.tsx'));checks++;
assert(!new modern.Minimatch('src/**/*.tsx').match('outside/private.txt'));checks++;
(async()=>{
 const fs=require('node:fs');const os=require('node:os');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'summoner-glob-qa-'));
 try{
  fs.mkdirSync(path.join(dir,'nested'));fs.writeFileSync(path.join(dir,'nested','sample.txt'),'isolated tooling fixture');
  const {glob}=require('glob');
  assert.deepEqual(await glob('**/*.txt',{cwd:dir}),['nested/sample.txt']);checks++;
  const cancelled=new AbortController();cancelled.abort(new Error('bounded-tooling-check'));
  await assert.rejects(()=>glob('**/*',{cwd:dir,signal:cancelled.signal}));checks++;
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
 console.log(`AUDIT_REVIEW_TEST_PASS ${checks} source, negative-policy and patched tooling checks`);
})().catch(e=>{console.error(e);process.exitCode=1;});
