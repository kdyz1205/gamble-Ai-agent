import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** First launch must route correctly even before React hydrates on a slow device.
 * This cookie only records an onboarding UI choice and has no authorization role.
 */
export default async function AppHomePage() {
  const jar = await cookies();
  redirect(jar.get("sum-ios-onboarding-complete")?.value === "true"
    ? "/app/today"
    : "/app/onboarding");
}
