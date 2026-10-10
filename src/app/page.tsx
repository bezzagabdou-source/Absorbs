"use client";

import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import {
  Features,
  Marquee,
  ToolsShowcase,
} from "@/components/landing/sections";
import { Pricing } from "@/components/landing/pricing";
import { CtaBand, Faq, Footer } from "@/components/landing/faq-footer";

export default function LandingPage() {
  return (
    <div className="relative min-h-[100dvh]">
      <Navbar />
      <main>
        <Hero />
        <Marquee />
        <Features />
        <ToolsShowcase />
        <Pricing />
        <Faq />
        <CtaBand />
      </main>
      <Footer />
    </div>
  );
}
