import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata, siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `Terms governing use of the ${siteConfig.name} website and related services.`,
  ...buildPageMetadata({
    path: "/terms",
    title: "Terms of Service",
    description: `Terms governing use of the ${siteConfig.name} website and related services.`,
  }),
};

export default function TermsPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-3xl px-6 py-24 outline-none"
    >
      <p className="mb-6 text-sm text-muted-foreground">
        <Link href="/" className="text-brand-violet underline-offset-4 hover:underline">
          ← Back to home
        </Link>
      </p>
      <h1 className="mb-8 text-4xl font-semibold tracking-tight">Terms of Service</h1>
      <div className="max-w-none space-y-6 text-[15px] leading-relaxed text-foreground">
        <p>
          These terms govern your use of the <strong>{siteConfig.name}</strong>{" "}
          public website, on-site chat, and related marketing materials operated by{" "}
          <strong>{siteConfig.legalName}</strong>.
        </p>
        <h2 className="text-xl font-medium">Acceptable use</h2>
        <p>
          You may use the site only for lawful purposes. You may not interfere with
          the site, attempt unauthorized access, submit malicious code, use the
          chat for unlawful or deceptive activity, or use automated means that
          overload, scrape, or probe the service in a harmful way.
        </p>
        <h2 className="text-xl font-medium">Content and availability</h2>
        <p>
          Content on the site is provided for general informational purposes and
          may change without notice. We do not guarantee that every feature
          description, availability statement, or roadmap reference on the site
          will remain current or available at all times.
        </p>
        <h2 className="text-xl font-medium">Scheduling and third-party services</h2>
        <p>
          Demo booking and related workflows may route you to third-party services
          such as Calendly. Your use of those services is governed by their own
          terms and privacy practices.
        </p>
        <h2 className="text-xl font-medium">Communications</h2>
        <p>
          If you contact us through the site, email, or a scheduling form, you
          represent that the information you provide is accurate and that you have
          the right to share it with us.
        </p>
        <h2 className="text-xl font-medium">Disclaimer</h2>
        <p>
          The site is provided &quot;as is&quot; and &quot;as available&quot;
          without warranties of any kind, to the extent permitted by law.
        </p>
        <h2 className="text-xl font-medium">Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, <strong>{siteConfig.legalName}</strong>{" "}
          will not be liable for indirect, incidental, special, consequential, or
          punitive damages arising from or related to your use of the site.
        </p>
        <h2 className="text-xl font-medium">Contact</h2>
        <p>
          <a
            className="text-brand-violet underline-offset-4 hover:underline"
            href={`mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent("Terms inquiry")}`}
          >
            {siteConfig.contactEmail}
          </a>
        </p>
      </div>
    </main>
  );
}
