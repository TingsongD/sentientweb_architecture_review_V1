import type { Metadata } from "next";
import CTASection from "@/components/CTASection";
import FeaturesSection from "@/components/FeaturesSection";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import { buildPageMetadata, siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: {
    absolute: siteConfig.defaultTitle,
  },
  description: siteConfig.description,
  ...buildPageMetadata({
    path: "/",
    title: siteConfig.defaultTitle,
    description: siteConfig.description,
  }),
};

export default function Home() {
  return (
    <>
      <Header />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex min-h-screen flex-col items-center justify-between outline-none"
      >
        <HeroSection />
        <FeaturesSection />
        <CTASection />
      </main>
      <Footer />
    </>
  );
}
