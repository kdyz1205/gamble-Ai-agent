/**
 * Produce reusable crop-only iOS illustrations from the existing authored
 * storybook art. Never retouch or overwrite the originals.
 *
 * The source plates contain pitch-deck captions around the edge; these crops
 * select the in-world subjects while keeping the app free of baked-in UI text.
 */
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const source = path.resolve(__dirname, "../public/storybook-premium");
const output = path.join(source, "ios-clean");
const crops = [
  ["hero2.webp", "pico-portal.webp", 40, 112, 405, 365],
  ["pico2.webp", "pico-companion.webp", 25, 58, 392, 337],
  ["hero1.webp", "dream-portal.webp", 125, 70, 328, 426],
  ["hero3.webp", "forest-familiar.webp", 135, 28, 370, 443],
  ["pico3.webp", "sleeping-familiar.webp", 25, 16, 375, 285],
  ["realm1.webp", "move-world.webp", 70, 23, 235, 170],
  ["realm2.webp", "create-world.webp", 71, 24, 231, 170],
  ["realm3.webp", "grow-world.webp", 70, 23, 235, 170],
  ["wide1.webp", "community-world.webp", 345, 0, 430, 265],
];

async function main() {
  fs.mkdirSync(output, { recursive: true });
  for (const [inputName, outputName, left, top, width, height] of crops) {
    const input = path.join(source, inputName);
    const meta = await sharp(input).metadata();
    if (left < 0 || top < 0 || left + width > meta.width || top + height > meta.height) {
      throw new Error("Crop exceeds original artwork: " + inputName);
    }
    const target = path.join(output, outputName);
    await sharp(input).extract({ left, top, width, height }).webp({ quality: 88, effort: 3 }).toFile(target);
    const generated = await sharp(target).metadata();
    if (generated.width !== width || generated.height !== height) throw new Error("Invalid output: " + target);
    process.stdout.write(outputName + ": " + width + "x" + height + "\n");
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
