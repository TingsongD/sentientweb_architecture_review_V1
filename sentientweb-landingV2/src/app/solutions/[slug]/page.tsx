import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SolutionTemplate from "@/components/SolutionTemplate";
import { buildPageMetadata } from "@/config/site";
import { solutions } from "@/config/solutions";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = solutions.find((s) => s.slug === slug);

  if (!data) return {};

  return {
    title: data.industry,
    description: data.description,
    ...buildPageMetadata({
      path: `/solutions/${data.slug}`,
      title: data.industry,
      description: data.description,
      socialTitle: data.heroTitle,
    }),
  };
}

export async function generateStaticParams() {
  return solutions.map((s) => ({
    slug: s.slug,
  }));
}

export default async function SolutionPage({ params }: Props) {
  const { slug } = await params;
  const data = solutions.find((s) => s.slug === slug);

  if (!data) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      <main id="main-content" tabIndex={-1} className="outline-none">
        <SolutionTemplate
          industry={data.industry}
          title={data.heroTitle || data.title}
          description={data.heroSubtitle || data.description}
          heroBadge={data.heroBadge}
          problemPoints={data.problemPoints}
          solutionPoints={data.features.map((f) => ({
            title: f.title,
            description: f.description,
            icon: (
              <span className="text-4xl" role="img" aria-label={f.iconLabel}>
                {f.icon}
              </span>
            ),
            iconLabel: f.iconLabel,
          }))}
          stats={data.stats}
          resultMetric={data.resultMetric}
          resultLabel={data.resultLabel}
          resultDescription={data.resultDescription}
          ctaText={data.cta}
        />
      </main>

      <Footer />
    </div>
  );
}
