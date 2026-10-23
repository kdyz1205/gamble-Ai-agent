import { redirect } from "next/navigation";

/** Preserve old profile bookmarks and send users to the existing account page. */
export default function ProfileRedirect() {
  redirect("/me");
}
