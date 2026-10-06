import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { ProWelcomeGate } from "@/components/pro-welcome-gate";
import { TrialWelcome } from "@/components/trial-welcome";
import { BackgroundJobs } from "@/components/background-jobs";

export const metadata: Metadata = {
  title: "التطبيق",
  robots: { index: false, follow: false },
};

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppShell>
      <ProWelcomeGate />
      <TrialWelcome />
      <BackgroundJobs />
      {children}
    </AppShell>
  );
}
