"use client";

import React, { useState } from 'react';

const features = [
  {
    title: 'Lead Qualification',
    description: [
      'Asks the right questions — company size, use case, timeline.',
      'Deterministic BANT-lite scoring ensures high-quality meetings.',
      'Routes enterprise leads to sales and SMBs to automation.'
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <polyline points="16 11 18 13 22 9" />
      </svg>
    )
  },
  {
    title: 'Demo Booking',
    description: [
      'Books meetings directly on the sales team\'s calendar.',
      'Native Calendly integration with UUID validation.',
      'Zero friction: no forms, just a natural conversation.'
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    )
  },
  {
    title: 'Product Q&A',
    description: [
      'Answers technical questions from your docs and knowledge base.',
      'Hybrid Search (Vector + FTS) ensures high-fidelity results.',
      'Sub-1.2s TTFT provides a "sentient" response feel.'
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    )
  },
  {
    title: 'Proactive Engagement',
    description: [
      'Detects high intent (pricing page, return visits).',
      'Engages at the right moment based on behavioral scores.',
      'Reduces bounce rate and increases conversion directly.'
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    )
  },
  {
    title: 'CRM Integration (Phase 2)',
    description: [
      'Creates records in HubSpot or Salesforce automatically.',
      'Full conversation context synced to the lead record.',
      'Queue-based retry mechanism ensures zero data loss.'
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    )
  },
  {
    title: 'Content Flywheel',
    description: [
      'Phase 2: Remotion-powered video generation from your docs.',
      'Auto-posts hooks to X and LinkedIn to drive traffic.',
      'Feedback loop: top questions generate new videos.'
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    )
  }
];

const FeaturesSection = () => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <section
      id="features"
      className="w-full border-t border-gray-100 bg-white py-24"
    >
      <div className="max-w-[1200px] mx-auto px-4">
        <h2 className="mb-20 bg-gradient-to-r from-brand-violet to-brand-sky bg-clip-text text-center text-[48px] font-normal text-transparent md:text-[64px]">
          Features
        </h2>

        <div className="flex flex-col lg:flex-row gap-12 items-start">
          {/* Visual Container (Sentient HUD) */}
          <div className="sticky top-[var(--header-height)] flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-black p-8 lg:w-1/2">
             <div className="relative h-full w-full">
                {/* Background Glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-brand-violet/20 to-brand-sky/20 blur-3xl" />
                
                {/* HUD Elements */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
                   {/* Central Core */}
                   <div className="relative h-32 w-32">
                      <div className="absolute inset-0 animate-pulse rounded-full border-2 border-brand-violet/40 shadow-[0_0_30px_rgba(147,51,234,0.3)]" />
                      <div className="absolute inset-2 animate-ping rounded-full border border-brand-sky/30" />
                      <div className="absolute inset-0 flex items-center justify-center">
                         <div className="h-4 w-4 rounded-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.8)]" />
                      </div>
                   </div>

                   {/* Data Grid Mockup */}
                   <div className="grid w-full grid-cols-2 gap-4 px-4 font-mono text-[10px] text-brand-sky/60 uppercase tracking-tighter">
                      <div className="flex flex-col gap-1 border-l border-brand-violet/30 pl-2">
                         <span>BANT SCORE: 0.98</span>
                         <div className="h-1 w-full bg-gray-800">
                            <div className="h-full w-[98%] bg-brand-violet" />
                         </div>
                      </div>
                      <div className="flex flex-col gap-1 border-l border-brand-sky/30 pl-2">
                         <span>INTENT: HIGH</span>
                         <div className="h-1 w-full bg-gray-800">
                            <div className="h-full w-[85%] bg-brand-sky" />
                         </div>
                      </div>
                   </div>

                   {/* Terminal Snippet */}
                   <div className="w-full rounded bg-gray-900/50 p-3 font-mono text-[10px] text-green-400/70 shadow-inner">
                      <p className="">{">"} Qualifying lead: Enterprise...</p>
                      <p className="">{">"} Score threshold met (0.95+)</p>
                      <p className="animate-pulse">{">"} Booking demo on sales calendar...</p>
                   </div>
                </div>

                {/* Decorative Rings */}
                <div className="absolute inset-0 -z-10 animate-[spin_10s_linear_infinite] opacity-10">
                   <div className="absolute inset-0 rounded-full border-[0.5px] border-dashed border-white" />
                </div>
             </div>
          </div>

          {/* Features List */}
          <div role="tablist" aria-label="Features" className="w-full lg:w-1/2 flex flex-col border-t border-gray-200">
            {features.map((feature, index) => (
              <button
                key={feature.title}
                type="button"
                role="tab"
                aria-selected={activeTab === index}
                aria-controls={`feature-panel-${index}`}
                id={`feature-tab-${index}`}
                className={`group w-full cursor-pointer border-b border-gray-200 text-left transition-colors duration-500 focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-violet/40 ${activeTab === index ? "bg-violet-50" : "bg-white hover:bg-gray-50"}`}
                onClick={() => setActiveTab(index)}
              >
                <div className="flex items-start gap-4 p-8">
                  <div
                    className={`mt-1 rounded-sm border p-2 ${activeTab === index ? "border-gray-300 bg-white" : "border-transparent bg-gray-100"}`}
                  >
                    {feature.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="mb-4 font-mono text-[18px] font-medium text-black">
                      {feature.title}
                    </h3>
                    <div
                      id={`feature-panel-${index}`}
                      role="tabpanel"
                      tabIndex={activeTab === index ? 0 : -1}
                      aria-labelledby={`feature-tab-${index}`}
                      className={`overflow-hidden transition-all duration-500 ease-in-out ${activeTab === index ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"}`}
                    >
                      <ul className="list-disc space-y-2 pb-4 pl-5 text-[16px] text-black/70">
                        {feature.description.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
