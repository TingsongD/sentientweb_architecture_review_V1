import type { Metadata } from "next";
import { BookOpen, Search, ShieldCheck, Zap } from "lucide-react";
import SolutionTemplate from "@/components/SolutionTemplate";
import { buildPageMetadata } from "@/config/site";

const pageTitle = "High-Precision Hybrid RAG (Vector + Keyword)";
const pageDescription =
  "No more hallucinations. Our hybrid search ensures your agent answers technical and pricing questions with high fidelity using your actual documentation.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  ...buildPageMetadata({
    path: "/product/knowledge-base",
    title: pageTitle,
    description: pageDescription,
  }),
};

export default function KnowledgeBaseProduct() {
  return (
    <SolutionTemplate
      industry="Knowledge Base"
      title={pageTitle}
      description={pageDescription}
      heroBadge="Sentient RAG"
      problemPoints={[
        "AI agents providing incorrect or 'hallucinated' technical information.",
        "Engineering teams distracted by basic API and integration questions.",
        "Static FAQs that lack the context to answer complex user queries.",
        "Outdated knowledge bases that require manual, slow updates.",
      ]}
      solutionPoints={[
        {
          title: "Hybrid Search (Vector + FTS)",
          description: "Combining vector embeddings with keyword-based Full-Text Search for 99.9% accuracy.",
          icon: <Search className="w-full h-full" />,
          iconLabel: "Search",
        },
        {
          title: "Multi-Source Knowledge Sync",
          description: "Sync from PDF, URL, Notion, and direct text to build a unified brain for your agent.",
          icon: <BookOpen className="w-full h-full" />,
          iconLabel: "Book",
        },
        {
          title: "Automatic Re-indexing",
          description: "Detected changes in your documentation trigger instant re-indexing to keep your agent current.",
          icon: <Zap className="w-full h-full" />,
          iconLabel: "Lightning Bolt",
        },
        {
          title: "Secure & Private RAG",
          description: "Your documentation is indexed in an isolated vector space and never shared across tenants.",
          icon: <ShieldCheck className="w-full h-full" />,
          iconLabel: "Shield",
        },
      ]}
      stats={[
        { value: "90%", label: "Ticket Reduction" },
        { value: "99.9%", label: "Answer Accuracy" },
        { value: "50+", label: "Sources Supported" },
      ]}
      resultMetric="90%"
      resultLabel="Fewer Support Tickets"
      resultDescription="Customers see a 90% reduction in basic support inquiries by allowing the Sentient agent to answer technical and pricing questions autonomously."
    />
  );
}
