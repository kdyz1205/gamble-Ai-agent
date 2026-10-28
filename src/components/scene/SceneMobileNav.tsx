import QuestAppNav from "@/components/QuestAppNav";
/** Legacy scenes keep their content but share the current client's destinations. */
export default function SceneMobileNav({active}:{active:string}) {
  return <QuestAppNav scene activePath={active}/>;
}
