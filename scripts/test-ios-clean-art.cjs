/**
 * Verify every artwork reference shipped to the iOS React/Capacitor UI is a
 * real, reasonably sized image with the exact reviewed crop dimensions.
 * This is a build-time check, not an AI-generated screenshot test.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const ts = require("typescript");

const expected = {
  mascot: ["pico-companion.webp", 392, 337],
  mascotHappy: ["pico-portal.webp", 405, 365],
  portal: ["dream-portal.webp", 270, 345],
  move: ["move-world.webp", 235, 170],
  create: ["create-world.webp", 231, 170],
  grow: ["grow-world.webp", 223, 170],
  sky: ["sleeping-familiar.webp", 375, 285],
  adventure: ["forest-familiar.webp", 370, 443],
  landscape: ["community-world.webp", 395, 265],
};

async function main() {
  const root = path.resolve(__dirname, "..");
  const ui = fs.readFileSync(path.join(root, "src/components/ios/IOSAppUI.tsx"), "utf8");
  const screens = fs.readFileSync(path.join(root, "src/components/ios/IOSExploreScreens.tsx"), "utf8");
  const style = fs.readFileSync(path.join(root, "src/app/ios-app.css"), "utf8");
  for (const [key, [name, width, height]] of Object.entries(expected)) {
    const url = "/storybook-premium/ios-clean/" + name;
    assert.ok(ui.includes(key + ': "' + url + '"'), key + " must use the reviewed image");
    const file = path.join(root, "public/storybook-premium/ios-clean", name);
    assert.ok(fs.existsSync(file), "Missing " + file);
    const meta = await sharp(file).metadata();
    assert.equal(meta.format, "webp", name + " must remain webp");
    assert.deepEqual([meta.width, meta.height], [width, height], name + " has incorrect crop dimensions");
    assert.ok(fs.statSync(file).size < 110_000, name + " exceeds lightweight image budget");
  }
  // Inspect the actual loading component's label, allowing reviewed localized
  // expressions without relaxing the requirement to render live placeholders.
  const parsed = ts.createSourceFile("IOSExploreScreens.tsx", screens, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const loadingLabels = [];
  const visit = node => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(parsed) === "IOSLoadingCards") {
      const label = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.text === "label");
      if (label?.initializer && ts.isJsxExpression(label.initializer)) {
        const expression = label.initializer.expression;
        if (expression && ts.isCallExpression(expression) && expression.expression.getText(parsed) === "translated") {
          const [, en, zh] = expression.arguments;
          if (en && zh && ts.isStringLiteral(en) && ts.isStringLiteral(zh)) loadingLabels.push([en.text, zh.text]);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.ok(loadingLabels.some(([en,zh]) => en === "Finding public Quests…" && zh === "正在寻找公开 Quest…"), "Quest loading placeholders remain bilingual");
  assert.ok(loadingLabels.some(([en,zh]) => en === "Loading public community activity…" && zh === "正在读取公开社区动态…"), "Community loading placeholders remain bilingual");
  assert.ok(style.includes(".ios-loading-card__thumbnail"), "Real placeholder styling");
  console.log("IOS_CLEAN_ART_PASS", Object.keys(expected).length, "assets, 2 live loading states");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
