"use client";

import {
  AlertCircle,
  ArrowDown,
  Check,
  Cpu,
  FolderGit2,
  Info,
  MessageSquare,
  Radio,
  RotateCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, opencodeApi } from "@/lib/opencode/client";
import type {
  Message,
  MessageInfo,
  ModelInfo,
  ModelRef,
  OpenCodeEvent,
  Part,
  PermissionRequest,
  QuestionRequest,
  ServerStatus,
  Session,
} from "@/lib/opencode/types";
import { PermissionCard, QuestionCard } from "./approval";
import { Composer } from "./composer";
import { MessageItem, TypingIndicator } from "./message-item";
import { InfoSheet, ModelsSheet, SessionsSheet } from "./sheets";
import {
  IconButton,
  Spinner,
  StatusPill,
  ToastStack,
  cn,
  copyText,
  useToasts,
} from "./ui";

const SESSION_KEY = "opencode.dashboard.sessionId";
const MODEL_KEY = "opencode.dashboard.model";

const QUICK_PROMPTS = [
  {
    label: "اشرح المشروع",
    prompt: "اشرح بنية هذا المشروع بإيجاز: ما هي المكونات الرئيسية وكيف تعمل؟",
  },
  {
    label: "أصلح البناء",
    prompt: "شغّل build المشروع، وإذا كان هناك خطأ أصلحه ثم اشرح ما فعلته.",
  },
  {
    label: "راجع الكود",
    prompt: "راجع الكود في هذا المشروع واقترح أهم التحسينات مع أمثلة.",
  },
  {
    label: "اكتب commit",
    prompt: "اكتب رسالة commit مناسبة للتغييرات الحالية في Git.",
  },
];

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "حدث خطأ غير متوقع";
}

