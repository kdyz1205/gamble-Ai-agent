import assert from 'node:assert/strict';
import {discoverySelection,discoveryHref,questReturnTo,questRoute} from '../src/lib/quest-navigation-context';
let checks=0;
for(const value of [undefined,null,{},[],42,'','https://example.invalid/','//example.invalid','/\\example.invalid','/app/quest?id=loop','/api/auth/signout','/app/discover/../quest','/app/discover\u0000','/app/%64iscover','/%2fexample.invalid','/app/discover?'+ 'x'.repeat(1401)]){assert.equal(questReturnTo(value),null,String(value));checks++;}
for(const value of ['/app/today','/app/discover','/app/community','/app/evidence','/app/profile','/quests']){assert.equal(questReturnTo(value),value);checks++;}
assert.equal(questReturnTo('/app/discover?category=move&q=羽毛球&token=private&returnTo=https://evil.invalid#quest-safe_42'),'/app/discover?category=move&q=%E7%BE%BD%E6%AF%9B%E7%90%83#quest-safe_42');checks++;
assert.equal(questReturnTo('/app/community?auth=private#quest-safe_42'),'/app/community#quest-safe_42');checks++;
assert.equal(questReturnTo('/app/discover#javascript:bad'),'/app/discover');checks++;
assert.equal(questReturnTo('/quests?view=proof&next=/api/auth/signout'),'/quests?view=proof');checks++;
assert.equal(questReturnTo('/quests?view=unknown'),'/quests');checks++;
for(const category of ['all','move','create','grow','unknown']){
 const href=discoveryHref(category,'a & b 中文');const parsed=discoverySelection(new URL(href,'https://sum.invalid').searchParams);
 assert.equal(parsed.query,'a & b 中文');assert.equal(parsed.category,category==='unknown'?'all':category);checks+=2;
}
assert.equal(discoverySelection(new URLSearchParams({q:'x'.repeat(1000)})).query.length,160);checks++;
assert.equal(discoveryHref('all',''),'/app/discover');checks++;
assert.equal(discoverySelection(new URLSearchParams({q:'a\n\tb\0'})).query,'ab');checks++;
assert.equal(questRoute('quest','id /?','//evil.invalid'),'/app/quest?id=id+%2F%3F');checks++;
const detail=new URL(questRoute('quest','safe_id',discoveryHref('move','original text')),'https://sum.invalid');assert.equal(detail.searchParams.get('returnTo'),'/app/discover?category=move&q=original+text');checks++;
for(const view of ['join','evidence-add','quest-complete'] as const){const next=new URL(questRoute(view,'safe_id',detail.searchParams.get('returnTo')),'https://sum.invalid');assert.equal(next.searchParams.get('returnTo'),detail.searchParams.get('returnTo'));checks++;}
console.log(`QUEST_NAV_CONTEXT_PASS ${checks} bounded query, origin allowlist, nested redirect, encoding and continuity checks`);
