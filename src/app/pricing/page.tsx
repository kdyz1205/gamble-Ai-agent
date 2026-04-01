import type { Metadata } from "next";
import PricingPlayground from "@/components/PricingPlayground";

export const metadata: Metadata = {
  title: "Pricing lab — ChallengeAI",
  description: "Adjust Anthropic and credit parameters to estimate margins and break-even.",
};

export default function PricingPage() {
  return <PricingPlayground />;
}
