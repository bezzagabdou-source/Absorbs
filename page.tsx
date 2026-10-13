import { AuthProvider } from "@/lib/auth-context";
import { AuthGate } from "@/components/auth-gate";
import { NexusProvider } from "@/lib/store";
import { AppShell } from "@/components/app-shell";

export default function Home() {
  return (
    <AuthProvider>
      <AuthGate>
        <NexusProvider>
          <AppShell />
        </NexusProvider>
      </AuthGate>
    </AuthProvider>
  );
}
