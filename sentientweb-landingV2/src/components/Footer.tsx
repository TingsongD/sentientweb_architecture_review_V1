import Link from "next/link";
import { productPages } from "@/config/products";
import { siteConfig } from "@/config/site";
import { solutions } from "@/config/solutions";

const footerSections = [
  {
    category: "Product",
    links: [
      ...productPages
        .filter((page) => page.includeInFooter)
        .map((page) => ({ label: page.label, href: page.href })),
      { label: "Pricing", href: "/#cta" },
    ],
  },
  {
    category: "Solutions",
    links: solutions.map((solution) => ({
      label: solution.industry,
      href: `/solutions/${solution.slug}`,
    })),
  },
  {
    category: "Company",
    links: [
      { label: "About", href: "/#cta" },
      { label: "Careers", href: "/#cta" },
      { label: "Trust & Security", href: "/privacy" },
    ],
  },
  {
    category: "Developers",
    links: [
      { label: "Blog", href: "/#features" },
      { label: "GitHub", href: "https://github.com/TingsongD/sentientweblanding2" },
      { label: "Status", href: "/#cta" },
    ],
  },
] as const;

const socialIcons = [
  { name: "LinkedIn", label: "in", href: "https://www.linkedin.com/" },
  { name: "X", label: "𝕏", href: "https://x.com/" },
] as const;

export default function Footer() {
  return (
    <footer className="w-full overflow-hidden border-t border-gray-100 bg-white pt-12 pb-12 text-black">
      <div className="w-full px-6 pt-16 md:px-12">
        <div className="mb-24 grid grid-cols-2 gap-12 md:grid-cols-4 lg:grid-cols-5">
          {footerSections.map((section) => (
            <div key={section.category} className="flex flex-col gap-6">
              <h4 className="text-[14px] font-bold tracking-wider text-black/50 uppercase">
                {section.category}
              </h4>
              <ul className="flex flex-col gap-4">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[14px] font-normal transition-colors hover:text-brand-violet focus-visible:rounded-sm focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-violet/40"
                      {...(link.href.startsWith("http")
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="hidden justify-end lg:col-span-2 lg:flex">
            <div className="relative flex h-[200px] w-[200px] rotate-12 items-center justify-center rounded-lg bg-gradient-to-br from-brand-violet/10 to-brand-sky/10">
              <span
                className="bg-gradient-to-r from-brand-violet to-brand-sky bg-clip-text text-6xl font-bold text-transparent opacity-20"
                aria-hidden
              >
                S
              </span>
              <div className="absolute inset-0 -translate-x-4 -translate-y-4 rotate-12 border border-gray-200" />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-8 border-t border-gray-100 pt-12 md:flex-row">
          <div className="flex flex-wrap gap-8 text-[14px] font-normal text-black/50">
            <Link
              href="/privacy"
              className="transition-colors hover:text-black focus-visible:rounded-sm focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-violet/40"
            >
              Privacy policy
            </Link>
            <Link
              href="/terms"
              className="transition-colors hover:text-black focus-visible:rounded-sm focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-violet/40"
            >
              Terms of Service
            </Link>
          </div>

          <div className="flex gap-6">
            {socialIcons.map((social) => (
              <a
                key={social.name}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-violet/40"
                aria-label={social.name}
              >
                <span className="text-sm text-black/70">{social.label}</span>
              </a>
            ))}
          </div>
        </div>

        <div className="pointer-events-none mt-24 select-none">
          <p
            className="whitespace-nowrap bg-gradient-to-r from-brand-violet to-brand-sky bg-clip-text text-[15vw] leading-none font-bold tracking-tighter text-transparent opacity-10"
            aria-hidden
          >
            {siteConfig.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
