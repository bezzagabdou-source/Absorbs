import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatPage } from "@/components/app/chat";
import { ArtifactsProvider } from "@/components/chat/artifacts-panel";

export const metadata: Metadata = {
  title: "المحادثة",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ArtifactsProvider>
        <ChatPage />
      </ArtifactsProvider>
    </Suspense>
  );
}
