import QuestAppNav from "@/components/QuestAppNav";

/** Keep the established quest navigation entrypoint; render the shared iOS dock. */
export default function SceneMobileNav({ active: _active }: { active: string }) {
  return <QuestAppNav scene />;
}
