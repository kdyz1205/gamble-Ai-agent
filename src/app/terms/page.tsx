import LegalPage from "@/components/legal/LegalPage";

export default function TermsPage() {
  return (
    <LegalPage
      activePath="/terms"
      eyebrow="Terms"
      title="Terms of Use"
      updated="June 14, 2026"
      sections={[
        {
          title: "Challenge rules",
          body: [
            "Summoner.world helps users summon quests, define proof, submit proof, receive AI-refereed results, and create shareable receipts.",
            "Do not create dangerous challenges, illegal challenges, harassment, threats, self-harm prompts, or challenges that pressure someone into unsafe behavior.",
          ],
        },
        {
          title: "Credits",
          body: [
            "No real-money gambling is offered in Summoner.world. Credits are in-app points used for quest entries, drafting, and results inside the product.",
            "Credits have no cash value, cannot be redeemed for money, and may be adjusted or refunded when required to protect ledger integrity.",
          ],
        },
        {
          title: "Proof and Familiar review",
          body: [
            "Users are responsible for submitting honest proof. False, manipulated, or abusive proof may lead to quest cancellation or account restriction.",
            "AI-refereed quest results are explainable but not legal, financial, medical, or safety advice. Disputed results can be reviewed when proof is ambiguous.",
          ],
        },
        {
          title: "Account conduct",
          body: [
            "You may not abuse reporting, spam quests, impersonate others, exploit result logic, or interfere with another user's safe use of the app.",
          ],
        },
      ]}
    />
  );
}
