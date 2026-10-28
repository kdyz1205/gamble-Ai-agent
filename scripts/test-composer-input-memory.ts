import assert from 'node:assert/strict';
import {createComposerInputMemory,type ComposerUnsentInput} from '../src/lib/composer-input-memory';
const input:ComposerUnsentInput={input:'Keep exactly: 中文 <rules> & "quotes"',stake:'17',opponentMode:'Invite only',proofWindow:'72 hours',selectedStarter:'move'};
let checks=0;
const equal=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
const memory=createComposerInputMemory();const guest=memory.read(null);equal(guest.value,null);equal(memory.write(null,guest.lease,input),true);
equal(memory.read(null).value,input);memory.observe(undefined);equal(memory.read(null).value,input);
memory.observe('A');const a=memory.read('A');equal(a.value,input);equal(memory.write(null,guest.lease,{...input,input:'stale guest'}),false);equal(memory.read('A').value,input);
const copy=memory.read('A').value!;copy.input='mutation';equal(memory.read('A').value,input);input.input='changed original reference';equal(memory.read('A').value?.input,'Keep exactly: 中文 <rules> & "quotes"');
memory.observe('B');equal(memory.read('B').value,null);equal(memory.write('A',a.lease,input),false);const b=memory.read('B');memory.write('B',b.lease,{...input,input:'Only B'});memory.observe('A');equal(memory.read('A').value,null);equal(memory.write('A',a.lease,input),false);
const newA=memory.read('A');memory.write('A',newA.lease,input);memory.observe(null);equal(memory.read(null).value,null);equal(memory.write('A',newA.lease,input),false);memory.observe('A');equal(memory.read('A').value,null);
const owner=memory.read('A');equal(memory.write('A',owner.lease,{...input,input:'',stake:'0',opponentMode:'Invite only',proofWindow:'24 hours'}),true);equal(memory.read('A').value,null);
equal(memory.write('A',owner.lease,{...input,input:'',stake:'3'}),true);equal(memory.read('A').value?.stake,'3');memory.clear('B',owner.lease);equal(memory.read('A').value?.stake,'3');memory.clear('A',owner.lease);equal(memory.read('A').value,null);
for(const bad of [{...input,input:'x'.repeat(128001)},{...input,stake:'x'.repeat(33)},{...input,proofWindow:'x'.repeat(81)},{...input,selectedStarter:'x'.repeat(101)},{...input,opponentMode:'invented'}]){equal(memory.write('A',owner.lease,bad as ComposerUnsentInput),false);equal(memory.read('A').value,null);}
const withExtra={...input,credentials:'NEVER_CACHE',draft:{readyToPublish:true},media:'NEVER_CACHE',receipt:'NEVER_CACHE'};
equal(memory.write('A',owner.lease,withExtra),true);equal(Object.keys(memory.read('A').value!).sort(),['input','opponentMode','proofWindow','selectedStarter','stake']);
equal(createComposerInputMemory().read('A').value,null);memory.clear('A',owner.lease);equal(memory.read('A').value,null);
console.log(`COMPOSER_INPUT_MEMORY_PASS ${checks} ownership, exact-text, bounded memory, no reviewed state and independent-root checks`);
