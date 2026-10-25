import IOSFullApp from "@/components/ios/IOSFullApp";

const mobilePages = ["splash","onboarding","today","discover","create","join","quest-created","quest","evidence-add","quest-complete","picos","quiz","profile","achievements","evidence","stats","community","settings"] as const;
import {notFound} from "next/navigation";

type PageProps = {
  params: Promise<{view:string}>;
  searchParams: Promise<{id?:string;seed?:string}>;
};

export async function generateStaticParams() {
  return mobilePages.map(view=>({view}));
}

export default async function MobilePage({params,searchParams}:PageProps) {
  const {view}=await params;
  const search=await searchParams;
  if(!mobilePages.some(name=>name===view))notFound();
  return <IOSFullApp view={view}
    questId={typeof search.id==="string"?search.id:undefined}
    seed={typeof search.seed==="string"?search.seed:undefined}
  />;
}
