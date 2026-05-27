import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const catalogPath = join(root, "docs", "universal-challenge-100.md");
const body = await readFile(catalogPath, "utf8");

const rows = body
  .split(/\r?\n/)
  .filter((line) => /^\|\s*\d+\s*\|/.test(line));

const failures = [];
if (rows.length !== 100) failures.push(`expected 100 rows, found ${rows.length}`);

const ids = new Set();
for (const row of rows) {
  const cells = row.split("|").map((cell) => cell.trim());
  const id = Number(cells[1]);
  const prompt = cells[2] ?? "";
  const judgePath = cells[3] ?? "";
  const proof = cells[4] ?? "";
  if (!Number.isInteger(id) || id < 1 || id > 100) failures.push(`bad id in row: ${row}`);
  if (ids.has(id)) failures.push(`duplicate id ${id}`);
  ids.add(id);
  if (prompt.length < 8) failures.push(`row ${id} missing prompt`);
  if (judgePath.length < 3) failures.push(`row ${id} missing judge path`);
  if (proof.length < 8) failures.push(`row ${id} missing required proof`);
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  rows: rows.length,
  judgePaths: [...new Set(rows.map((row) => row.split("|").map((cell) => cell.trim())[3]))].sort(),
}, null, 2));
