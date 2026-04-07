import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata, siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${siteConfig.name} handles data when you use our website and services.`,
  ...buildPageMetadata({
    path: "/privacy",
    title: "Privacy Policy",
    description: `How ${siteConfig.name} handles data when you use our website and services.`,
  }),
};

export default function PrivacyPage() {
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
      <h1 className="mb-8 text-4xl font-semibold tracking-tight">Privacy policy</h1>
      <div className="max-w-none space-y-6 text-[15px] leading-relaxed text-foreground">
        <p>
          This policy explains how <strong>{siteConfig.legalName}</strong> collects
          and uses information when you browse our public website, use the on-site
          chat, request a demo, or otherwise contact us.
        </p>
        <h2 className="text-xl font-medium">Information we collect</h2>
        <p>
          We may collect information you choose to provide directly, such as your
          name, work email, company name, and the contents of messages you send
          through the site chat, demo requests, or email.
        </p>
        <p>
          We also collect standard technical information needed to operate and
          improve the site, including IP address, browser and device details,
          referring pages, and basic usage data such as page visits and timestamps.
        </p>
        <h2 className="text-xl font-medium">How we use information</h2>
        <p>
          We use this information to respond to inquiries, qualify inbound interest,
          schedule demos, understand how the site is used, maintain the website,
          and protect against spam, fraud, and abuse.
        </p>
        <h2 className="text-xl font-medium">Scheduling and service providers</h2>
        <p>
          If you choose to book time with us, your scheduling details may be
          processed by Calendly or another third-party scheduling provider. Those
          services operate under their own terms and privacy practices.
        </p>
        <p>
          We may also use hosting, analytics, email, and infrastructure providers
          to run the site and communicate with prospective customers. These
          providers process information on our behalf as needed to deliver those
          services.
        </p>
        <h2 className="text-xl font-medium">Retention and requests</h2>
        <p>
          We retain inquiry, scheduling, and site-operational data for as long as
          reasonably necessary to manage conversations, operate the website, comply
          with legal obligations, and resolve disputes. If you want us to update or
          delete information you submitted through the site, contact us using the
          address below.
        </p>
        <h2 className="text-xl font-medium">Contact</h2>
        <p>
          Questions about this policy:{" "}
          <a
            className="text-brand-violet underline-offset-4 hover:underline"
            href={`mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent("Privacy inquiry")}`}
          >
            {siteConfig.contactEmail}
          </a>
          .
        </p>
      </div>
    </main>
  );
}
