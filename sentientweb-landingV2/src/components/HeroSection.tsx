import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

export default function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden bg-white px-4 pt-[120px] pb-[80px]">
      <div className="bg-grid-faint absolute inset-0 z-0" aria-hidden />

      <div className="relative z-10 mx-auto flex max-w-[1200px] flex-col items-center text-center">
        <Link
          href="/#cta"
          prefetch={false}
          className="mb-8 inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-violet/40"
        >
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <span className="rounded bg-gradient-to-r from-brand-violet to-brand-sky px-1.5 py-0.5 text-[10px] font-bold text-white">
              SENTIENT
            </span>
            <span className="text-gray-400" aria-hidden>
              ×
            </span>
            <span className="font-bold italic text-blue-600">B2B SaaS</span>
            Introducing Phase 1: Inbound Lead Qualification &amp; Demo Booking
          </span>
          <svg
            className="h-4 w-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Link>

        <div
          className="mb-8 flex h-[120px] w-[120px] rotate-12 items-center justify-center rounded-lg bg-gradient-to-br from-brand-violet to-brand-sky text-4xl font-bold text-white shadow-xl"
          aria-hidden
        >
          S
        </div>

        <h1 className="mb-4 max-w-[1000px] bg-gradient-to-r from-brand-violet to-brand-sky bg-clip-text text-[60px] font-normal leading-[1.1] tracking-tight text-transparent md:text-[90px]">
          The Autonomous Website Agent.
        </h1>

        <p className="mb-12 max-w-[900px] text-[20px] font-normal leading-[1.4] text-black/70 md:text-[28px]">
          Platform-agnostic AI that qualifies leads, books demos, answers
          questions, and takes action — 24/7.
        </p>

        <div className="mb-4 flex flex-col gap-4 md:flex-row">
          <Link
            href="/#cta"
            prefetch={false}
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-[86px] rounded-[2px] border-0 bg-gradient-to-r from-brand-magenta to-brand-blue px-10 text-[24px] font-medium text-white shadow-lg hover:opacity-90 md:text-[30px]",
            )}
          >
            Start Pilot
          </Link>
          <a
            href={`mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent("SentientWeb demo request")}`}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-[86px] rounded-[2px] border-black px-10 text-[24px] font-medium text-black hover:bg-gray-50 md:text-[30px]",
            )}
          >
            Book a Demo
          </a>
        </div>

        <p className="text-[14px] font-normal text-black/50">
          No credit card required.
        </p>
      </div>
    </section>
  );
}
