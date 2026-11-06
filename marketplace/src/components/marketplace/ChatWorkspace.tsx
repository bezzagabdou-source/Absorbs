"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "./Icon";
import { useI18n } from "@/lib/i18n/client";
import { useMarketplace } from "./marketplace-provider";
import { useApi } from "@/hooks/use-api";
import { apiFetch } from "@/lib/api-client";
import { formatDate, initials } from "@/lib/format";
import { AuthGate, Breadcrumbs, EmptyState, ErrorNotice, Loading } from "./ui";
type Conversation = { id: string; productId: string | null; productTitle: string | null; name: string; updatedAt: string };
type Message = { id: string; senderId: string; body: string; createdAt: string };
export function ChatWorkspace() {
  const { user, authLoading } = useMarketplace(); const { t, locale } = useI18n(); const params = useSearchParams(); const [selected, setSelected] = useState(params.get("id")); const [search, setSearch] = useState(""); const [body, setBody] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [live, setLive] = useState<"connecting" | "live" | "reconnecting">("connecting"); const bottom = useRef<HTMLDivElement>(null);
  const { data, loading, error: listError, refresh } = useApi<{ items: Conversation[] }>(user ? "/api/conversations" : null, 15000); const active = data?.items.find((c) => c.id === selected) ?? data?.items[0]; const { data: thread, error: threadError, refresh: refreshThread } = useApi<{ items: Message[] }>(user && active ? `/api/conversations/${active.id}/messages` : null, live === "live" ? 15000 : 3000);
  const userId = user?.id; const activeId = active?.id;
  useEffect(() => {
    if (!userId || !activeId) return;
    const source = new EventSource(`/api/conversations/${activeId}/messages/stream`);
    source.onopen = () => setLive("live");
    source.onerror = () => setLive("reconnecting");
    source.addEventListener("messages", () => { refreshThread(); refresh(); });
    return () => source.close();
  }, [userId, activeId, refresh, refreshThread]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [thread?.items.length]);
  const send = async (event: FormEvent) => { event.preventDefault(); if (!active || !body.trim() || busy) return; setBusy(true); setError(null); try { await apiFetch(`/api/conversations/${active.id}/messages`, { method: "POST", json: { body: body.trim() } }); setBody(""); refreshThread(); refresh(); } catch (cause) { setError(cause); } finally { setBusy(false); } };
  return <main className="market-container chat-page"><Breadcrumbs current={t("messages")} /><div className="chat-heading"><div><p className="section-kicker">{t("messages")}</p><h1>{t("chatTitle")}</h1><p>{t("chatHint")}</p></div><span className="chat-privacy"><Icon name="lock" size={15} />{t("chatSafety")}</span></div>{authLoading ? <Loading /> : !user ? <AuthGate /> : <><ErrorNotice error={error ?? listError ?? threadError} /><div className="chat-shell"><aside className="chat-sidebar"><div className="chat-sidebar-heading"><h2>{t("messages")}</h2></div><label className="chat-search"><Icon name="search" size={16} /><input aria-label={t("conversationSearch")} placeholder={t("conversationSearch")} value={search} onChange={(e) => setSearch(e.target.value)} /></label>{loading ? <Loading /> : <div className="conversation-list">{data?.items.filter((c) => `${c.name} ${c.productTitle}`.toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale))).map((conversation) => <button key={conversation.id} className={`conversation-item ${active?.id === conversation.id ? "active" : ""}`} onClick={() => setSelected(conversation.id)}><span className="chat-avatar chat-avatar-mint">{initials(conversation.name)}</span><span className="conversation-copy"><span className="conversation-name">{conversation.name}</span><span className="conversation-preview">{conversation.productTitle}</span></span></button>)}</div>}{!data?.items.length && !loading && <EmptyState icon="chat" title={t("noConversations")} hint={t("noConversationsHint")} />}</aside><section className="chat-thread">{active ? <><div className="thread-header"><span className="chat-avatar chat-avatar-mint">{initials(active.name)}</span><div className="thread-person"><b>{t("conversationWith", { name: active.name })}</b><small className={`chat-live ${live}`}>{t(live === "live" ? "chatLive" : "chatReconnecting")}</small></div></div>{active.productId && <Link className="thread-product" href={`/product/${active.productId}`}><span><small>{t("regarding")}</small><b>{active.productTitle}</b></span><Icon name="arrow" className="directional" size={16} /></Link>}<div className="thread-messages">{thread?.items.map((message) => <div className={`message-row ${message.senderId === user.id ? "mine" : "theirs"}`} key={message.id}><div className="message-bubble"><p className="preserve-text">{message.body}</p><time>{formatDate(message.createdAt, locale, { hour: "2-digit", minute: "2-digit" })}</time></div></div>)}<div ref={bottom} /></div><form className="chat-composer" onSubmit={send}><input aria-label={t("messagePlaceholder")} placeholder={t("messagePlaceholder")} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} /><button className="search-submit" disabled={busy || !body.trim()} aria-label={t("sendMessage")}><Icon name="send" size={18} /></button></form><div className="composer-footer"><small>{t("chatSafety")}</small></div></> : <EmptyState icon="chat" title={t("selectConversation")} />}</section></div></>}</main>;
}
