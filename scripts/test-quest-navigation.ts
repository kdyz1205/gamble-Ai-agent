import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SceneMobileNav from "../src/components/scene/SceneMobileNav";
import SceneShell from "../src/components/scene/SceneShell";
import QuestAppNav from "../src/components/QuestAppNav";
import { sceneRoutes } from "../src/lib/scene/scene-routes";
import { matchesQuestView, questNextStep, questView } from "../src/components/quests/quest-list-model";
import type { ChallengeData } from "../src/lib/api-client";

assert.deepEqual(sceneRoutes.map(route => route.href), ["/summons", "/quests", "/quests?view=proof", "/quests?view=results", "/me"]);
for (const active of ["/quests", "/quests?view=proof", "/quests?view=results"]) {
  const html = renderToStaticMarkup(createElement(SceneMobileNav, { active }));
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  assert(html.includes(`href="${active.replaceAll("&", "&amp;")}"`));
  assert(!/\/demo|\/contracts\/bind/.test(html));
  assert.equal((html.match(/<a /g) ?? []).length, 5);
}
console.log("PASS actual navigation renders five real routes with exact query-specific active selection");
const bareAppDock = renderToStaticMarkup(createElement(QuestAppNav));
assert(bareAppDock.includes('aria-label="App navigation"'), "app dock must handle a missing Next pathname during server rendering");
console.log("PASS mobile app dock tolerates unavailable router context without throwing");
const composerShell = renderToStaticMarkup(createElement(SceneShell, {activePath:"/summons"}, "Quest creation content"));
assert(composerShell.includes('data-testid="scene-transition-shell"'),"composer must keep readable animated content shell");
assert(composerShell.includes("Quest creation content"),"animated shell must render the real form children");
console.log("PASS reliable composer retains scene-transition shell with readable children");

const states = ["draft", "open", "live", "judging", "disputed", "pending_settlement", "settled", "cancelled", "unknown"];
const quests = states.map(status => ({ status } as ChallengeData));
assert.deepEqual(quests.filter(quest => matchesQuestView(quest, "proof")).map(quest => quest.status), ["live", "judging"]);
assert.deepEqual(quests.filter(quest => matchesQuestView(quest, "results")).map(quest => quest.status), ["disputed", "pending_settlement", "settled", "cancelled"]);
assert.equal(quests.filter(quest => matchesQuestView(quest, "all")).length, states.length);
assert.match(questNextStep(quests[4]), /awaits player agreement or human review/);
assert.match(questNextStep(quests[5]), /Settlement is pending/);
assert.match(questNextStep(quests[6]), /result receipt/);
assert.match(questNextStep(quests[8]), /latest status/);
assert.equal(questView("demo"), "all");
assert.equal(questView(null), "all");
console.log("PASS active proof and pending/completed result filters retain distinct lifecycle meaning and unknown-state fallback");
