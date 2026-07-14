/**
 * Rename the two WebM videos in gambles-recordings/neon-NN/ to
 * player_a.webm / player_b.webm. Same approach as rename-recordings.ts
 * but scoped to the neon-* folders so the Supabase batch isn't touched.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..", "..", "gambles-recordings");

function renameOne(folder: string) {
  const full = path.join(ROOT, folder);
  const webms = fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".webm"))
    .map((f) => ({ name: f, ctime: fs.statSync(path.join(full, f)).birthtimeMs || fs.statSync(path.join(full, f)).ctimeMs }))
    .sort((a, b) => a.ctime - b.ctime);

  if (webms.length < 2) {
    console.log(`[skip] ${folder}: only ${webms.length} video(s)`);
    return;
  }
  if (webms.some((w) => w.name === "player_a.webm" || w.name === "player_b.webm")) {
    console.log(`[skip] ${folder}: already has player_{a,b}.webm`);
    return;
  }
  const [first, second] = webms;
  const tmpA = path.join(full, `__tmp_a__${Date.now()}.webm`);
  const tmpB = path.join(full, `__tmp_b__${Date.now()}.webm`);
  fs.renameSync(path.join(full, first.name), tmpA);
  fs.renameSync(path.join(full, second.name), tmpB);
  fs.renameSync(tmpA, path.join(full, "player_a.webm"));
  fs.renameSync(tmpB, path.join(full, "player_b.webm"));
  console.log(`[ok] ${folder}`);
}

for (const f of fs.readdirSync(ROOT).filter((f) => /^neon-\d{2}$/.test(f))) {
  renameOne(f);
}
