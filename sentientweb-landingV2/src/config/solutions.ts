export interface SolutionData {
  slug: string;
  title: string;
  industry: string;
  icon: string;
  iconLabel: string;
  description: string;
  heroTitle: string;
  heroSubtitle: string;
  heroBadge?: string;
  problemPoints: string[];
  features: {
    title: string;
    description: string;
    icon: string;
    iconLabel: string;
  }[];
  stats: {
    value: string;
    label: string;
  }[];
  resultMetric: string;
  resultLabel: string;
  resultDescription: string;
  cta: string;
}

export const solutions: SolutionData[] = [
  {
    slug: "legal",
    industry: "Legal Services",
    title: "Autonomous Legal Intake",
    icon: "⚖️",
    iconLabel: "Scale of justice",
    description: "Eliminate intake friction. Qualify prospective clients and book consultations with zero human intervention.",
    heroTitle: "Sentient Legal Intake: 24/7/365",
    heroSubtitle: "Identify practice area fit, assess urgency, and perform conflict check triage autonomously. Stop losing high-value cases to lead decay.",
    heroBadge: "Legal Tech",
    problemPoints: [
      "Missed potential cases due to slow human intake after-hours.",
      "Attorneys wasting time on unqualified leads that don't fit practice areas.",
      "High cost of 24/7 call centers that lack legal context.",
      "Friction in scheduling initial consultations across multiple calendars."
    ],
    features: [
      {
        title: "BANT-lite Qualification",
        description: "Autonomous agents identify case value, party details, and legal urgency in sub-seconds.",
        icon: "🎯",
        iconLabel: "Target"
      },
      {
        title: "Conflict Check Triage",
        description: "Automatically collect party names and identifiers to streamline your firm's compliance checks.",
        icon: "🔍",
        iconLabel: "Magnifying glass"
      },
      {
        title: "Instant Expert Booking",
        description: "Directly schedule consultations into the specific attorney's calendar based on practice area expertise.",
        icon: "📅",
        iconLabel: "Calendar"
      }
    ],
    stats: [
      { value: "90%", label: "Lead Capture Rate" },
      { value: "15hr", label: "Weekly Time Saved" },
      { value: "Sub-1s", label: "Initial Triage" }
    ],
    resultMetric: "90%",
    resultLabel: "Lead Capture Rate",
    resultDescription: "We saw a 90% increase in capture for after-hours leads and reduced manual intake time by 15 hours per week.",
    cta: "Deploy Legal SDR"
  },
  {
    slug: "auto",
    industry: "Car Dealerships",
    title: "Sentient Auto Sales Agent",
    icon: "🚗",
    iconLabel: "Automobile",
    description: "Transform your website into a 24/7 showroom. Book test drives and appraisals autonomously.",
    heroTitle: "Always-On Inventory Qualification",
    heroSubtitle: "Answer technical specs, qualify trade-ins, and fill your sales team's calendar with high-intent car buyers.",
    heroBadge: "Automotive Sales",
    problemPoints: [
      "Showroom closed after-hours causing lead decay on high-intent searchers.",
      "High-volume of inventory questions clogging sales rep phone lines.",
      "Friction in scheduling test drives leading to lost showroom traffic.",
      "Inaccurate trade-in data causing wasted appraisal appointments."
    ],
    features: [
      {
        title: "Autonomous Showings",
        description: "Seamlessly schedule test drives for specific VINs based on live showroom inventory.",
        icon: "🏎️",
        iconLabel: "Racing car"
      },
      {
        title: "Trade-In Appraisal Prep",
        description: "Collect precise vehicle condition data for faster, high-intent appraisal appointments.",
        icon: "💰",
        iconLabel: "Money bag"
      },
      {
        title: "Inventory Intelligence",
        description: "Answer technical questions about engine specs, trim levels, and features directly from your inventory feed.",
        icon: "📑",
        iconLabel: "Bookmark tabs"
      }
    ],
    stats: [
      { value: "2.5x", label: "Test Drive Volume" },
      { value: "60%", label: "Lead Response Rate" },
      { value: "Zero", label: "Missed Night Leads" }
    ],
    resultMetric: "2.5x",
    resultLabel: "Test Drive Volume",
    resultDescription: "After implementing SentientWeb, we saw test drive bookings more than double during after-hours browsing sessions.",
    cta: "Rev Up Your Sales"
  },
  {
    slug: "hotel",
    industry: "Hotel & Hospitality",
    title: "Sentient Digital Concierge",
    icon: "🏨",
    iconLabel: "Hotel building",
    description: "Provide instant concierge services and drive more direct bookings without commission fees.",
    heroTitle: "Zero-Commission Direct Bookings",
    heroSubtitle: "Provide sub-second answers to guest questions and guide them to direct booking paths to avoid high OTA commissions.",
    heroBadge: "Hospitality & Travel",
    problemPoints: [
      "High commission fees paid to OTAs for simple bookings.",
      "Front desk overwhelmed by repetitive phone calls about amenities.",
      "Slow response times for group booking inquiries leading to lost revenue.",
      "Guests leaving the site due to friction in finding specific policy information."
    ],
    features: [
      {
        title: "Digital Concierge",
        description: "Instantly answer guest questions about Wi-Fi, pool hours, parking, and pet policies 24/7.",
        icon: "🏊",
        iconLabel: "Swimmer"
      },
      {
        title: "Booking Conversion Driver",
        description: "Identify high-intent visitors and guide them directly to your direct booking engine.",
        icon: "💳",
        iconLabel: "Credit card"
      },
      {
        title: "Local Experience Guide",
        description: "Suggest nearby dining and attractions based on your hotel's curated local partnerships.",
        icon: "🗺️",
        iconLabel: "World map"
      }
    ],
    stats: [
      { value: "20%", label: "Direct Booking Lift" },
      { value: "90%", label: "Resolution Rate" },
      { value: "Instant", label: "Response Time" }
    ],
    resultMetric: "20%",
    resultLabel: "Direct Booking Increase",
    resultDescription: "By answering guest questions immediately, we shifted 20% of our bookings from expensive OTAs to our direct site.",
    cta: "Optimize Your Booking"
  },
  {
    slug: "insurance",
    industry: "Insurance Agencies",
    title: "Autonomous Insurance Advisor",
    icon: "🛡️",
    iconLabel: "Shield",
    description: "Qualify risk types and gather essential policy data before the broker ever picks up the phone.",
    heroTitle: "Sentient Insurance Qualification",
    heroSubtitle: "Automatically qualify leads for home, auto, or life insurance and route high-intent risk profiles to the right agent.",
    heroBadge: "Insurance & InsurTech",
    problemPoints: [
      "Agents wasting hours on low-intent or unqualified risk profiles.",
      "Inconsistent data gathering during initial intake causing quoting delays.",
      "High acquisition costs combined with slow follow-up times.",
      "Complex policy questions leading to lead abandonment during off-hours."
    ],
    features: [
      {
        title: "Risk Profile Qualification",
        description: "Determine policy needs, coverage history, and risk levels autonomously.",
        icon: "🚦",
        iconLabel: "Traffic light"
      },
      {
        title: "Precision Data Capture",
        description: "Collect VINs, ZIP codes, and property details with 100% accuracy to prep for underwriting.",
        icon: "📊",
        iconLabel: "Bar chart"
      },
      {
        title: "Intelligent Broker Routing",
        description: "Book calls directly on the agent's calendar best suited for that specific risk type.",
        icon: "🤝",
        iconLabel: "Handshake"
      }
    ],
    stats: [
      { value: "50%", label: "Cycle Reduction" },
      { value: "3x", label: "Agent Productivity" },
      { value: "Verified", label: "Lead Accuracy" }
    ],
    resultMetric: "3x",
    resultLabel: "Broker Productivity",
    resultDescription: "Brokers now spend zero time on cold intake, allowing them to close 3x more policies per week.",
    cta: "Protect More Clients"
  },
  {
    slug: "saas",
    industry: "B2B SaaS Companies",
    title: "Sentient Enterprise SDR",
    icon: "🚀",
    iconLabel: "Rocket",
    description: "Scale your inbound funnel by qualifying enterprise accounts and booking high-intent demos.",
    heroTitle: "Scale Your Enterprise Pipeline",
    heroSubtitle: "Identify ICP fit based on seat count, tech stack, and budget autonomously. Integrate directly with your CRM for instant sales visibility.",
    heroBadge: "SaaS & Enterprise",
    problemPoints: [
      "Inbound leads waiting hours for an SDR to reach out manually.",
      "SDRs wasting 60% of their time on unqualified 'free-tier' signups.",
      "High CAC due to slow response times and follow-up lag.",
      "Inconsistent data entry into CRM causing pipeline blind spots."
    ],
    features: [
      {
        title: "ICP-Match Qualification",
        description: "Identify seat count, technical requirements, and authority levels autonomously.",
        icon: "🎯",
        iconLabel: "Target"
      },
      {
        title: "Autonomous Demo Booking",
        description: "Seamlessly integrate with Calendly to fill your sales team's calendar with high-intent demos.",
        icon: "🗓️",
        iconLabel: "Spiral calendar"
      },
      {
        title: "Technical RAG Q&A",
        description: "Answer complex API and security questions instantly using your product documentation.",
        icon: "💻",
        iconLabel: "Laptop"
      }
    ],
    stats: [
      { value: "35%", label: "Lower CAC" },
      { value: "40%", label: "Pipeline Lift" },
      { value: "Sub-1s", label: "Response" }
    ],
    resultMetric: "35%",
    resultLabel: "Lower CAC",
    resultDescription: "By automating top-of-funnel qualification, we reduced customer acquisition costs by 35% while increasing demo velocity.",
    cta: "Grow Your SaaS Pipeline"
  },
  {
    slug: "real-estate",
    industry: "Real Estate Brokers",
    title: "Sentient Real Estate Agent",
    icon: "🏠",
    iconLabel: "House building",
    description: "Identify buyer intent and schedule property viewings autonomously.",
    heroTitle: "Viewing Orchestration, Autonomously",
    heroSubtitle: "Qualify buyers, capture seller intent, and book property viewings while you're out closing deals.",
    heroBadge: "Real Estate & PropTech",
    problemPoints: [
      "Agents losing hours to 'lookie-loo' leads with no real intent to buy.",
      "Delayed responses to property inquiries leading to lost commissions.",
      "Complex scheduling conflicts for viewings across multiple properties.",
      "Difficulty in qualifying seller intent during peak showing hours."
    ],
    features: [
      {
        title: "Viewing Orchestrator",
        description: "Directly book property viewings based on real-time agent and home availability.",
        icon: "🗝️",
        iconLabel: "Old key"
      },
      {
        title: "Intent & Budget Mapping",
        description: "Capture bedroom counts, location needs, and pre-approval status autonomously.",
        icon: "📍",
        iconLabel: "Round pushpin"
      },
      {
        title: "Valuation Intent Triage",
        description: "Identify and qualify prospective sellers by assessing property address and move timeline.",
        icon: "📈",
        iconLabel: "Chart increasing"
      }
    ],
    stats: [
      { value: "70%", label: "Follow-up Automation" },
      { value: "4x", label: "Booking Speed" },
      { value: "Mobile", label: "First Optimized" }
    ],
    resultMetric: "4x",
    resultLabel: "Booking Speed",
    resultDescription: "We now book viewings 4x faster by removing the manual back-and-forth between agents and buyers.",
    cta: "Scale Your Brokerage"
  },
  {
    slug: "medical",
    industry: "Healthcare & Clinics",
    title: "Sentient Patient Intake",
    icon: "🏥",
    iconLabel: "Hospital building",
    description: "Streamline patient appointments and insurance verification autonomously.",
    heroTitle: "Secure Patient Intake Automation",
    heroSubtitle: "Manage appointment requests, verify insurance details, and triage common inquiries securely and instantly.",
    heroBadge: "Healthcare & MedTech",
    problemPoints: [
      "Front desk staff overwhelmed by repetitive administrative inquiries.",
      "Patients waiting on hold to schedule simple appointments.",
      "Manual insurance verification causing delays in patient care.",
      "Poor accessibility for patients in different time zones or schedules."
    ],
    features: [
      {
        title: "Appointment Management",
        description: "Allow patients to request slots and provide preliminary triage data without a phone call.",
        icon: "🩺",
        iconLabel: "Stethoscope"
      },
      {
        title: "Insurance Data Gathering",
        description: "Collect insurance providers and plan types to verify coverage before the visit.",
        icon: "💳",
        iconLabel: "Credit card"
      },
      {
        title: "Office Intelligence",
        description: "Provide directions, parking info, and office hours instantly from your knowledge base.",
        icon: "📍",
        iconLabel: "Round pushpin"
      }
    ],
    stats: [
      { value: "60%", label: "Call Volume Drop" },
      { value: "HIPAA", label: "Security Standard" },
      { value: "100%", label: "Inclusivity Rate" }
    ],
    resultMetric: "60%",
    resultLabel: "Call Volume Drop",
    resultDescription: "The clinic reduced phone inquiries by 60% by automating routine intake and FAQ responses.",
    cta: "Optimize Your Clinic"
  },
  {
    slug: "home-services",
    industry: "Home Services",
    title: "Autonomous Service Dispatch",
    icon: "🛠️",
    iconLabel: "Hammer and wrench",
    description: "Triage emergency repair calls and schedule service appointments autonomously 24/7.",
    heroTitle: "Always-On Emergency Triage",
    heroSubtitle: "Qualify job urgency, collect site data, and schedule HVAC, plumbing, or electrical technicians instantly.",
    heroBadge: "Home Services & Trade",
    problemPoints: [
      "Missing high-ticket emergency calls after-hours or during busy periods.",
      "High cost of answering services that can't schedule or triage technical issues.",
      "Customers choosing competitors due to slow callback times for quotes.",
      "Technicians arriving at jobs without proper preliminary site data."
    ],
    features: [
      {
        title: "Emergency Triage Agent",
        description: "Identify and prioritize 'total system failure' calls vs. routine maintenance autonomously.",
        icon: "🚨",
        iconLabel: "Police car light"
      },
      {
        title: "Autonomous Scheduling",
        description: "Directly book service windows based on technician zones and availability.",
        icon: "📅",
        iconLabel: "Calendar"
      },
      {
        title: "Photo & Data Intake",
        description: "Collect model numbers and issue descriptions to ensure technicians arrive prepared.",
        icon: "📸",
        iconLabel: "Camera"
      }
    ],
    stats: [
      { value: "85%", label: "Emergency Capture" },
      { value: "0ms", label: "Wait Time" },
      { value: "24/7", label: "Dispatch Ready" }
    ],
    resultMetric: "85%",
    resultLabel: "Emergency Capture",
    resultDescription: "By being available 24/7, we captured 85% more emergency service calls compared to our previous answering service.",
    cta: "Scale Your Service Business"
  },
  {
    slug: "education",
    industry: "Education & EdTech",
    title: "Sentient Enrollment Advisor",
    icon: "🎓",
    iconLabel: "Graduation cap",
    description: "Guide prospective students through program discovery and application initiation.",
    heroTitle: "Scale Your Admissions Funnel",
    heroSubtitle: "Answer program-specific questions, qualify enrollment intent, and guide students to their next steps 24/7.",
    heroBadge: "EdTech & Education",
    problemPoints: [
      "Inbound applicants waiting days for counselor responses.",
      "High volume of repetitive questions about fees and deadlines.",
      "Difficulty in qualifying enrollment intent at scale.",
      "Lost leads from international students in different time zones."
    ],
    features: [
      {
        title: "Autonomous Program Guide",
        description: "Match students with the right courses based on their career goals and prerequisites.",
        icon: "📚",
        iconLabel: "Books"
      },
      {
        title: "Application Navigator",
        description: "Provide instant answers on deadlines, requirements, and financial aid from your knowledge base.",
        icon: "📝",
        iconLabel: "Memo"
      },
      {
        title: "Admissions Sync",
        description: "Schedule sessions with enrollment counselors for high-intent, qualified applicants.",
        icon: "🧑‍🏫",
        iconLabel: "Teacher"
      }
    ],
    stats: [
      { value: "45%", label: "Enrollment Lift" },
      { value: "24/7", label: "Advisor Support" },
      { value: "Global", label: "Multi-language" }
    ],
    resultMetric: "45%",
    resultLabel: "Enrollment Lift",
    resultDescription: "We saw a 45% increase in total enrollments by being available to students 24/7.",
    cta: "Boost Your Enrollment"
  },
  {
    slug: "ecommerce",
    industry: "Luxury E-commerce",
    title: "Sentient Sales Associate",
    icon: "🛍️",
    iconLabel: "Shopping bags",
    description: "Reduce cart decay and answer complex product questions autonomously.",
    heroTitle: "Turn Browsers into High-Value Buyers",
    heroSubtitle: "Provide sub-second technical product details, size guides, and purchase assistance to close high-ticket sales.",
    heroBadge: "E-commerce",
    problemPoints: [
      "Cart abandonment on high-ticket items due to unanswered questions.",
      "High volume of routine support tickets regarding returns and shipping.",
      "Friction in finding the right product variant or size.",
      "Lost sales opportunities during off-peak support hours."
    ],
    features: [
      {
        title: "Deep Product Knowledge",
        description: "Answer complex technical and aesthetic questions that standard FAQ pages miss.",
        icon: "🏷️",
        iconLabel: "Price tag"
      },
      {
        title: "Abandonment Interception",
        description: "Identify and engage users showing exit intent on high-value cart items with sentient offers.",
        icon: "🛒",
        iconLabel: "Shopping cart"
      },
      {
        title: "Autonomous Support",
        description: "Manage pre-sale inquiries and policy questions instantly to remove buying friction.",
        icon: "📦",
        iconLabel: "Package"
      }
    ],
    stats: [
      { value: "25%", label: "AOV Increase" },
      { value: "70%", label: "Support Deflection" },
      { value: "15%", label: "Conversion Lift" }
    ],
    resultMetric: "25%",
    resultLabel: "AOV Increase",
    resultDescription: "Providing sub-second technical advice and upsells led to a 25% increase in average order value for luxury goods.",
    cta: "Optimize Sales Velocity"
  }
];
