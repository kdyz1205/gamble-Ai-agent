import {advanceComposerOwner,type ComposerOwner} from './composer-owner';

/** Unsent first-message UI only. No requests, reviewed rules, receipts, media,
 * credentials or persistent browser storage belong in this memory. */
export interface ComposerUnsentInput {
  input:string;
  stake:string;
  opponentMode:'Invite only'|'Open match'|'Public pool';
  proofWindow:string;
  selectedStarter:string;
}
export interface ComposerInputLease { readonly generation:number; }
export interface ComposerInputMemory {
  observe:(accountId:string|null|undefined)=>void;
  read:(accountId:string|null)=>{lease:ComposerInputLease;value:ComposerUnsentInput|null};
  write:(accountId:string|null,lease:ComposerInputLease,value:ComposerUnsentInput)=>boolean;
  clear:(accountId:string|null,lease:ComposerInputLease)=>void;
}
function valid(value:ComposerUnsentInput):boolean {
  return !!value&&typeof value.input==='string'&&value.input.length<=128_000&&
    typeof value.stake==='string'&&value.stake.length<=32&&
    ['Invite only','Open match','Public pool'].includes(value.opponentMode)&&
    typeof value.proofWindow==='string'&&value.proofWindow.length<=80&&
    typeof value.selectedStarter==='string'&&value.selectedStarter.length<=100;
}
/** One instance per mounted root provider; never a module-global cross-user cache. */
export function createComposerInputMemory():ComposerInputMemory {
  let owner:ComposerOwner={accountId:undefined,generation:0};
  let value:ComposerUnsentInput|null=null;
  const observe=(accountId:string|null|undefined)=>{
    const next=advanceComposerOwner(owner,accountId);
    if(next.generation!==owner.generation)value=null;
    owner=next;
  };
  const current=(accountId:string|null,lease:ComposerInputLease)=>
    accountId===owner.accountId&&lease.generation===owner.generation;
  return {
    observe,
    read(accountId){
      observe(accountId);
      return {lease:{generation:owner.generation},value:value?{...value}:null};
    },
    write(accountId,lease,next){
      if(!current(accountId,lease))return false;
      if(!valid(next)){value=null;return false;}
      value=next.input.trim()||next.stake!=='0'||next.opponentMode!=='Invite only'||next.proofWindow!=='24 hours'
        ?{input:next.input,stake:next.stake,opponentMode:next.opponentMode,proofWindow:next.proofWindow,selectedStarter:next.selectedStarter}:null;
      return true;
    },
    clear(accountId,lease){if(current(accountId,lease))value=null;},
  };
}
