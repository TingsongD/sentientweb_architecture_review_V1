"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { siteConfig } from "@/config/site";
import { productPages } from "@/config/products";
import { solutions } from "@/config/solutions";
import { cn } from "@/lib/utils";

const menuItems = [
  {
    title: "Product",
    dropdown: productPages
      .filter((p) => p.featuredInHeader)
      .map((p) => ({
        name: p.label,
        desc: p.description,
        icon: p.icon,
        iconLabel: p.label,
        href: p.href,
      })),
  },
  {
    title: "Solutions",
    dropdown: solutions.map((s) => ({
      name: s.industry,
      desc: s.description.split(".")[0], // Use first sentence as short desc
      icon: s.icon,
      iconLabel: s.iconLabel,
      href: `/solutions/${s.slug}`,
    })),
  },
  { title: "Pricing", dropdown: null, href: "/#cta" },
] as const;

const megaMenuId = "header-mega-menu";

export default function Header() {
  const pathname = usePathname();
  const [activeMenu, setActiveMenu] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const hasOpenedRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const useDarkHeroHeader =
    !scrolled &&
    (pathname.startsWith("/solutions/") || pathname.startsWith("/product/"));
  const navItemClass = cn(
    "rounded-sm px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-violet/40",
    useDarkHeroHeader
      ? "text-white/80 hover:text-white"
      : "text-black/70 hover:text-black",
  );
  const loginButtonClass = cn(
    buttonVariants({ variant: "ghost" }),
    "hidden text-sm font-medium sm:inline-flex",
    useDarkHeroHeader
      ? "text-white/80 hover:bg-white/10 hover:text-white"
      : "text-black/70 hover:text-black",
  );
  const mobileToggleClass = cn(
    "inline-flex rounded-md p-2 md:hidden focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-violet/40",
    useDarkHeroHeader
      ? "text-white hover:bg-white/10 hover:text-white"
      : "text-black",
  );

  const handleMouseEnter = (idx: number) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setActiveMenu(idx);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setActiveMenu(null);
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveMenu(null);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!mobileOpen) {
      if (hasOpenedRef.current) {
        menuToggleRef.current?.focus();
      }
      return;
    }
    hasOpenedRef.current = true;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      const el = mobilePanelRef.current?.querySelector<HTMLElement>(
        "a, button",
      );
      el?.focus();
    }, 0);
    return () => {
      document.body.style.overflow = "";
      window.clearTimeout(t);
    };
  }, [mobileOpen]);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        useDarkHeroHeader
          ? "border-b border-white/10 bg-black/35 py-4 backdrop-blur-md"
          : scrolled
          ? "border-b border-gray-100 bg-white/80 py-3 backdrop-blur-md"
          : "bg-transparent py-6",
      )}
    >
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6">
        <Link
          href="/"
          className="flex cursor-pointer items-center gap-2 rounded-sm focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-violet/40"
        >
          <Image
            src="/logo.png"
            alt="SentientWeb Logo"
            width={32}
            height={32}
            className="h-8 w-auto"
            priority
          />
          <span className="bg-gradient-to-r from-brand-violet to-brand-sky bg-clip-text text-xl font-bold tracking-tight text-transparent">
            SentientWeb
          </span>
        </Link>

        <nav
          className="relative hidden items-center gap-1 md:flex"
          aria-label="Primary"
          onMouseLeave={handleMouseLeave}
        >
          {menuItems.map((item, idx) => (
            <div key={item.title} className="relative py-2">
              {item.dropdown ? (
                <button
                  type="button"
                  className={cn("group cursor-pointer", navItemClass)}
                  aria-expanded={activeMenu === idx}
                  aria-haspopup="true"
                  aria-controls={activeMenu === idx ? megaMenuId : undefined}
                  onMouseEnter={() => handleMouseEnter(idx)}
                  onFocus={() => handleMouseEnter(idx)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveMenu((prev) => (prev === idx ? null : idx));
                    }
                  }}
                >
                  <span className="flex items-center gap-1">
                    {item.title}
                    <svg
                      className={cn(
                        "h-3 w-3 transition-transform duration-300",
                        activeMenu === idx && "rotate-180",
                      )}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </span>
                </button>
              ) : (
                <Link
                  href={item.href ?? "/"}
                  prefetch={false}
                  className={cn("block", navItemClass)}
                >
                  {item.title}
                </Link>
              )}
            </div>
          ))}

          <AnimatePresence>
            {activeMenu !== null && menuItems[activeMenu].dropdown && (
              <motion.div
                id={megaMenuId}
                role="menu"
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.2, ease: "circOut" }}
                onMouseEnter={() => {
                  if (timeoutRef.current) clearTimeout(timeoutRef.current);
                }}
                onMouseLeave={handleMouseLeave}
                className={cn(
                  "absolute top-full left-1/2 mt-2 -translate-x-1/2 overflow-hidden rounded-xl border border-gray-100 bg-white p-6 shadow-2xl transition-all duration-300",
                  menuItems[activeMenu].dropdown && menuItems[activeMenu].dropdown!.length > 3
                    ? "w-[640px]"
                    : "w-[480px]"
                )}
              >
                <div className={cn(
                  "grid gap-4",
                  menuItems[activeMenu].dropdown && menuItems[activeMenu].dropdown!.length > 3
                    ? "grid-cols-2"
                    : "grid-cols-1"
                )}>
                  {menuItems[activeMenu].dropdown?.map((sub, i) => (
                    <motion.div
                      key={sub.name}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <Link
                        href={sub.href}
                        prefetch={false}
                        role="menuitem"
                        className="group/item flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-violet-50"
                        onClick={() => setActiveMenu(null)}
                      >
                        <span
                          className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 text-xl shadow-sm transition-colors group-hover/item:bg-white"
                          role="img"
                          aria-label={sub.iconLabel}
                        >
                          {sub.icon}
                        </span>
                        <span>
                          <span className="block text-sm font-bold text-black transition-colors group-hover/item:text-brand-violet">
                            {sub.name}
                          </span>
                          <span className="text-xs text-black/50">{sub.desc}</span>
                        </span>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>

        <div className="flex items-center gap-2 md:gap-4">
          <Link
            href="/#cta"
            prefetch={false}
            className={loginButtonClass}
          >
            Log in
          </Link>
          <Link
            href="/#cta"
            prefetch={false}
            className={cn(
              buttonVariants(),
              "hidden bg-gradient-to-r from-brand-magenta to-brand-blue px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90 sm:inline-flex",
            )}
          >
            Sign up
          </Link>
          <a
            href={`mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent("SentientWeb demo request")}`}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "hidden px-5 py-2.5 text-sm font-medium text-black lg:inline-flex",
            )}
          >
            Get a demo
          </a>

          <button
            ref={menuToggleRef}
            type="button"
            className={mobileToggleClass}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileOpen((o) => !o)}
          >
            <span className="sr-only">{mobileOpen ? "Close menu" : "Open menu"}</span>
            {mobileOpen ? (
              <X className="h-6 w-6" aria-hidden />
            ) : (
              <Menu className="h-6 w-6" aria-hidden />
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            id="mobile-navigation"
            ref={mobilePanelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="border-t border-gray-100 bg-white md:hidden"
          >
            <div className="max-h-[min(70vh,560px)] space-y-6 overflow-y-auto px-6 py-6">
              {menuItems.map((item) => (
                <div key={item.title}>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-black/50">
                    {item.title}
                  </p>
                  {"dropdown" in item && item.dropdown ? (
                    <ul className="space-y-2">
                      {item.dropdown.map((sub) => (
                        <li key={sub.name}>
                          <Link
                            href={sub.href}
                            prefetch={false}
                            className="block rounded-md py-2 text-sm font-medium text-black hover:text-brand-violet focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-violet/40"
                            onClick={() => setMobileOpen(false)}
                          >
                            {sub.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Link
                      href={item.href ?? "/"}
                      prefetch={false}
                      className="block rounded-md py-2 text-sm font-medium text-black hover:text-brand-violet focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-violet/40"
                      onClick={() => setMobileOpen(false)}
                    >
                      {item.title}
                    </Link>
                  )}
                </div>
              ))}
              <div className="flex flex-col gap-2 border-t border-gray-100 pt-4">
                <Link
                  href="/#cta"
                  prefetch={false}
                  className={cn(
                    buttonVariants({ variant: "ghost" }),
                    "w-full justify-center",
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  Log in
                </Link>
                <Link
                  href="/#cta"
                  prefetch={false}
                  className={cn(
                    buttonVariants(),
                    "w-full justify-center bg-gradient-to-r from-brand-magenta to-brand-blue text-white hover:opacity-90",
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  Sign up
                </Link>
                <a
                  href={`mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent("SentientWeb demo request")}`}
                  className={cn(buttonVariants({ variant: "outline" }), "w-full justify-center")}
                  onClick={() => setMobileOpen(false)}
                >
                  Get a demo
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
