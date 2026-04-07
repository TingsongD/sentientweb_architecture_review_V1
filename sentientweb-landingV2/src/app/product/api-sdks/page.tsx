import type { Metadata } from "next";
import { Blocks, Code2, Cpu, Terminal } from "lucide-react";
import SolutionTemplate from "@/components/SolutionTemplate";
import { buildPageMetadata } from "@/config/site";

const pageTitle = "Build Faster with Our Robust Agentic Framework";
const pageDescription =
  "Integrate SentientWeb into your existing stack in minutes. We provide first-class SDKs for Python, TypeScript, and Go, plus a comprehensive REST API for everything else.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  ...buildPageMetadata({
    path: "/product/api-sdks",
    title: pageTitle,
    description: pageDescription,
  }),
};

export default function ApiSdksProduct() {
  return (
    <SolutionTemplate
      industry="APIs & SDKs"
      title={pageTitle}
      description={pageDescription}
      heroBadge="Developer First"
      problemPoints={[
        "Complex AI integrations requiring weeks of custom prompt engineering.",
        "Lack of standardized schemas for lead qualification and booking data.",
        "Difficulty managing multi-agent state across different sessions.",
        "Inconsistent error handling and rate-limiting in manual LLM calls.",
      ]}
      solutionPoints={[
        {
          title: "First-Class SDKs",
          description: "Natively supported libraries for Python, TypeScript, and Go with full type safety.",
          icon: <Code2 className="w-full h-full" />,
        },
        {
          title: "Standardized SDR Schema",
          description: "Use our pre-defined BANT-lite and Demo schemas to ensure consistent data across your CRM.",
          icon: <Blocks className="w-full h-full" />,
        },
        {
          title: "Real-time SSE Streaming",
          description: "Stream agent responses directly to your UI with Server-Sent Events for a 'sentient' feel.",
          icon: <Terminal className="w-full h-full" />,
        },
        {
          title: "Stateful Session Management",
          description: "Natively handle conversation state and memory across multiple user interactions.",
          icon: <Cpu className="w-full h-full" />,
        },
      ]}
      resultMetric="15 min"
      resultLabel="Time to First API Call"
      resultDescription="Our developers go from sign-up to a functional SDR agent in under 15 minutes using our quickstart SDKs."
    />
  );
}
