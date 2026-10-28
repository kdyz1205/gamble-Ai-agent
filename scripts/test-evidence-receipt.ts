import assert from 'node:assert/strict';
import {isConfirmedEvidenceSubmission} from '../src/lib/evidence-client';
const quest='synthetic_quest',owner='synthetic_owner';
const row={id:'synthetic_evidence',challengeId:quest,userId:owner,type:'text'};
let checks=0;
for(const value of [null,undefined,{},[],true,'ok',{evidence:null},{evidence:[]},{evidence:{}},{evidence:{...row,id:''}},{evidence:{...row,id:'   '}},{evidence:{...row,challengeId:'another_quest'}},{evidence:{...row,userId:'another_account'}},{evidence:{...row,id:42}}]){assert.equal(isConfirmedEvidenceSubmission(value,quest,owner),false);checks++;}
assert.equal(isConfirmedEvidenceSubmission({evidence:row},quest,undefined),false);checks++;
for(const type of ['text','photo','video']){assert.equal(isConfirmedEvidenceSubmission({evidence:{...row,type}},quest,owner),true);checks++;}
console.log(`EVIDENCE_RECEIPT_PASS ${checks} identity, persistence, malformed-body and valid media contracts`);
