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
              "Block a user requests can be sent through the in-app form or to support@summoner.world with the username or profile link. We can restrict matching, discovery, or direct participation while the in-app control is being expanded.",
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
