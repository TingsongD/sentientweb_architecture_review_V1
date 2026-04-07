import type { Metadata } from "next";
import { Rocket, Shield, Sparkles, Zap } from "lucide-react";
import SolutionTemplate from "@/components/SolutionTemplate";
import { buildPageMetadata } from "@/config/site";

const pageTitle = "Ship Faster. Stay Informed.";
const pageDescription =
  "See what's new at SentientWeb. We ship daily to ensure our agents are the fastest, most accurate, and most action-oriented in the market.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  ...buildPageMetadata({
    path: "/product/changelog",
    title: pageTitle,
    description: pageDescription,
  }),
};

export default function ChangelogProduct() {
  return (
    <SolutionTemplate
      industry="Changelog"
      title={pageTitle}
      description={pageDescription}
      heroBadge="Daily Ship"
      problemPoints={[
        "Uncertainty about new feature releases and API changes.",
        "Lack of visibility into performance improvements and bug fixes.",
        "Difficulty tracking the evolution of our BANT-lite scoring models.",
        "Missing out on new industry-specific qualification playbooks.",
      ]}
      solutionPoints={[
        {
          title: "Daily Feature Drops",
          description: "Stay ahead of the curve with our rapid iteration and deployment cycle.",
          icon: <Rocket className="w-full h-full" />,
        },
        {
          title: "Latency Optimizations",
          description: "Track our progress toward the <1.0s TTFT goal for the ultimate sentient feel.",
          icon: <Zap className="w-full h-full" />,
        },
        {
          title: "Security & Privacy Updates",
          description: "Stay informed on our latest enterprise-grade security and data isolation patches.",
          icon: <Shield className="w-full h-full" />,
        },
        {
          title: "Model Improvements",
          description: "Get detailed notes on how we're improving RAG accuracy and intent detection.",
          icon: <Sparkles className="w-full h-full" />,
        },
      ]}
      resultMetric="Daily"
      resultLabel="Ship Frequency"
      resultDescription="We ship to production every 24 hours to ensure your agents are always running on the latest tech."
    />
  );
}
