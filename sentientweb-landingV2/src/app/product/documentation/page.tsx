import type { Metadata } from "next";
import { Book, FileText, MessageSquare, Search } from "lucide-react";
import SolutionTemplate from "@/components/SolutionTemplate";
import { buildPageMetadata } from "@/config/site";

const pageTitle = "Comprehensive Guides for Every Sentient Implementation";
const pageDescription =
  "Everything you need to deploy, configure, and optimize your autonomous SDR. From quickstart guides to advanced RAG optimization techniques.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  ...buildPageMetadata({
    path: "/product/documentation",
    title: pageTitle,
    description: pageDescription,
  }),
};

export default function DocumentationProduct() {
  return (
    <SolutionTemplate
      industry="Documentation"
      title={pageTitle}
      description={pageDescription}
      heroBadge="Knowledge Hub"
      problemPoints={[
        "Fragmented documentation making it hard to find integration details.",
        "Lack of clear examples for BANT-lite qualification playbooks.",
        "Confusion around vector database syncing and re-indexing intervals.",
        "Difficulty troubleshooting agent behavior in complex scenarios.",
      ]}
      solutionPoints={[
        {
          title: "Quickstart Guides",
          description: "Get your first agent live in under 10 minutes with our step-by-step walkthroughs.",
          icon: <FileText className="w-full h-full" />,
        },
        {
          title: "API Reference",
          description: "Deep-dive into every endpoint, parameter, and response object in our framework.",
          icon: <Book className="w-full h-full" />,
        },
        {
          title: "Playbook Library",
          description: "Access proven qualification and booking playbooks for 10+ different industries.",
          icon: <MessageSquare className="w-full h-full" />,
        },
        {
          title: "RAG Optimization Guide",
          description: "Learn how to optimize your knowledge base for 99.9% answer accuracy.",
          icon: <Search className="w-full h-full" />,
        },
      ]}
      resultMetric="99%"
      resultLabel="Doc Clarity Score"
      resultDescription="Our documentation is rated 4.9/5 by developers for its clarity, completeness, and actionable examples."
    />
  );
}
