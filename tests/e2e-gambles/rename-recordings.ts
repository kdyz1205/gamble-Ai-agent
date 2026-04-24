/**
 * Playwright writes videos with opaque hash filenames (page@<hash>.webm).
 * This helper renames each gamble-NN folder's videos to player_a.webm and
 * player_b.webm based on creation-time order, since our harness always
 * creates ctxA before ctxB.
 *
 * Run after the full harness completes, before committing.
 */
import fs from "fs";
import path from "path";

const RECORDINGS_DIR = path.resolve(__dirname, "..", "..", "gambles-recordings");

function renameOneGambleFolder(folder: string) {
  const full = path.join(RECORDINGS_DIR, folder);
  const webms = fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".webm"))
    .map((f) => ({ name: f, ctime: fs.statSync(path.join(full, f)).birthtimeMs || fs.statSync(path.join(full, f)).ctimeMs }))
    .sort((a, b) => a.ctime - b.ctime);

  if (webms.length < 2) {
    console.log(`[skip] ${folder}: only ${webms.length} video(s)`);
    return;
  }
  if (webms[0].name === "player_a.webm" && webms[1].name === "player_b.webm") {
    console.log(`[skip] ${folder}: already renamed`);
    return;
  }

  // Rename oldest-first → player_a, youngest-first → player_b (matches
  // helper's ctxA-first creation order).
  const [first, second] = webms;
  const tmpA = path.join(full, `__tmp_a__${Date.now()}.webm`);
  const tmpB = path.join(full, `__tmp_b__${Date.now()}.webm`);
  fs.renameSync(path.join(full, first.name), tmpA);
  fs.renameSync(path.join(full, second.name), tmpB);
  fs.renameSync(tmpA, path.join(full, "player_a.webm"));
  fs.renameSync(tmpB, path.join(full, "player_b.webm"));
  console.log(`[ok] ${folder}: renamed 2 videos`);
}

function main() {
  if (!fs.existsSync(RECORDINGS_DIR)) {
    console.log("no recordings directory");
    return;
  }
  const folders = fs
    .readdirSync(RECORDINGS_DIR)
    .filter((f) => /^gamble-\d{2}$/.test(f))
    .sort();
  for (const f of folders) {
    renameOneGambleFolder(f);
  }
}

main();
