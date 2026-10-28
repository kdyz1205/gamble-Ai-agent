/** Guest-to-login may retain an intentional local draft. Leaving a known account
 * must create a new editor generation, including A -> B -> A transitions. */
export type ComposerOwner={accountId:string|null|undefined;generation:number};
export function advanceComposerOwner(previous:ComposerOwner,next:string|null|undefined):ComposerOwner {
  if(next===undefined||next===previous.accountId)return previous;
  return {accountId:next,generation:previous.generation+(typeof previous.accountId==='string'?1:0)};
}
