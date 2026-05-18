import { redirect } from "next/navigation";

export default async function LegacyMarketRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/challenge/${id}`);
}