function parseModel(raw: string | null): ModelRef | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "auto") return null;
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash === trimmed.length - 1) return null;
  return { providerID: trimmed.slice(0, slash), modelID: trimmed.slice(slash + 1) };
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function OpenCodeDashboard() {
  const { toasts, push, dismiss } = useToasts();

  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Record<string, Message>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | undefined>();
  const [model, setModel] = useState<ModelRef | null>(null);

  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [questions, setQuestions] = useState<QuestionRequest[]>([]);

  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [restarting, setRestarting] = useState(false);

  const [input, setInput] = useState("");
  const [focusSignal, setFocusSignal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"sessions" | "models" | "info" | null>(null);
  const [sseState, setSseState] = useState<"connecting" | "live" | "offline">("connecting");
  const [sseKey, setSseKey] = useState(0);
  const [lastToolActivity, setLastToolActivity] = useState<{ tool: string; at: number } | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Record<string, Message>>({});
  const busyStartedAt = useRef<number | null>(null);
  const busyParentRef = useRef<string | null>(null);
  const sessionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [showScrollDown, setShowScrollDown] = useState(false);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const connected = status?.connected ?? false;
  const currentSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) ?? null,
    [sessions, sessionId],
  );

  const orderedMessages = useMemo(
    () => order.map((id) => messages[id]).filter((message): message is Message => Boolean(message)),
    [order, messages],
  );

  const modelLabel = useMemo(() => {
    if (model) {
      const found = models.find(
        (item) => item.providerID === model.providerID && item.modelID === model.modelID,
      );
      return found?.name ?? `${model.providerID}/${model.modelID}`;
    }
    const lastAssistant = [...orderedMessages]
      .reverse()
      .find((message) => message.info.role === "assistant" && message.info.modelID);
    if (lastAssistant?.info.modelID) return lastAssistant.info.modelID;
    return "تلقائي";
  }, [model, models, orderedMessages]);

  const pendingPermission = useMemo(
    () => permissions.find((permission) => permission.sessionID === sessionId) ?? null,
    [permissions, sessionId],
  );
  const pendingQuestion = useMemo(
    () => questions.find((question) => question.sessionID === sessionId) ?? null,
    [questions, sessionId],
  );
  const otherPendingCount = useMemo(
    () =>
      permissions.filter((permission) => permission.sessionID !== sessionId).length +
      questions.filter((question) => question.sessionID !== sessionId).length,
    [permissions, questions, sessionId],
  );

  // -------------------------------------------------------------------------
  // Message store helpers (ref mirrors state so SSE callbacks stay stable)
  // -------------------------------------------------------------------------

  const upsertMessage = useCallback((message: Message) => {
    const existing = messagesRef.current[message.info.id];
    const next = { ...messagesRef.current, [message.info.id]: message };
    messagesRef.current = next;
    setMessages(next);
    if (!existing) {
      setOrder((prev) =>
        [...prev, message.info.id].sort(
          (a, b) => (next[a]?.info.time.created ?? 0) - (next[b]?.info.time.created ?? 0),
        ),
      );
    }
  }, []);

  const mergeMessages = useCallback((list: Message[]) => {
    const next = { ...messagesRef.current };
    for (const message of list) next[message.info.id] = message;
    messagesRef.current = next;
    setMessages(next);
    setOrder(
      Object.values(next)
        .sort((a, b) => a.info.time.created - b.info.time.created)
        .map((message) => message.info.id),
    );
  }, []);

  const removeMessage = useCallback((id: string) => {
    const next = { ...messagesRef.current };
    delete next[id];
    messagesRef.current = next;
    setMessages(next);
    setOrder((prev) => prev.filter((messageId) => messageId !== id));
  }, []);

  const resetMessages = useCallback(() => {
    messagesRef.current = {};
    setMessages({});
    setOrder([]);
  }, []);

  // -------------------------------------------------------------------------
  // Server data
  // -------------------------------------------------------------------------

  const refreshStatus = useCallback(async (): Promise<ServerStatus | null> => {
    setStatusLoading(true);
    try {
      const next = await opencodeApi.status();
      setStatus(next);
      return next;
    } catch (caught) {
      const message = errorMessage(caught);
      setStatus((prev) =>
        prev
          ? { ...prev, connected: false, error: message }
          : {
              connected: false,
              version: null,
              project: null,
              worktree: null,
              vcs: null,
              sessions: 0,
              authRequired: false,
              hasAuth: false,
              baseUrl: "",
              checkedAt: new Date().toISOString(),
              error: message,
            },
      );
      return null;
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const refreshSessions = useCallback(
    async (options?: { select?: boolean }) => {
      setSessionsLoading(true);
      try {
        const { sessions: list } = await opencodeApi.sessions();
        setSessions(list);
        if (options?.select === false) return;
        const stored = readStored(SESSION_KEY);
        setSessionId((prev) => {
          if (prev && list.some((session) => session.id === prev)) return prev;
          return list.find((session) => session.id === stored)?.id ?? list[0]?.id ?? null;
        });
      } catch {
        /* the status banner already explains connectivity issues */
      } finally {
        setSessionsLoading(false);
      }
    },
    [],
  );

  const refreshPermissions = useCallback(async () => {
    try {
      const data = await opencodeApi.permissions();
      setPermissions(data.permissions ?? []);
      setQuestions(data.questions ?? []);
    } catch {
      /* non-fatal */
    }
  }, []);

  const refreshModels = useCallback(async (force = false) => {
    setModelsLoading(true);
    try {
      const data = await opencodeApi.models(force);
      setModels(data.models ?? []);
      setConnectedProviders(data.connected ?? []);
      setModelsError(data.error);
    } catch (caught) {
      setModelsError(errorMessage(caught));
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const scheduleSessionsRefresh = useCallback(() => {
    if (sessionsTimer.current) return;
    sessionsTimer.current = setTimeout(() => {
      sessionsTimer.current = null;
      void refreshSessions({ select: false });
    }, 1200);
  }, [refreshSessions]);

  /**
   * Safety net for environments where a proxy buffers/blocks SSE: while busy,
   * poll the transcript and clear `busy` when the assistant message completes
   * or errors. `busyParentRef` ties the check to the prompt we just sent.
   */
  const checkBusyCompletion = useCallback(async () => {
    const current = sessionIdRef.current;
    if (!current) return;
    try {
      const { messages: list } = await opencodeApi.messages(current);
      mergeMessages(list);
      const parent = busyParentRef.current;
      const since = busyStartedAt.current ?? 0;
      const lastAssistant = [...list]
        .reverse()
        .find(
          (message) =>
            message.info.role === "assistant" &&
            (parent
              ? message.info.parentID === parent
              : (message.info.time?.created ?? 0) >= since - 5000),
        );
      if (lastAssistant && (lastAssistant.info.time?.completed || lastAssistant.info.error)) {
        setBusy(false);
        busyStartedAt.current = null;
        busyParentRef.current = null;
      }
    } catch {
      /* transient fetch errors are ignored; the next tick retries */
    }
  }, [mergeMessages]);

  // -------------------------------------------------------------------------
  // SSE event handling
  // -------------------------------------------------------------------------

  const handleEvent = useCallback(
    (event: OpenCodeEvent) => {
      const properties = event.properties ?? {};
      const eventSessionID =
        typeof properties.sessionID === "string" ? properties.sessionID : null;
      const current = sessionIdRef.current;

      switch (event.type) {
        case "server.connected": {
          setSseState("live");
          void refreshStatus();
          void refreshSessions({ select: false });
          break;
        }
        case "server.disconnected": {
          setSseState("offline");
          break;
        }
        case "message.updated": {
          const info = properties.info as MessageInfo | undefined;
          if (
            !info ||
            typeof info !== "object" ||
            typeof info.id !== "string" ||
            !current ||
            info.sessionID !== current
          ) {
            break;
          }
          const existing = messagesRef.current[info.id];
          upsertMessage({ info, parts: existing?.parts ?? [] });
          if (info.role === "assistant" && (info.time?.completed || info.error)) {
            const parent = busyParentRef.current;
            if (!parent || info.parentID === parent) {
              setBusy(false);
              busyStartedAt.current = null;
              busyParentRef.current = null;
            }
          }
          break;
        }
        case "message.part.updated": {
          const part = properties.part as Part | undefined;
          if (
            !part ||
            typeof part !== "object" ||
            typeof part.id !== "string" ||
            typeof part.messageID !== "string" ||
            !current ||
            part.sessionID !== current
          ) {
            break;
          }
          const existing = messagesRef.current[part.messageID];
          if (!existing) {
            // tolerate out-of-order frames: create the message shell from the part
            upsertMessage({
              info: {
                id: part.messageID,
                sessionID: part.sessionID,
                role: "assistant",
                time: { created: Date.now() },
              },
              parts: [part],
            });
            break;
          }
          const parts = existing.parts.some((item) => item.id === part.id)
            ? existing.parts.map((item) => (item.id === part.id ? part : item))
            : [...existing.parts, part];
          upsertMessage({ ...existing, parts });
          if (part.type === "tool" && part.state?.status === "running") {
            setLastToolActivity({ tool: part.tool, at: Date.now() });
          }
          break;
        }
        case "message.removed": {
          const messageID = properties.messageID;
          if (typeof messageID === "string") removeMessage(messageID);
          break;
        }
        case "session.error": {
          if (eventSessionID && current && eventSessionID !== current) break;
          const error = properties.error as
            | { name?: string; data?: { message?: unknown } }
            | undefined;
          const raw = error?.data?.message;
          push(
            typeof raw === "string" && raw.trim() ? raw : "حدث خطأ في الجلسة",
            "error",
          );
          setBusy(false);
          busyStartedAt.current = null;
          busyParentRef.current = null;
          break;
        }
        case "session.created":
        case "session.updated": {
          scheduleSessionsRefresh();
          break;
        }
        case "permission.v2.asked":
        case "permission.asked":
        case "question.asked": {
          void refreshPermissions();
          break;
        }
        default:
          break;
      }
    },
    [
      push,
      refreshPermissions,
      refreshSessions,
      refreshStatus,
      removeMessage,
      scheduleSessionsRefresh,
      upsertMessage,
    ],
  );

  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;
    setSseState("connecting");

    try {
      source = new EventSource("/api/opencode/events");
    } catch {
      setSseState("offline");
      return;
    }

    source.onopen = () => {
      if (!cancelled) setSseState("live");
    };
    source.onerror = () => {
      if (!cancelled) setSseState("offline");
    };
    source.onmessage = (event) => {
      if (cancelled) return;
      try {
        const parsed = JSON.parse(event.data) as OpenCodeEvent;
        handleEvent(parsed);
      } catch {
        /* ignore malformed frames */
      }
    };

    return () => {
      cancelled = true;
      source?.close();
    };
  }, [handleEvent, sseKey]);

  // -------------------------------------------------------------------------
  // Bootstrap + persistence
  // -------------------------------------------------------------------------

  useEffect(() => {
    void refreshStatus();
    void refreshSessions();
    void refreshPermissions();
    void refreshModels();
  }, [refreshStatus, refreshSessions, refreshPermissions, refreshModels]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MODEL_KEY);
      if (stored) setModel(parseModel(stored));
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    try {
      if (sessionId) window.localStorage.setItem(SESSION_KEY, sessionId);
      else window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* private mode */
    }
  }, [sessionId]);

  useEffect(() => {
    try {
      if (model) {
        window.localStorage.setItem(MODEL_KEY, `${model.providerID}/${model.modelID}`);
      } else {
        window.localStorage.removeItem(MODEL_KEY);
      }
    } catch {
      /* private mode */
    }
  }, [model]);

  useEffect(() => {
    if (sessionId || sessions.length === 0) return;
    const stored = readStored(SESSION_KEY);
    const found = sessions.find((session) => session.id === stored) ?? sessions[0];
    if (found) {
      sessionIdRef.current = found.id;
      setSessionId(found.id);
    }
  }, [sessions, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      resetMessages();
      setMessagesLoading(false);
      return;
    }
    let cancelled = false;
    setMessagesLoading(true);
    resetMessages();
    opencodeApi
      .messages(sessionId)
      .then(({ messages: list }) => {
        if (cancelled) return;
        mergeMessages(list);
        // if the session was left mid-generation (e.g. after switching tabs),
        // resume the busy indicator so the user can follow or stop it
        const lastAssistant = [...list]
          .reverse()
          .find((message) => message.info.role === "assistant");
        if (lastAssistant && !lastAssistant.info.time?.completed && !lastAssistant.info.error) {
          busyStartedAt.current = Date.now();
          busyParentRef.current = lastAssistant.info.parentID ?? null;
          setBusy(true);
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught));
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, mergeMessages, resetMessages]);

  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const startedAt = busyStartedAt.current ?? Date.now();
    busyStartedAt.current = startedAt;
    setElapsed(Date.now() - startedAt);
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  // safety net: completion + approvals even when a proxy buffers SSE
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      void checkBusyCompletion();
      void refreshPermissions();
    }, 5000);
    return () => clearInterval(timer);
  }, [busy, checkBusyCompletion, refreshPermissions]);

  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (sessionsTimer.current) clearTimeout(sessionsTimer.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Scrolling
  // -------------------------------------------------------------------------

  const scrollToBottom = useCallback((smooth = true) => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    isNearBottomRef.current = true;
    setShowScrollDown(false);
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) scrollToBottom(true);
  }, [messages, busy, scrollToBottom]);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const near = element.scrollHeight - element.scrollTop - element.clientHeight < 140;
    isNearBottomRef.current = near;
    setShowScrollDown(!near);
  }, []);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const handleSend = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed || sending || busy) return false;
      if (!connected) {
        const message = "السيرفر غير متصل — أعد تشغيله أولاً";
        setError(message);
        push(message, "error");
        return false;
      }

      setSending(true);
      setError(null);
      try {
        let current = sessionIdRef.current;
        let created = false;

        if (!current) {
          const { session } = await opencodeApi.createSession({
            title: trimmed.slice(0, 80),
            model: model ?? undefined,
          });
          current = session.id;
          created = true;
          setSessions((prev) => [session, ...prev.filter((item) => item.id !== session.id)]);
        }

        await opencodeApi.send(current, { text: trimmed, model: model ?? undefined });

        // mark busy before loading the transcript so a fast reply cannot race us
        busyStartedAt.current = Date.now();
        busyParentRef.current = null;
        setBusy(true);

        try {
          const { messages: list } = await opencodeApi.messages(current);
          mergeMessages(list);
          const lastUser = [...list].reverse().find((message) => message.info.role === "user");
          busyParentRef.current = lastUser?.info.id ?? null;
        } catch {
          // the SSE stream / completion poller will deliver the transcript
        }

        if (created) {
          resetMessages();
          sessionIdRef.current = current;
          setSessionId(current);
        }

        void refreshPermissions();
        return true;
      } catch (caught) {
        const message = errorMessage(caught);
        setError(message);
        push(message, "error");
        void refreshStatus();
        return false;
      } finally {
        setSending(false);
      }
    },
    [
      busy,
      connected,
      mergeMessages,
      model,
      push,
      refreshPermissions,
      refreshStatus,
      resetMessages,
      sending,
    ],
  );

  const handleStop = useCallback(async () => {
    const current = sessionIdRef.current;
    if (!current) return;
    try {
      await opencodeApi.abort(current);
      push("تم إرسال أمر الإيقاف", "info");
    } catch (caught) {
      push(errorMessage(caught), "error");
    } finally {
      setBusy(false);
      busyStartedAt.current = null;
      busyParentRef.current = null;
    }
  }, [push]);

  const handleNewSession = useCallback(async () => {
    setSheet(null);
    setError(null);
    try {
      const { session } = await openCodeCreateSession(model);
      setSessions((prev) => [session, ...prev.filter((item) => item.id !== session.id)]);
      resetMessages();
      setBusy(false);
      busyStartedAt.current = null;
      busyParentRef.current = null;
      sessionIdRef.current = session.id;
      setSessionId(session.id);
      isNearBottomRef.current = true;
      push("تم إنشاء محادثة جديدة", "success");
    } catch (caught) {
      push(errorMessage(caught), "error");
    }
  }, [model, push, resetMessages]);

  const handleSelectSession = useCallback((id: string) => {
    sessionIdRef.current = id;
    setSessionId(id);
    setSheet(null);
    setError(null);
    setBusy(false);
    busyStartedAt.current = null;
    busyParentRef.current = null;
    isNearBottomRef.current = true;
  }, []);

  const handleDeleteSession = useCallback(
    async (id: string) => {
      try {
        await opencodeApi.deleteSession(id);
        const remaining = sessions.filter((session) => session.id !== id);
        setSessions(remaining);
        if (sessionIdRef.current === id) {
          const next = remaining[0]?.id ?? null;
          sessionIdRef.current = next;
          setSessionId(next);
          resetMessages();
          setBusy(false);
          busyStartedAt.current = null;
          busyParentRef.current = null;
        }
        push("تم حذف الجلسة", "success");
      } catch (caught) {
        push(errorMessage(caught), "error");
      }
    },
    [sessions, push, resetMessages],
  );

  const handleRestart = useCallback(async () => {
    setRestarting(true);
    setError(null);
    try {
      const result = await opencodeApi.restart();
      setStatus(result.status);
      push(result.message || "تمت إعادة تشغيل السيرفر", result.ok ? "success" : "warning");
      setSseKey((key) => key + 1);
      setBusy(false);
      busyStartedAt.current = null;
      busyParentRef.current = null;
      void refreshSessions({ select: false });
      void refreshPermissions();
      const current = sessionIdRef.current;
      if (current) {
        try {
          const { messages: list } = await opencodeApi.messages(current);
          mergeMessages(list);
        } catch {
          /* the session may have been recreated */
        }
      }
    } catch (caught) {
      const message = errorMessage(caught);
      push(message, "error");
      setStatus((prev) => (prev ? { ...prev, connected: false, error: message } : prev));
      void refreshStatus();
    } finally {
      setRestarting(false);
    }
  }, [mergeMessages, push, refreshPermissions, refreshSessions, refreshStatus]);

  const handleRefreshStatus = useCallback(async () => {
    const next = await refreshStatus();
    void refreshSessions({ select: false });
    void refreshPermissions();
    push(
      next?.connected ? "السيرفر متصل" : "السيرفر غير متصل",
      next?.connected ? "success" : "warning",
    );
  }, [refreshStatus, refreshSessions, refreshPermissions, push]);

  const handleReplyPermission = useCallback(
    async (permission: PermissionRequest, reply: "once" | "always" | "reject") => {
      try {
        await opencodeApi.replyPermission(permission.id, reply);
        setPermissions((prev) => prev.filter((item) => item.id !== permission.id));
        push(
          reply === "reject" ? "تم رفض الإذن" : "تم السماح بالتنفيذ",
          reply === "reject" ? "warning" : "success",
        );
      } catch (caught) {
        push(errorMessage(caught), "error");
      }
    },
    [push],
  );

  const handleReplyQuestion = useCallback(
    async (question: QuestionRequest, answers: string[][]) => {
      try {
        await opencodeApi.replyQuestion(question.id, answers);
        setQuestions((prev) => prev.filter((item) => item.id !== question.id));
        push("تم إرسال الإجابة", "success");
      } catch (caught) {
        push(errorMessage(caught), "error");
      }
    },
    [push],
  );

  const handleSelectModel = useCallback(
    (next: ModelRef | null) => {
      setModel(next);
      setSheet(null);
      if (next) {
        const found = models.find(
          (item) => item.providerID === next.providerID && item.modelID === next.modelID,
        );
        push(found ? `تم اختيار ${found.name}` : `تم اختيار ${next.modelID}`, "success");
      } else {
        push("تم الرجوع إلى النموذج الافتراضي", "info");
      }
    },
    [models, push],
  );

  const handleCopyMessage = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      push(ok ? "تم نسخ الرد" : "تعذر النسخ", ok ? "success" : "error");
    },
    [push],
  );

  const handleCopyInfo = useCallback(async () => {
    const lines = [
      "OpenCode Dashboard",
      `status: ${connected ? "connected" : "disconnected"}`,
      `version: ${status?.version ?? "?"}`,
      `server: ${status?.baseUrl || "?"}`,
      `project: ${status?.project || "?"}`,
      `session: ${sessionId ?? "none"}`,
      `model: ${modelLabel}`,
    ];
    const ok = await copyText(lines.join("\n"));
    push(ok ? "تم نسخ معلومات الاتصال" : "تعذر النسخ", ok ? "success" : "error");
  }, [connected, status, sessionId, modelLabel, push]);

  const handleQuickPrompt = useCallback((prompt: string) => {
    setInput(prompt);
    setFocusSignal((value) => value + 1);
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      dir="rtl"
      className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#07080b] text-slate-100"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "radial-gradient(60% 40% at 15% -5%, rgba(217,119,87,0.12), transparent 60%), radial-gradient(45% 35% at 95% 0%, rgba(34,211,238,0.08), transparent 60%), radial-gradient(50% 40% at 50% 115%, rgba(139,92,246,0.07), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse 85% 55% at 50% 0%, black, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 85% 55% at 50% 0%, black, transparent 80%)",
        }}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />

      <header className="relative z-20 shrink-0 border-b border-white/[0.06] bg-[#08090d]/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 pb-2 pt-[max(env(safe-area-inset-top),0.55rem)] sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#e8946f] to-[#a44d30] text-white shadow-lg shadow-orange-950/30">
              <Terminal className="size-4" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-[13px] font-semibold leading-5 text-white">
                OpenCode Dashboard
              </h1>
              <p className="truncate text-[9.5px] leading-4 text-slate-500">
                {currentSession?.title?.trim() || "تحكم كامل من هاتفك"}
              </p>
            </div>
          </div>

          <div className="ms-auto flex shrink-0 items-center gap-0.5">
            <StatusPill
              connected={connected}
              checking={statusLoading}
              version={status?.version}
              onClick={() => void handleRefreshStatus()}
            />
            <IconButton
              label="المحادثات"
              onClick={() => setSheet("sessions")}
              className="relative"
            >
              <MessageSquare className="size-4" />
              {sessions.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex min-w-3.5 items-center justify-center rounded-full bg-cyan-400 px-1 text-[8px] font-bold leading-3.5 text-cyan-950">
                  {sessions.length > 9 ? "9+" : sessions.length}
                </span>
              )}
              {otherPendingCount > 0 && (
                <span className="absolute -left-0.5 -top-0.5 size-2 rounded-full bg-amber-400 ring-2 ring-[#08090d]" />
              )}
            </IconButton>
            <IconButton
              label="إعادة تشغيل السيرفر"
              onClick={() => void handleRestart()}
              disabled={restarting}
            >
              <RotateCw className={cn("size-4", restarting && "animate-spin")} />
            </IconButton>
            <IconButton label="حالة السيرفر" onClick={() => setSheet("info")}>
              <Info className="size-4" />
            </IconButton>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-3xl items-center gap-1.5 px-3 pb-2 text-[9.5px] text-slate-500 sm:px-6">
          <span className="inline-flex min-w-0 items-center gap-1">
            <FolderGit2 className="size-2.5 shrink-0" />
            <span className="truncate">{status?.project?.split("/").filter(Boolean).pop() || "—"}</span>
          </span>
          <span className="text-slate-700">·</span>
          <span className="inline-flex min-w-0 items-center gap-1">
            <Cpu className="size-2.5 shrink-0 text-cyan-400/60" />
            <span className="truncate">{modelLabel}</span>
          </span>
          {lastToolActivity && (
            <>
              <span className="hidden text-slate-700 sm:inline">·</span>
              <span className="hidden min-w-0 items-center gap-1 sm:inline-flex">
                <Wrench className="size-2.5 shrink-0 text-violet-400/60" />
                <span className="truncate">{lastToolActivity.tool}</span>
              </span>
            </>
          )}
          <span className="ms-auto inline-flex shrink-0 items-center gap-1">
            <span
              className={cn(
                "size-1.5 rounded-full",
                sseState === "live"
                  ? "bg-emerald-400"
                  : sseState === "connecting"
                    ? "animate-pulse bg-amber-400"
                    : "bg-rose-400",
              )}
            />
            {sseState === "live" ? "مباشر" : sseState === "connecting" ? "جارٍ الاتصال" : "غير متصل"}
          </span>
        </div>
      </header>

      <main
        ref={scrollRef}
        onScroll={onScroll}
        className="relative z-10 flex-1 overflow-y-auto overscroll-contain scroll-smooth"
      >
        <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6">
          {status && !status.connected && (
            <div className="mb-4 overflow-hidden rounded-2xl border border-rose-400/20 bg-rose-500/[0.06]">
              <div className="flex items-start gap-2.5 p-3">
                <WifiOff className="mt-0.5 size-4 shrink-0 text-rose-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-rose-100">السيرفر غير متصل</p>
                  <p className="mt-0.5 text-[10.5px] leading-5 text-rose-200/70">
                    {status.error || "تعذر الوصول إلى OpenCode Server على المنفذ 4000"}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5 border-t border-rose-400/10 px-3 py-2">
                <button
                  type="button"
                  onClick={() => void handleRestart()}
                  disabled={restarting}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1.5 text-[10.5px] font-medium text-emerald-200 transition hover:bg-emerald-400/15 disabled:opacity-50"
                >
                  <RotateCw className={cn("size-3", restarting && "animate-spin")} />
                  إعادة تشغيل السيرفر
                </button>
                <button
                  type="button"
                  onClick={() => void handleRefreshStatus()}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10.5px] font-medium text-slate-300 transition hover:bg-white/[0.06]"
                >
                  فحص الحالة
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-3 py-2">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
              <p className="min-w-0 flex-1 break-words text-[11px] leading-5 text-amber-100">
                {error}
              </p>
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label="إغلاق التنبيه"
                className="rounded p-0.5 text-amber-300/60 transition hover:text-amber-200"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {messagesLoading ? (
            <div className="space-y-4">
              <div className="flex justify-end">
                <div className="h-16 w-2/3 animate-pulse rounded-2xl bg-white/[0.04]" />
              </div>
              <div className="flex justify-start gap-2">
                <div className="size-7 shrink-0 animate-pulse rounded-lg bg-white/[0.04]" />
                <div className="h-24 flex-1 animate-pulse rounded-2xl bg-white/[0.04]" />
              </div>
            </div>
          ) : orderedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center sm:py-14">
              <div className="relative mb-4 flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/10 to-violet-500/10">
                <Terminal className="size-7 text-cyan-300" />
                <span className="absolute -bottom-1 -left-1 flex size-5 items-center justify-center rounded-full border border-[#07080b] bg-emerald-400 text-emerald-950">
                  <Check className="size-3" />
                </span>
              </div>
              <h2 className="text-base font-semibold text-white">ابدأ محادثتك مع OpenCode</h2>
              <p className="mt-1 max-w-xs text-[11.5px] leading-5 text-slate-500">
                اسأل، اطلب تعديل كود، أو شغّل أمراً — كل شيء من هاتفك.
              </p>
              <div className="mt-4 flex w-full max-w-md flex-wrap justify-center gap-1.5">
                {QUICK_PROMPTS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleQuickPrompt(item.prompt)}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10.5px] text-slate-300 transition hover:border-cyan-400/25 hover:bg-cyan-400/[0.06] hover:text-cyan-100"
                  >
                    <Sparkles className="size-2.5 text-cyan-400/70" />
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[9.5px] text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="size-3 text-emerald-400/70" /> proxy آمن
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Radio className="size-3 text-cyan-400/70" /> تحديث لحظي
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Smartphone className="size-3 text-violet-400/70" /> Mobile-first
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4" role="log" aria-live="polite">
              {orderedMessages.map((message) => (
                <MessageItem key={message.info.id} message={message} onCopy={handleCopyMessage} />
              ))}
              {busy && <TypingIndicator elapsedMs={elapsed} />}
            </div>
          )}
          <div className="h-2" />
        </div>
      </main>

      {showScrollDown && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          aria-label="الانتقال إلى الأسفل"
          className="absolute bottom-28 left-1/2 z-30 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-white/15 bg-[#12141a]/95 text-slate-300 shadow-xl shadow-black/40 backdrop-blur transition hover:text-white"
        >
          <ArrowDown className="size-3.5" />
        </button>
      )}

      <div className="relative z-20 shrink-0">
        {(pendingPermission || pendingQuestion) && (
          <div className="mx-auto w-full max-w-3xl space-y-2 px-3 pb-2 sm:px-6">
            {pendingPermission && (
              <PermissionCard
                permission={pendingPermission}
                onReply={(reply) => handleReplyPermission(pendingPermission, reply)}
              />
            )}
            {pendingQuestion && (
              <QuestionCard
                question={pendingQuestion}
                onReply={(answers) => handleReplyQuestion(pendingQuestion, answers)}
              />
            )}
          </div>
        )}

        <Composer
          value={input}
          onChange={setInput}
          onSend={handleSend}
          onStop={() => void handleStop()}
          busy={busy}
          sending={sending}
          disabled={!connected}
          modelLabel={modelLabel}
          onOpenModels={() => setSheet("models")}
          onNewSession={() => void handleNewSession()}
          focusSignal={focusSignal}
        />
      </div>

      <SessionsSheet
        open={sheet === "sessions"}
        onClose={() => setSheet(null)}
        sessions={sessions}
        activeId={sessionId}
        loading={sessionsLoading}
        onSelect={handleSelectSession}
        onNew={() => void handleNewSession()}
        onDelete={(id) => void handleDeleteSession(id)}
      />

      <ModelsSheet
        open={sheet === "models"}
        onClose={() => setSheet(null)}
        models={models}
        connected={connectedProviders}
        selected={model}
        loading={modelsLoading}
        error={modelsError}
        onSelect={handleSelectModel}
        onRefresh={() => void refreshModels(true)}
      />

      <InfoSheet
        open={sheet === "info"}
        onClose={() => setSheet(null)}
        status={status}
        sessionId={sessionId}
        modelLabel={modelLabel}
        sseState={sseState}
        restarting={restarting}
        onRestart={() => void handleRestart()}
        onRefresh={() => void handleRefreshStatus()}
        onCopy={() => void handleCopyInfo()}
      />

      {restarting && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-[#0c0d12] px-4 py-3 text-[12px] text-slate-200 shadow-2xl shadow-black/50">
            <Spinner className="size-4 text-cyan-300" />
            جارٍ إعادة تشغيل السيرفر…
          </div>
        </div>
      )}
    </div>
  );
}

/** Small indirection so the dashboard file stays focused on UI state. */
async function openCodeCreateSession(model: ModelRef | null): Promise<{ session: Session }> {
  return opencodeApi.createSession({ title: "محادثة جديدة", model: model ?? undefined });
}
