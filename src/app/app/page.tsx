import { redirect } from "next/navigation";

/** Web app enters the working dashboard immediately. Onboarding stays at /app/onboarding. */
export default function AppHomePage() {
  redirect("/app/today");
}
