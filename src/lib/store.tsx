"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_MODEL } from "@/lib/models";
import { apiFetch } from "@/lib/auth-context";

export type Conversation = {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  conversationId?: string;
  role: "user" | "assistant";
  content: string;
  model?: string | null;
  createdAt?: string;
  pending?: boolean;
};

type Store = {
  conversations: Conversation[];
  loadingList: boolean;
  activeId: string | null;
  messages: ChatMessage[];
  loadingThread: boolean;
  streaming: boolean;
  sidebarOpen: boolean;
  model: string;
  setModel: (m: string) => void;
  setSidebarOpen: (open: boolean) => void;
  newChat: () => void;
  selectConversation: (id: string) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  regenerate: () => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

export function useNexus(): Store {
  const store = useContext(Ctx);
  if (!store) throw new Error("useNexus must be used inside <NexusProvider>");
  return store;
}

async function readSSE(res: Response, onEvent: (event: string, data: Record<string, string | null>) => void) {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
      }
      if (dataLines.length) {
        try {
          onEvent(event, JSON.parse(dataLines.join("\n")));
        } catch {
          /* malformed frame — skip */
        }
      }
    }
  }
}

export function NexusProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const streamAbort = useRef(0);

  /* initial conversation list */
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/conversations")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setConversations(d.conversations ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadThread = useCallback(async (id: string) => {
    setLoadingThread(true);
    setMessages([]);
    try {
      const res = await apiFetch(`/api/conversations/${id}`);
      const data = await res.json();
      if (res.ok) {
        setMessages(data.messages ?? []);
        if (data.conversation?.model) setModel(data.conversation.model);
      }
    } catch {
      /* network hiccup — keep empty */
    } finally {
      setLoadingThread(false);
    }
  }, []);

  const selectConversation = useCallback(
    (id: string) => {
      if (streaming) return; // never tear down an active stream
      setActiveId(id);
      setSidebarOpen(false);
      void loadThread(id);
    },
    [loadThread, streaming],
  );

  const newChat = useCallback(() => {
    if (streaming) return;
    setActiveId(null);
    setMessages([]);
    setSidebarOpen(false);
  }, [streaming]);

  /** Core send routine — also used by regenerate. */
  const runStream = useCallback(
    async (text: string, conversationId: string | null) => {
      const ticket = ++streamAbort.current;
      setStreaming(true);
      const assistantId = `stream-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: text, pending: true },
      ]);
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", model, pending: true },
      ]);

      try {
        const res = await apiFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, message: text, model }),
        });
        if (res.status === 403) {
          const d = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(d.message ?? "PRO_MODEL_REQUIRED");
        }
        if (!res.ok || !res.body) throw new Error(`http_${res.status}`);

        await readSSE(res, (event, data) => {
          if (ticket !== streamAbort.current) return;
          if (event === "meta") {
            const convId = data.conversationId as string;
            const title = data.title as string | null;
            const userMessageId = data.userMessageId as string;
            setActiveId(convId);
            if (title) {
              setConversations((prev) => [
                {
                  id: convId,
                  title,
                  model,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
                ...prev,
              ]);
            }
            setMessages((prev) =>
              prev.map((m) => (m.pending && m.role === "user" ? { ...m, id: userMessageId, pending: false, conversationId: convId } : m)),
            );
          } else if (event === "delta") {
            const delta = data.text ?? "";
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m)),
            );
          } else if (event === "done") {
            const assistantMessageId = data.assistantMessageId as string;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, id: assistantMessageId, pending: false } : m)),
            );
          } else if (event === "error") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: "حدث خلل أثناء توليد الإجابة — حاول مرة أخرى.", pending: false }
                  : m,
              ),
            );
          }
        });
      } catch (err) {
        if (ticket === streamAbort.current) {
          const proMsg = err instanceof Error && !err.message.startsWith("http_") && err.message !== "Failed to fetch" ? err.message : null;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: proMsg ?? "تعذّر الاتصال بالخادم. تحقّق من الشبكة وأعد المحاولة.", pending: false }
                : m,
            ),
          );
        }
      } finally {
        if (ticket === streamAbort.current) setStreaming(false);
      }
    },
    [model],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      await runStream(trimmed, activeId);
    },
    [activeId, runStream, streaming],
  );

  const stop = useCallback(() => {
    streamAbort.current += 1; // invalidate the in-flight stream
    setStreaming(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.pending && m.role === "assistant"
          ? { ...m, pending: false, content: m.content || "تم إيقاف التوليد." }
          : m,
      ),
    );
  }, []);

  const regenerate = useCallback(async () => {
    if (streaming) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user" && !m.pending);
    if (!lastUser) return;
    setMessages((prev) => {
      const idx = prev.map((m) => m.role).lastIndexOf("assistant");
      return idx === -1 ? prev : prev.slice(0, idx);
    });
    await runStream(lastUser.content, activeId);
  }, [activeId, messages, runStream, streaming]);

  const renameConversation = useCallback(async (id: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: clean } : c)));
    await apiFetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: clean }),
    }).catch(() => {});
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
      await apiFetch(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => {});
    },
    [activeId],
  );

  const value = useMemo<Store>(
    () => ({
      conversations,
      loadingList,
      activeId,
      messages,
      loadingThread,
      streaming,
      sidebarOpen,
      model,
      setModel,
      setSidebarOpen,
      newChat,
      selectConversation,
      send,
      stop,
      regenerate,
      renameConversation,
      deleteConversation,
    }),
    [
      conversations,
      loadingList,
      activeId,
      messages,
      loadingThread,
      streaming,
      sidebarOpen,
      model,
      newChat,
      selectConversation,
      send,
      stop,
      regenerate,
      renameConversation,
      deleteConversation,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
