import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

const demoSubject = encodeURIComponent("SentientWeb demo request");

export default function CTASection() {
  const mailtoDemo = `mailto:${siteConfig.contactEmail}?subject=${demoSubject}`;

  return (
    <section
      id="cta"
      className="relative w-full overflow-hidden border-t border-gray-100 bg-white py-24 text-black"
    >
      <div className="bg-grid-faint absolute inset-0 z-0" aria-hidden />

      <div className="relative z-10 mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-8 px-4 md:flex-row md:items-center">
        <h2 className="mb-8 bg-gradient-to-r from-brand-violet to-brand-sky bg-clip-text text-[48px] font-normal leading-tight text-transparent md:mb-0 md:text-[64px]">
          One engine. <br className="hidden md:block" />
          Many adapters.
        </h2>
        <div className="flex w-full flex-col gap-4 md:w-auto">
          <a
            href={mailtoDemo}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "inline-flex h-[64px] items-center justify-center rounded-[2px] border-black px-12 font-medium shadow-sm hover:bg-gray-100",
            )}
          >
            Book a Demo
          </a>
          <Link
            href="/#features"
            prefetch={false}
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-[64px] rounded-[2px] border-0 bg-gradient-to-r from-brand-violet to-brand-sky px-12 font-medium text-white shadow-lg hover:opacity-90",
            )}
          >
            Get Started
          </Link>
        </div>
      </div>
    </section>
  );
}
