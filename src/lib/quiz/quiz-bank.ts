/**
 * Deterministic, manually reviewed, server-owned knowledge Quiz bank.
 *
 * For this zero-stake pilot the answers are stored in application source;
 * anyone with repository access could discover them. Therefore NEVER use
 * this bank for cash-equivalent or purchased-credit wagers. An anti-cheat
 * production service needs protected questions / verifiable external oracle.
 */
import {createHash,randomInt} from "node:crypto";

export const QUIZ_RULE_VERSION="quiz-curated-mcq-v1";
export const QUIZ_QUESTION_COUNT=3;
export const QUIZ_TOPICS=["general","technology","science","sports","math"] as const;
export type QuizTopic=(typeof QUIZ_TOPICS)[number];
export type PublicQuizQuestion={
  id:string;prompt:string;choices:readonly [string,string,string,string];
};
type QuizQuestion=PublicQuizQuestion&{topic:QuizTopic;answer:number};

const QUESTIONS:readonly QuizQuestion[]=[
  {id:"gen-01",topic:"general",prompt:"How many days are in a leap year? 闰年有多少天？",choices:["364","365","366","367"],answer:2},
  {id:"gen-02",topic:"general",prompt:"Which continent contains Egypt? 埃及位于哪个大洲？",choices:["Europe 欧洲","Africa 非洲","Asia 亚洲","Oceania 大洋洲"],answer:1},
  {id:"gen-03",topic:"general",prompt:"How many sides does a hexagon have? 六边形有几条边？",choices:["5","6","7","8"],answer:1},
  {id:"gen-04",topic:"general",prompt:"Which is the largest ocean? 哪个大洋面积最大？",choices:["Pacific 太平洋","Atlantic 大西洋","Indian 印度洋","Arctic 北冰洋"],answer:0},
  {id:"gen-05",topic:"general",prompt:"How many minutes are in two hours? 两小时有几分钟？",choices:["60","100","120","180"],answer:2},
  {id:"gen-06",topic:"general",prompt:"Which instrument measures temperature? 哪种仪器测量温度？",choices:["Barometer 气压计","Thermometer 温度计","Altimeter 高度计","Speedometer 速度计"],answer:1},
  {id:"tech-01",topic:"technology",prompt:"What does CPU stand for? CPU 的英文全称是？",choices:["Central Processing Unit","Computer Power Utility","Control Program Unit","Core Processing User"],answer:0},
  {id:"tech-02",topic:"technology",prompt:"Which number base does hexadecimal use? 十六进制使用几进位？",choices:["2","8","10","16"],answer:3},
  {id:"tech-03",topic:"technology",prompt:"Which protocol typically secures web traffic? 哪种协议常用于加密网页流量？",choices:["FTP","HTTP without TLS","HTTPS","Telnet"],answer:2},
  {id:"tech-04",topic:"technology",prompt:"What is the binary representation of decimal five? 十进制 5 对应的二进制是？",choices:["101","110","111","100"],answer:0},
  {id:"tech-05",topic:"technology",prompt:"Which structure follows FIFO? 哪种结构先进先出？",choices:["Stack 栈","Queue 队列","Tree 树","Heap 堆"],answer:1},
  {id:"tech-06",topic:"technology",prompt:"How many bits are in a byte? 一个字节通常有多少位？",choices:["4","8","16","32"],answer:1},
  {id:"sci-01",topic:"science",prompt:"What is the chemical symbol for oxygen? 氧元素的符号是？",choices:["Ox","O","O2","Og"],answer:1},
  {id:"sci-02",topic:"science",prompt:"At sea level, water boils near what Celsius temperature? 海平面水的沸点约为？",choices:["0°C","50°C","100°C","150°C"],answer:2},
  {id:"sci-03",topic:"science",prompt:"Which planet is nearest the Sun? 距太阳最近的行星是？",choices:["Earth 地球","Venus 金星","Mercury 水星","Mars 火星"],answer:2},
  {id:"sci-04",topic:"science",prompt:"Which organ pumps blood? 哪个器官负责泵血？",choices:["Lung 肺","Heart 心脏","Liver 肝脏","Kidney 肾脏"],answer:1},
  {id:"sci-05",topic:"science",prompt:"Which particle has a negative electric charge? 哪种粒子带负电？",choices:["Proton 质子","Neutron 中子","Electron 电子","Photon 光子"],answer:2},
  {id:"sci-06",topic:"science",prompt:"What is the SI unit of force? 力的国际单位是？",choices:["Watt 瓦","Joule 焦","Newton 牛顿","Pascal 帕"],answer:2},
  {id:"sports-01",topic:"sports",prompt:"In badminton, what is the object hit by a racket called? 羽毛球运动中击打的球叫？",choices:["Shuttlecock 羽毛球","Puck 冰球","Disc 铁饼","Bowling ball 保龄球"],answer:0},
  {id:"sports-02",topic:"sports",prompt:"How many players are on court in badminton singles? 羽毛球单打场上共有几位选手？",choices:["1","2","3","4"],answer:1},
  {id:"sports-03",topic:"sports",prompt:"How many points is a free throw worth in basketball? 篮球罚球命中得几分？",choices:["1","2","3","4"],answer:0},
  {id:"sports-04",topic:"sports",prompt:"Which sport uses the term checkmate? 哪项运动使用将死一词？",choices:["Chess 国际象棋","Golf 高尔夫","Tennis 网球","Baseball 棒球"],answer:0},
  {id:"sports-05",topic:"sports",prompt:"Which event is usually 42.195 km long? 哪项赛事距离为 42.195 公里？",choices:["Half marathon 半马","Marathon 马拉松","5K 跑","Sprint 短跑"],answer:1},
  {id:"sports-06",topic:"sports",prompt:"How many rings are in the Olympic symbol? 奥运五环有几个环？",choices:["4","5","6","7"],answer:1},
  {id:"math-01",topic:"math",prompt:"What is 7 × 8? 7 乘 8 等于多少？",choices:["54","56","58","64"],answer:1},
  {id:"math-02",topic:"math",prompt:"What is the derivative of x²? x² 的导数是？",choices:["x","2x","x³","2"],answer:1},
  {id:"math-03",topic:"math",prompt:"What is 3² + 4²? 3² 加 4² 等于？",choices:["12","25","49","7"],answer:1},
  {id:"math-04",topic:"math",prompt:"What is the square root of 144? 144 的平方根主值是？",choices:["10","11","12","14"],answer:2},
  {id:"math-05",topic:"math",prompt:"How many degrees are in a triangle? 三角形内角和是多少？",choices:["90","180","270","360"],answer:1},
  {id:"math-06",topic:"math",prompt:"What is 15% of 200? 200 的 15% 是多少？",choices:["15","20","30","35"],answer:2},
];
const LOOKUP=new Map(QUESTIONS.map(q=>[q.id,q]));
const OPTIONS=4;
if(LOOKUP.size!==QUESTIONS.length)throw Error("Quiz question IDs collide");

