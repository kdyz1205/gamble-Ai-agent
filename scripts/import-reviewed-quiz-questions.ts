/**
 * Operator-only ingestion of independently reviewed signed question rows.
 * Staging ONLY: refuses production and any path inside the repository.
 * No embedded answer bank or signing key is ever shipped to browser clients.
 *
 * Usage in a permitted isolated environment:
 *   DATABASE_URL=postgresql://.../summoner_verification
 *   QUIZ_PROTECTED_REVIEW_PUBLIC_KEY=<external reviewer Ed25519 public PEM>
 *   node --import tsx scripts/import-reviewed-quiz-questions.ts /external/reviewed-bank.json
 *
 * The input file is independently signed by the reviewer; this importer
 * verifies, but DOES NOT create, signatures or overwrite an existing question.
 */
import "dotenv/config";
import {readFile,stat} from "node:fs/promises";
import {isAbsolute,relative,resolve} from "node:path";
import prisma from "../src/lib/db";
import {
  reviewProtectedQuestion,MIN_REVIEWED_QUESTIONS_PER_TOPIC,
} from "../src/lib/quiz/protected-quiz-bank";

async function run(){
  const url=new URL(process.env.DATABASE_URL||"postgresql://missing");
  if(!["localhost","127.0.0.1"].includes(url.hostname)||
     url.pathname!=="/summoner_verification")
    throw Error("Protected Quiz import is allowed only into isolated verification Postgres");
  const file=process.argv[2];
  if(!file||!isAbsolute(file))throw Error("External absolute input filename required");
  const resolved=resolve(file);
  const inside=relative(process.cwd(),resolved);
  if(inside===""||(!inside.startsWith("..")&&!isAbsolute(inside)))
    throw Error("Reviewed answers cannot be read from a repository file");
  const info=await stat(resolved);
  if(!info.isFile()||info.size>2_000_000)
    throw Error("Reviewed input must be a bounded, regular external file");
  const raw=JSON.parse(await readFile(resolved,"utf8")) as unknown;
  if(!Array.isArray(raw)||raw.length<MIN_REVIEWED_QUESTIONS_PER_TOPIC||
     raw.length>5000)
    throw Error("Reviewed protected bank export is absent or incomplete");
  const seen=new Set<string>(),groups=new Map<string,number>();
  const data=raw.map((entry:unknown)=>{
    if(!entry||typeof entry!=="object"||Array.isArray(entry))
      throw Error("Invalid independently signed review entry");
    const x=entry as Record<string,unknown>;
    if(typeof x.reviewedAt!=="string"||typeof x.reviewSignature!=="string"||
       !Array.isArray(x.choices)||typeof x.id!=="string")
      throw Error("Missing signed source metadata");
    const verified=reviewProtectedQuestion({
      id:x.id,bankVersion:x.bankVersion as string,
      topic:x.topic as string,prompt:x.prompt as string,
      choicesJson:JSON.stringify(x.choices),
      answerIndex:x.answerIndex as number,
      reviewSignature:x.reviewSignature,
      reviewedAt:new Date(x.reviewedAt),retiredAt:null,
    });
    if(seen.has(verified.spec.id))throw Error("Duplicate approved question identity");
    seen.add(verified.spec.id);
    const key=verified.spec.bankVersion+"::"+verified.spec.topic;
    groups.set(key,(groups.get(key)||0)+1);
    return {
      id:verified.spec.id,bankVersion:verified.spec.bankVersion,
      topic:verified.spec.topic,prompt:verified.spec.prompt,
      choicesJson:JSON.stringify(verified.spec.choices),
      answerIndex:verified.spec.answerIndex,
      reviewSignature:x.reviewSignature,
      reviewedAt:new Date(verified.spec.reviewedAt),
    };
  });
  if([...groups.values()].some(n=>n<MIN_REVIEWED_QUESTIONS_PER_TOPIC))
    throw Error("Each topic must have at least 96 independently signed rows");
  const result=await prisma.quizProtectedQuestion.createMany({data,
    skipDuplicates:false});
  if(result.count!==data.length)
    throw Error("Protected bank import did not commit an exact immutable set");
  console.log("PROTECTED_BANK_IMPORT_PASS",result.count,
    "reviewed questions across",groups.size,"bank-version/topic partitions");
}
run().catch(error=>{
  console.error("PROTECTED_BANK_IMPORT_ABORTED",
    error instanceof Error?error.message:"Unknown import failure");
  process.exitCode=1;
}).finally(async()=>{await prisma.$disconnect();});
