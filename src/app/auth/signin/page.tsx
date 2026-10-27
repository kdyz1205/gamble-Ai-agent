import SignInPortal from "@/components/auth/SignInPortal";

export default async function SignInPage({ searchParams }: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const { callbackUrl } = await searchParams;
  return <SignInPortal callbackUrl={typeof callbackUrl === "string" ? callbackUrl : undefined} />;
}