export function assertQuizTopic(value:unknown):QuizTopic{
  if(typeof value!=="string"||!QUIZ_TOPICS.includes(value as QuizTopic))
    throw new RangeError("Unknown Quiz topic");
  return value as QuizTopic;
}
/** The spoken phrase is only a proposed topic. User must confirm Create. */
export function topicFromDescription(description:string):QuizTopic{
  const t=description.toLowerCase();
  if(/badminton|tennis|basketball|football|sports|羽毛球|运动|体育|篮球/.test(t))return "sports";
  if(/mathemat|calculus|积分|数学|统计|代数/.test(t))return "math";
  if(/biology|chemistry|physics|science|化学|科学|物理|生物/.test(t))return "science";
  if(/program|code|ai|software|computer|机器人|编程|人工智能|计算机|技术/.test(t))return "technology";
  return "general";
}
export function chooseQuestionIds(topic:QuizTopic):string[]{
  const pool=QUESTIONS.filter(q=>q.topic===assertQuizTopic(topic)).map(q=>q.id);
  if(pool.length<QUIZ_QUESTION_COUNT)throw Error("Insufficient reviewed questions");
  // Fisher-Yates using cryptographically strong randomness. Quiz stakes zero.
  for(let i=pool.length-1;i>0;i--){
    const j=randomInt(i+1);
    [pool[i],pool[j]]=[pool[j],pool[i]];
  }
  return pool.slice(0,QUIZ_QUESTION_COUNT);
}
export function assertQuestionIds(ids:unknown):string[]{
  if(!Array.isArray(ids)||ids.length!==QUIZ_QUESTION_COUNT||
     ids.some(id=>typeof id!=="string"||!LOOKUP.has(id))||
     new Set(ids).size!==QUIZ_QUESTION_COUNT)
    throw new RangeError("Invalid sealed Quiz question set");
  const kinds=new Set(ids.map(id=>LOOKUP.get(id)!.topic));
  if(kinds.size!==1)throw new RangeError("Quiz mixes incompatible topics");
  return ids as string[];
}
export function publicQuizQuestions(ids:readonly string[]):PublicQuizQuestion[]{
  return assertQuestionIds([...ids]).map(id=>{
    const q=LOOKUP.get(id)!;
    return {id:q.id,prompt:q.prompt,choices:q.choices};
  });
}
export function assertQuizAnswers(raw:unknown):number[]{
  if(!Array.isArray(raw)||raw.length!==QUIZ_QUESTION_COUNT||
     raw.some(n=>!Number.isSafeInteger(n)||n<0||n>=OPTIONS))
    throw new RangeError("Submit exactly three answer choices numbered 0 through 3");
  return raw as number[];
}
export function scoreQuizAnswers(ids:readonly string[],answers:readonly number[]):number{
  const items=assertQuestionIds([...ids]);
  assertQuizAnswers([...answers]);
  return items.reduce((sum,id,i)=>sum+Number(LOOKUP.get(id)!.answer===answers[i]),0);
}
const digest=(data:unknown)=>createHash("sha256").update(JSON.stringify(data)).digest("hex");
/** Commitment is disclosed at creation and opened ONLY after resolution. */
export function answerCommitment(ids:readonly string[]):string{
  const questionIds=assertQuestionIds([...ids]);
  return digest({version:QUIZ_RULE_VERSION,
    answers:questionIds.map(id=>({id,answer:LOOKUP.get(id)!.answer}))});
}
export function revealQuizAnswers(ids:readonly string[]){
  return assertQuestionIds([...ids]).map(id=>({id,answer:LOOKUP.get(id)!.answer}));
}
export function quizAnswerDigest(answers:readonly number[]):string{
  return digest({version:QUIZ_RULE_VERSION,answers:assertQuizAnswers([...answers])});
}
