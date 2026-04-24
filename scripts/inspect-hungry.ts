/**
 * Short inspection script: surface the "I'm so hungry" / "我好饿啊" style
 * challenges so we can see whether the agent let nonsense through, and what
 * fields they have. The user reported that clicking these leads to 404 AND
 * that the judge rule is not populated — both are agent/validation bugs.
 */
import "dotenv/config";
import { config as dotenvLocal } from "dotenv";
dotenvLocal({ path: ".env.local" });
import prisma from "../src/lib/db";

async function main() {
  const rows = await prisma.challenge.findMany({
    where: {
      OR: [
        { title: { contains: "hungry", mode: "insensitive" } },
        { title: { contains: "好饿" } },
        { title: { contains: "吃" } },
      ],
    },
    select: {
      id: true,
      title: true,
      proposition: true,
      rules: true,
      status: true,
      isPublic: true,
      visibility: true,
      type: true,
      stake: true,
      evidenceType: true,
      createdAt: true,
      creator: { select: { username: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  console.log(`Found ${rows.length} matching challenges:\n`);
  for (const r of rows) {
    console.log(JSON.stringify(r, null, 2));
    console.log("---");
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
