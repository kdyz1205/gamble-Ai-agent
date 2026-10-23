import LegalPage from "@/components/legal/LegalPage";
import SupportReportForm from "@/components/support/SupportReportForm";

export default function SupportPage() {
  return (
    <>
      <LegalPage
        activePath="/support"
        eyebrow="Support"
        title="Support and Safety"
        updated="June 14, 2026"
        sections={[
          {
            title: "Report content",
            body: [
              "Report content that is abusive, unsafe, illegal, infringing, sexually explicit, hateful, or designed to pressure someone into harm by emailing support@summoner.world or using the in-app form below.",
              "Include the quest link, username, proof link if available, and a short explanation so the review can preserve state and result context.",
            ],
          },
          {
            title: "Block a user",
            body: [
              "Signed-in users can block another account immediately by exact username or user ID. Blocks hide public feed and discovery activity in both directions and prevent new Quest acceptance before any credits are debited. You can undo a block under App Settings; past Quest, evidence and credit records remain intact.",
            ],
          },
          {
          title: "Quest or result help",
            body: [
              "For result disputes, credit balance questions, proof upload failures, or App Review demo access, contact support@summoner.world.",
              "We keep audit logs for sensitive actions so support can inspect state transitions, proof, credits, and result history without asking users to rerun a quest.",
            ],
          },
        ]}
      >
        <SupportReportForm />
      </LegalPage>
    </>
  );
}
