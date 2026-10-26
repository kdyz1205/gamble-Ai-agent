"use client";

import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import QuizDuelScreen from "./QuizDuelScreen";
import {SumText,useSumLanguage} from "@/components/locale/SumLanguage";
import PicoStoryChapter from "./PicoStoryChapter";
import IOSQuestJoin from "./IOSQuestJoin";
import {IosAction,IosArt,IosEmpty,IosFrame,IosIcon,visuals} from "./IOSAppUI";
import {ProfileScreen,AchievementsScreen,EvidenceScreen,StatsScreen,SettingsScreen} from "./IOSPersonalScreens";
import {TodayScreen} from "./IOSGameHome";
import {DiscoverScreen,CommunityScreen,PicosScreen} from "./IOSExploreScreens";
import {CreateScreen,QuestDetailScreen,QuestCreatedScreen,QuestCompleteScreen,EvidenceAddScreen} from "./IOSQuestScreens";

export const mobilePages = [
  "splash","onboarding","today","discover","create","join","quest-created","quest",
  "evidence-add","quest-complete","picos","quiz","story","profile","achievements",
  "evidence","stats","community","settings"
] as const;
export type MobilePage = typeof mobilePages[number];

const chapters = [
  {title:"A Kinder, Braver You",zhTitle:"一个更勇敢的你",label:"A LITTLE MAGIC EVERY DAY",zhLabel:"每天一点小小的魔法",description:"Tiny daily Quests, real progress, and one very curious Familiar to cheer you on.",zhDescription:"从每天的小 Quest 开始，感受真实的进步。Pico 会一直陪伴你。",image:visuals.mascotHappy},
  {title:"Move · Create · Grow",zhTitle:"行动 · 创造 · 成长",label:"OPEN A WORLD OF POSSIBILITIES",zhLabel:"打开更多可能",description:"Choose what matters today. Create a Quest, ask a friend to join, and take the first real step.",zhDescription:"选一个你在乎的目标，建立 Quest，邀请朋友，一起开始行动。",image:visuals.portal},
  {title:"You Can Do It",zhTitle:"你可以做到",label:"LITTLE STEPS MAKE A STORY",zhLabel:"让每一步成为故事",description:"Pico helps with clarity. The actions and the achievements are yours.",zhDescription:"Pico 帮你理清目标。每一步行动与每一份成果都属于你。",image:visuals.mascot},
] as const;

function OnboardingScreen() {
  const language=useSumLanguage();
  const router=useRouter();
  const [step,setStep]=useState(0);
  const finish=()=>{
    try{localStorage.setItem("sum-ios-onboarding-complete","true");}catch{}
    // Match the server first-launch route without depending on hydration at /app.
    document.cookie="sum-ios-onboarding-complete=true; Path=/; Max-Age=31536000; SameSite=Lax";
    router.push("/app/today");
  };
  const chapter=chapters[step];
  return <IosFrame withNav={false} tone="ios-onboarding">
    <div className="ios-onboard-art">
      <IosArt src={chapter.image} alt={step === 1 ? "A friendly Familiar by a glowing garden portal" : "Pico, your Quest companion"} priority/>
      <span>SUMMONER.WORLD</span>
    </div>
    <div className="ios-onboard-copy">
      <small>{language==="zh"?chapter.zhLabel:chapter.label}</small><h1>{language==="zh"?chapter.zhTitle:chapter.title}</h1><p>{language==="zh"?chapter.zhDescription:chapter.description}</p>
      <div className="ios-onboard-dots" aria-label={"Introduction step "+(step+1)+" of 3"}>
        {chapters.map((_,i)=><span className={i===step?"is-active":""} key={i}/>)}
      </div>
      <button type="button" className="ios-primary" onClick={()=>step===2?finish():setStep(s=>s+1)}>
        {step===2?<SumText en="Get Started" zh="开始冒险"/>:<SumText en="Next" zh="下一步"/>} <IosIcon name="arrow" size={18}/>
      </button>
      {step<2&&<button className="ios-text-action" type="button" onClick={finish}><SumText en="Skip introduction" zh="跳过介绍"/></button>}
    </div>
  </IosFrame>;
}

function SplashScreen() {
  return <IosFrame withNav={false} tone="ios-splash">
    <div className="ios-splash__stars" aria-hidden="true">✦ · ✧ · ✦</div>
    <h1>Summoner.world</h1><p><SumText en="Turn Your Dreams Into Daily Wins" zh="让梦想变成每天的真实进步"/></p>
    <IosArt src={visuals.mascotHappy} alt="Pico flying through a world of glowing stars" priority/>
    <IosAction href="/app/onboarding"><SumText en="Open your world" zh="进入你的世界"/></IosAction>
    <p className="ios-splash__note">Move · Create · Grow</p>
  </IosFrame>;
}

/** Routes are real React pages, not static pictures of an app. */
export default function IOSFullApp({view,questId,seed}:{
  view: string; questId?:string; seed?:string;
}) {
  switch(view){
    case "splash":return <SplashScreen/>;
    case "onboarding":return <OnboardingScreen/>;
    case "today":return <TodayScreen/>;
    case "discover":return <DiscoverScreen/>;
    case "create":return <CreateScreen seed={seed}/>;
    case "join":return <IOSQuestJoin id={questId}/>;
    case "quest-created":return <QuestCreatedScreen id={questId}/>;
    case "quest":return <QuestDetailScreen id={questId}/>;
    case "evidence-add":return <EvidenceAddScreen id={questId}/>;
    case "quest-complete":return <QuestCompleteScreen id={questId}/>;
    case "picos":return <PicosScreen/>;
    case "quiz":return <QuizDuelScreen id={questId}/>;
    case "story":return <PicoStoryChapter/>;
    case "profile":return <ProfileScreen/>;
    case "achievements":return <AchievementsScreen/>;
    case "evidence":return <EvidenceScreen/>;
    case "stats":return <StatsScreen/>;
    case "community":return <CommunityScreen/>;
    case "settings":return <SettingsScreen/>;
    default:return <IosFrame title="Not found" eyebrow="BACK TO YOUR WORLD">
      <IosEmpty heading="This world doesn't exist." description="Choose a real destination to continue." action="Go home" href="/app/today"/>
    </IosFrame>;
  }
}

export function IOSAppEntry() {
  const router=useRouter();
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    try {
      if(localStorage.getItem("sum-ios-onboarding-complete")!=="true"){
        router.replace("/app/onboarding");return;
      }
    }catch {}
    setReady(true);
  },[router]);
  return ready?<TodayScreen/>:<IosFrame withNav={false} tone="ios-splash">
    <h1>Summoner.world</h1>
    <IosArt src={visuals.mascotHappy} alt="Pico opening your world"/>
    <p role="status">Opening your world…</p>
  </IosFrame>;
}
