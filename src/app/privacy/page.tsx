import LegalPage from "@/components/legal/LegalPage";

export default function PrivacyPage() {
  return (
    <LegalPage
      activePath="/privacy"
      eyebrow="Privacy"
      title="Privacy Policy"
      updated="June 14, 2026"
      sections={[
        {
          title: "Data we collect",
          body: [
            "Summoner.world collects account identifiers such as email address, username, and session data so you can sign in and keep your quest history.",
            "When you create or join a quest, we store challenge text, participants, credit entries, proof rules, submitted proof, timestamps, results, and audit events.",
            "If you choose location-based discovery, approximate coordinates may be stored for matching and nearby quest discovery.",
          ],
        },
        {
          title: "How we use data",
          body: [
            "We use account and quest data for app functionality, fraud prevention, credit safety, proof review, and AI-refereed results.",
            "Familiar review uses the quest rules and submitted proof to produce an explainable result. We do not sell personal data or use it for cross-app tracking.",
          ],
        },
        {
          title: "User-generated content",
          body: [
            "Challenge prompts, comments, and uploaded proof can contain user-generated content. Report unsafe, abusive, or infringing content at support@summoner.world.",
            "We may remove content, restrict accounts, or preserve records when required for safety, result integrity, dispute review, or legal compliance.",
          ],
        },
        {
          title: "Contact",
          body: [
            "Questions, deletion requests, privacy concerns, and App Review access requests can be sent to support@summoner.world.",
          ],
        },
      ]}
    />
  );
}
