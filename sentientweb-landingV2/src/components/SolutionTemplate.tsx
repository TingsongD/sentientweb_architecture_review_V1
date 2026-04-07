"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';
import { TrendingUp, Bot, Zap } from 'lucide-react';

interface SolutionTemplateProps {
  industry: string;
  title: string;
  description: string;
  heroBadge?: string;
  problemPoints: string[];
  solutionPoints: {
    title: string;
    description: string;
    icon: React.ReactNode;
    iconLabel?: string;
  }[];
  stats?: {
    value: string;
    label: string;
  }[];
  resultMetric: string;
  resultLabel: string;
  resultDescription: string;
  ctaText?: string;
}

export default function SolutionTemplate({
  industry,
  title,
  description,
  heroBadge = "Industry Solution",
  problemPoints,
  solutionPoints,
  stats,
  resultMetric,
  resultLabel,
  resultDescription,
  ctaText = "Get Started with SentientWeb"
}: SolutionTemplateProps) {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden bg-black">
        {/* Abstract Background */}
        <div className="absolute inset-0 z-0" aria-hidden="true">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-violet/20 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-brand-sky/20 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/2" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08)_0%,transparent_32%,transparent_68%,rgba(255,255,255,0.04)_100%)] opacity-60" />
          <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.06)_0,rgba(255,255,255,0.06)_2px,transparent_2px,transparent_14px)] opacity-15" />
        </div>

        <div className="container relative z-10 px-6 mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-4xl"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 text-xs font-mono font-medium tracking-tighter uppercase border rounded-full border-brand-violet/30 bg-brand-violet/10 text-brand-violet">
              <Bot className="w-3 h-3" aria-hidden="true" />
              <span>{heroBadge}</span>
            </div>
            <h1 className="text-5xl font-medium tracking-tight text-white md:text-7xl mb-6">
              {title}
            </h1>
            <p className="text-xl text-gray-400 mb-10 max-w-2xl leading-relaxed">
              {description}
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Link 
                href="/#cta" 
                className={cn(
                  buttonVariants({ variant: 'default' }),
                  "h-14 px-8 bg-gradient-to-r from-brand-magenta to-brand-blue border-0 rounded-sm text-lg font-medium shadow-lg shadow-brand-magenta/20"
                )}
              >
                {ctaText}
              </Link>
              <Link 
                href="/#features" 
                className={cn(
                  buttonVariants({ variant: 'ghost' }),
                  "h-14 px-8 rounded-sm border border-white/70 bg-white text-lg font-medium text-black shadow-lg shadow-black/25 hover:bg-white/90 hover:text-black focus-visible:ring-white/30"
                )}
              >
                Learn How It Works
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Section (New) */}
      {stats && stats.length > 0 && (
        <section className="bg-gray-50 border-b border-gray-100 py-16" aria-label="Key Performance Indicators">
          <div className="container px-6 mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
              {stats.map((stat, i) => (
                <div key={i} className="space-y-2">
                  <div className="text-5xl font-bold tracking-tight text-brand-violet">
                    {stat.value}
                  </div>
                  <div className="text-sm font-medium text-black/40 uppercase tracking-[0.2em] font-mono">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* The Problem Section */}
      <section className="py-24 bg-white">
        <div className="container px-6 mx-auto">
          <div className="flex flex-col lg:flex-row gap-16 items-center">
            <div className="w-full lg:w-1/2">
              <h2 className="text-3xl font-medium tracking-tight text-black mb-6">
                The Challenge in {industry}
              </h2>
              <div className="space-y-4">
                {problemPoints.map((point, i) => (
                  <div key={i} className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-100 rounded-sm shadow-sm">
                    <div className="mt-1.5 flex-shrink-0 w-2 h-2 rounded-full bg-red-500" aria-hidden="true" />
                    <p className="text-gray-600 font-medium">{point}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="w-full lg:w-1/2">
              <div className="p-8 bg-black rounded-sm border border-brand-violet/20 shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-brand-violet/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                <Bot className="w-12 h-12 text-brand-violet mb-6" aria-hidden="true" />
                <h3 className="text-2xl font-medium text-white mb-4">The Sentient Advantage</h3>
                <p className="text-gray-400 leading-relaxed mb-6">
                  Traditional chatbots are reactive and generic. SentientWeb is the only autonomous agent that takes real actions — qualifying, booking, and answering specifically for {industry} workflows.
                </p>
                
                {/* Scorecard Visual */}
                <div className="mb-6 p-4 rounded bg-gray-900/50 border border-white/5 font-mono text-[10px]" aria-hidden="true">
                  <div className="flex justify-between mb-1">
                    <span className="text-brand-violet">BANT_SCORE</span>
                    <span className="text-white">0.98</span>
                  </div>
                  <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden mb-3">
                    <div className="h-full bg-brand-violet w-[98%]" />
                  </div>
                  <div className="flex justify-between mb-1">
                    <span className="text-brand-sky">INTENT_CONFIDENCE</span>
                    <span className="text-white">HIGH</span>
                  </div>
                  <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-sky w-[92%]" />
                  </div>
                </div>

                <div className="flex items-center gap-2 text-brand-sky font-mono text-sm font-bold">
                  <Zap className="w-4 h-4" aria-hidden="true" />
                  <span>AUTONOMOUS {industry.toUpperCase()} AGENT ACTIVE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Features */}
      <section className="py-24 bg-gray-50 border-y border-gray-100">
        <div className="container px-6 mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-4xl font-medium tracking-tight text-black mb-6">
              How SentientWeb Transforms Your Funnel
            </h2>
            <p className="text-xl text-gray-500">
              Tailored autonomous workflows designed specifically for {industry} requirements.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {solutionPoints.map((point, i) => (
              <motion.div 
                key={i}
                whileHover={{ y: -5 }}
                className="p-8 border border-gray-100 rounded-sm hover:border-brand-violet/20 hover:shadow-xl transition-all"
              >
                <div className="w-12 h-12 mb-6 text-brand-violet" role="img" aria-label={point.iconLabel}>
                  {point.icon}
                </div>
                <h3 className="text-xl font-medium text-black mb-4">{point.title}</h3>
                <p className="text-gray-500 leading-relaxed">{point.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Results/Case Study Section */}
      <section className="py-24 bg-black overflow-hidden relative">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-white rounded-full animate-[ping_10s_linear_infinite]" />
        </div>
        
        <div className="container relative z-10 px-6 mx-auto">
          <div className="max-w-4xl mx-auto text-center">
            <TrendingUp className="w-16 h-16 text-brand-sky mx-auto mb-8" />
            <div className="mb-4 text-7xl md:text-9xl font-medium tracking-tighter text-white bg-clip-text">
              {resultMetric}
            </div>
            <div className="text-2xl font-medium text-brand-sky mb-8 uppercase tracking-widest">{resultLabel}</div>
            <p className="text-2xl text-gray-400 mb-12 italic leading-relaxed">
              &quot;{resultDescription}&quot;
            </p>
            <div className="flex flex-wrap justify-center items-center gap-12 border-t border-white/10 pt-12">
              {stats && stats.length > 0 ? (
                stats.map((stat, i) => (
                  <div key={i} className="text-center min-w-[120px]">
                    <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                    <div className="text-xs text-gray-500 uppercase tracking-widest font-mono">{stat.label}</div>
                  </div>
                ))
              ) : (
                <>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-white mb-1">24/7</div>
                    <div className="text-xs text-gray-500 uppercase tracking-widest font-mono">Uptime</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-white mb-1">&lt;1.2s</div>
                    <div className="text-xs text-gray-500 uppercase tracking-widest font-mono">Response Time</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-white mb-1">0ms</div>
                    <div className="text-xs text-gray-500 uppercase tracking-widest font-mono">Wait Time</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-brand-violet">
        <div className="container px-6 mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-white mb-8">
            Ready to Automate Your {industry} Leads?
          </h2>
          <p className="text-xl text-white/80 mb-12 max-w-2xl mx-auto leading-relaxed">
            Join the forward-thinking firms using SentientWeb to qualify leads, book meetings, and scale their business 24/7.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row justify-center">
            <Link 
              href="/#cta" 
              className={cn(
                buttonVariants({ variant: 'default' }),
                "h-16 px-10 bg-white text-brand-violet hover:bg-gray-100 border-0 rounded-sm text-xl font-medium shadow-2xl"
              )}
            >
              Book a Demo
            </Link>
            <Link 
              href="/#features" 
              className={cn(
                buttonVariants({ variant: 'outline' }),
                "h-16 px-10 border-white text-white hover:bg-white/10 rounded-sm text-xl font-medium"
              )}
            >
              See the Platform
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
