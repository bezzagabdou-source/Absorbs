import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatPage } from "@/components/app/chat";
import { ChatSkeleton } from "@/components/chat-skeleton";
import { ArtifactsProvider } from "@/components/chat/artifacts-panel";

export const metadata: Metadata = {
  title: "المحادثة",
};

export default function Page() {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <ArtifactsProvider>
        <ChatPage />
      </ArtifactsProvider>
    </Suspense>
  );
}
