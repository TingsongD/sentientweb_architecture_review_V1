import type { Metadata } from "next";
import { Database, Filter, Target, UserCheck } from "lucide-react";
import SolutionTemplate from "@/components/SolutionTemplate";
import { buildPageMetadata } from "@/config/site";

const pageTitle = "Automate Your Top-of-Funnel with BANT-lite Scoring";
const pageDescription =
  "Stop burning sales cycles on unqualified traffic. Our Sentient agents qualify every visitor based on Budget, Authority, Need, and Timeline (BANT-lite) logic before they ever reach your CRM.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  ...buildPageMetadata({
    path: "/product/lead-qualification",
    title: pageTitle,
    description: pageDescription,
  }),
};

export default function LeadQualificationProduct() {
  return (
    <SolutionTemplate
      industry="Lead Qualification"
      title={pageTitle}
      description={pageDescription}
      heroBadge="Core Product"
      problemPoints={[
        "SDRs wasting 60%+ of their day on low-intent chat inquiries.",
        "Static forms resulting in 70% lead abandonment on high-traffic sites.",
        "Lack of real-time qualification data for marketing attribution.",
        "Inconsistent lead scoring leads to missed high-value opportunities.",
      ]}
      solutionPoints={[
        {
          title: "Autonomous BANT-lite Triage",
          description: "Agents ask conversational, context-aware questions to extract budget, authority, need, and timeline signals.",
          icon: <Filter className="w-full h-full" />,
          iconLabel: "Filter",
        },
        {
          title: "High-Intent Intent Scoring",
          description: "Our proprietary scoring model identifies 'Whale' leads instantly based on interaction depth and quality.",
          icon: <Target className="w-full h-full" />,
          iconLabel: "Target",
        },
        {
          title: "Native CRM Data Sync",
          description: "Automatically push qualified leads into HubSpot or Salesforce with full conversation context and scores.",
          icon: <Database className="w-full h-full" />,
          iconLabel: "Database",
        },
        {
          title: "Custom Qualification Playbooks",
          description: "Define your ideal customer profile (ICP) and let the agent enforce your specific qualification criteria.",
          icon: <UserCheck className="w-full h-full" />,
          iconLabel: "User Check",
        },
      ]}
      stats={[
        { value: "35%", label: "Lower CAC" },
        { value: "0.98", label: "BANT Precision" },
        { value: "24/7", label: "Availability" },
      ]}
      resultMetric="35%"
      resultLabel="Lower CAC"
      resultDescription="By automating initial qualification, we've helped teams reduce their Customer Acquisition Cost by 35% while increasing SQL quality."
    />
  );
}
