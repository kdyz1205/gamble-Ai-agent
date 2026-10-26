import type {Metadata} from "next";
import MarketingHome from "@/components/marketing/MarketingHome";

export const metadata:Metadata={
  title:"Summoner.world — Make Reality Summonable",
  description:"Discover Pico, learn how real-world Quests work and open the SUM Web App.",
};

/** The public website lives at the domain root; gameplay never renders here. */
export default function Home(){
  return <MarketingHome/>;
}
