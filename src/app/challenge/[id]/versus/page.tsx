import VersusPageClient from "./VersusPageClient";

export default async function VersusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VersusPageClient challengeId={id} />;
}
