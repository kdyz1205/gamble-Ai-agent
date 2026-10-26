import type {Metadata} from "next";
import type {ReactNode} from "react";

export const metadata:Metadata={
  title:"SUM Web App — Your real Quest world",
  description:"Play Pico's chapter, create real Quests, invite friends, submit proof, and review verified results inside the SUM client.",
};

export default function SUMClientLayout({children}:{children:ReactNode}){
  return children;
}
