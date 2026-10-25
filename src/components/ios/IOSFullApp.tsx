"use client";

import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import QuizDuelScreen from "./QuizDuelScreen";
import {IosAction,IosArt,IosEmpty,IosFrame,IosIcon,visuals} from "./IOSAppUI";
import {ProfileScreen,AchievementsScreen,EvidenceScreen,StatsScreen,SettingsScreen} from "./IOSPersonalScreens";
import {TodayScreen} from "./IOSGameHome";
import {DiscoverScreen,CommunityScreen,PicosScreen} from "./IOSExploreScreens";
import {CreateScreen,QuestDetailScreen,QuestCreatedScreen,QuestCompleteScreen,EvidenceAddScreen} from "./IOSQuestScreens";

export const mobilePages = [
  "splash","onboarding","today","discover","create","quest-created","quest",
  "evidence-add","quest-complete","picos","quiz","profile","achievements",
  "evidence","stats","community","settings"
] as const;
export type MobilePage = typeof mobilePages[number];

const chapters = [
  {title:"A Kinder, Braver You",label:"A LITTLE MAGIC EVERY DAY",description:"Tiny daily Quests, real progress, and one very curious Familiar to cheer you on.",image:visuals.mascotHappy},
  {title:"Move · Create · Grow",label:"OPEN A WORLD OF POSSIBILITIES",description:"Choose what matters today. Create a Quest, ask a friend to join, and take the first real step.",image:visuals.portal},
  {title:"You Can Do It",label:"LITTLE STEPS MAKE A STORY",description:"Pico helps with clarity. The actions and the achievements are yours.",image:visuals.mascot},
] as const;

function OnboardingScreen() {
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
      <small>{chapter.label}</small><h1>{chapter.title}</h1><p>{chapter.description}</p>
      <div className="ios-onboard-dots" aria-label={"Introduction step "+(step+1)+" of 3"}>
        {chapters.map((_,i)=><span className={i===step?"is-active":""} key={i}/>)}
      </div>
      <button type="button" className="ios-primary" onClick={()=>step===2?finish():setStep(s=>s+1)}>
        {step===2?"Get Started":"Next"} <IosIcon name="arrow" size={18}/>
      </button>
      {step<2&&<button className="ios-text-action" type="button" onClick={finish}>Skip introduction</button>}
    </div>
  </IosFrame>;
}

function SplashScreen() {
  return <IosFrame withNav={false} tone="ios-splash">
    <div className="ios-splash__stars" aria-hidden="true">✦ · ✧ · ✦</div>
    <h1>Summoner.world</h1><p>Turn Your Dreams Into Daily Wins</p>
    <IosArt src={visuals.mascotHappy} alt="Pico flying through a world of glowing stars" priority/>
    <IosAction href="/app/onboarding">Open your world</IosAction>
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
    case "quest-created":return <QuestCreatedScreen id={questId}/>;
    case "quest":return <QuestDetailScreen id={questId}/>;
    case "evidence-add":return <EvidenceAddScreen id={questId}/>;
    case "quest-complete":return <QuestCompleteScreen id={questId}/>;
    case "picos":return <PicosScreen/>;
    case "quiz":return <QuizDuelScreen id={questId}/>;
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
