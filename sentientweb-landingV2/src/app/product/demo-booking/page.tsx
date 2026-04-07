import type { Metadata } from "next";
import { Calendar, CheckCircle2, Clock, Zap } from "lucide-react";
import SolutionTemplate from "@/components/SolutionTemplate";
import { buildPageMetadata } from "@/config/site";

const pageTitle = "Convert High-Intent Leads Instantly with Native Booking";
const pageDescription =
  "Stop letting qualified leads wait. SentientWeb handles the scheduling friction by booking meetings directly on your sales team's calendars once qualification is met.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  ...buildPageMetadata({
    path: "/product/demo-booking",
    title: pageTitle,
    description: pageDescription,
  }),
};

export default function DemoBookingProduct() {
  return (
    <SolutionTemplate
      industry="Demo Booking"
      title={pageTitle}
      description={pageDescription}
      heroBadge="Action-First"
      problemPoints={[
        "Friction in scheduling initial consultations across multiple calendars.",
        "Missed potential demos due to slow human response times after-hours.",
        "High drop-off rates from users waiting for 'Contact Us' replies.",
        "Inefficient follow-up on high-intent website visitors.",
      ]}
      solutionPoints={[
        {
          title: "Native Calendly Integration",
          description: "Seamlessly connect your team's Calendly accounts for instant, context-aware booking.",
          icon: <Calendar className="w-full h-full" />,
          iconLabel: "Calendar",
        },
        {
          title: "Qualification-Gated Booking",
          description: "Only book meetings for leads that meet your specific BANT-lite criteria.",
          icon: <CheckCircle2 className="w-full h-full" />,
          iconLabel: "Checkmark",
        },
        {
          title: "Multi-Calendar Support",
          description: "Route demos to the right sales rep based on territory, expertise, or round-robin.",
          icon: <Clock className="w-full h-full" />,
          iconLabel: "Clock",
        },
        {
          title: "Instant Confirmation",
          description: "Reduce no-shows with real-time confirmation and calendar events for both parties.",
          icon: <Zap className="w-full h-full" />,
          iconLabel: "Lightning Bolt",
        },
      ]}
      stats={[
        { value: "2.5x", label: "Booking Increase" },
        { value: "0ms", label: "Scheduling Lag" },
        { value: "95%", label: "Show Rate" },
      ]}
      resultMetric="2.5x"
      resultLabel="More Booked Demos"
      resultDescription="Teams see a 2.5x increase in booked demos after implementing autonomous, qualification-gated scheduling."
    />
  );
}
