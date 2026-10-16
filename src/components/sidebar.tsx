"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Crown,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Search,
  Settings,
  SquarePen,
  Trash2,
  X,
  Phone,
  Image as ImageIcon,
  Globe,
  Network,
  Sparkles,
} from "lucide-react";
import { cn, timeLabel } from "@/lib/utils";
import { useNexus, type Conversation } from "@/lib/store";
import { Logo } from "@/components/logo";
import { Menu } from "@/components/ui";
import { ThemeToggle } from "@/components/theme";

/* ── conversation item ──────────────────────────────────────── */

function ConversationItem({
  conv,
  active,
  onSelect,
}: {
  conv: Conversation;
  active: boolean;
  onSelect: () => void;
}) {
  const { renameConversation, deleteConversation } = useNexus();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft !== conv.title) void renameConversation(conv.id, draft);
  };

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10, height: 0, marginBottom: 0, overflow: "hidden" }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="group/item relative"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => e.key === "Enter" && onSelect()}
        className={cn(
          "press relative flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-start transition-colors",
          active
            ? "bg-(--accent)/12 text-(--ink) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_30%,transparent)]"
            : "text-(--ink-2) hover:bg-(--glass-hi) hover:text-(--ink)",
        )}
      >
        {active && (
          <motion.span
            layoutId="conv-active-ind"
            className="absolute start-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-(--accent)"
          />
        )}
        <MessageSquareText
          className={cn("size-4 shrink-0", active ? "text-(--accent)" : "text-(--ink-3)")}
        />
        {editing ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              commit();
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDraft(conv.title);
                  setEditing(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 rounded-lg border border-(--accent)/40 bg-transparent px-1.5 py-0.5 text-[13px] text-(--ink) outline-none"
            />
            <button
              type="submit"
              aria-label="تأكيد"
              onClick={(e) => e.stopPropagation()}
              className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md bg-(--accent) text-white"
            >
              <Check className="size-3.5" />
            </button>
          </form>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium" dir="auto">
              {conv.title}
            </span>
            <span className="shrink-0 text-[10px] text-(--ink-3) group-hover/item:hidden">
              {timeLabel(conv.updatedAt)}
            </span>
            <span
              className="hidden shrink-0 group-hover/item:block"
              onClick={(e) => e.stopPropagation()}
            >
              <Menu
                width={170}
                trigger={
                  <span className="press grid size-6.5 place-items-center rounded-lg text-(--ink-3) hover:bg-(--glass-hi) hover:text-(--ink)">
                    <MoreHorizontal className="size-4" />
                  </span>
                }
                items={[
                  {
                    label: "إعادة تسمية",
                    icon: <Pencil className="size-3.5" />,
                    onSelect: () => {
                      setDraft(conv.title);
                      setEditing(true);
                    },
                  },
                  {
                    label: "حذف",
                    icon: <Trash2 className="size-3.5" />,
                    danger: true,
                    onSelect: () => void deleteConversation(conv.id),
                  },
                ]}
              />
            </span>
          </>
        )}
      </div>
    </motion.div>
  );
}

/* ── sidebar ────────────────────────────────────────────────── */

export type ToolId = "voice" | "image" | "web" | "orch";

const QUICK_TOOLS: { id: ToolId; label: string; icon: typeof Phone; cls: string }[] = [
  { id: "voice", label: "مكالمة", icon: Phone, cls: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" },
  { id: "image", label: "صور", icon: ImageIcon, cls: "border-purple-500/20 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20" },
  { id: "web", label: "مواقع", icon: Globe, cls: "border-blue-500/20 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20" },
  { id: "orch", label: "توزيع", icon: Network, cls: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20" },
];

export function Sidebar({
  onOpenSettings,
  onOpenUpgrade,
  onOpenTool,
}: {
  onOpenSettings?: () => void;
  onOpenUpgrade?: () => void;
  onOpenTool?: (t: ToolId) => void;
} = {}) {
  const { conversations, loadingList, activeId, selectConversation, newChat, sidebarOpen, setSidebarOpen } =
    useNexus();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, query]);

  return (
    <>
      {/* scrim */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ x: sidebarOpen ? 0 : "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        className={cn(
          "fixed inset-y-0 end-0 z-50 flex w-72 flex-col border-e border-(--line)",
          "bg-(--panel-solid)/95 backdrop-blur-2xl lg:static lg:z-auto lg:translate-x-0 lg:bg-transparent lg:backdrop-blur-none",
        )}
      >
        {/* brand + actions */}
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <Logo size={28} />
          <span className="flex-1 text-[15px] font-extrabold tracking-tight">Nexus AI</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="press grid size-8 cursor-pointer place-items-center rounded-lg text-(--ink-3) hover:bg-(--glass-hi) hover:text-(--ink) lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* new chat */}
        <div className="px-3 pb-2">
          <button
            onClick={newChat}
            className="press btn-primary flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-[13.5px] font-bold text-white"
          >
            <SquarePen className="size-4" />
            محادثة جديدة
          </button>
        </div>

        {/* أدوات سريعة */}
        <div className="px-3 py-2">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-(--ink-3) px-2 pb-2">
            الأدوات السريعة
          </div>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_TOOLS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  onOpenTool?.(t.id);
                  setSidebarOpen(false);
                }}
                aria-label={t.label}
                className={cn("press flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold transition cursor-pointer", t.cls)}
              >
                <t.icon className="size-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* search */}
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-(--ink-3)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث في المحادثات..."
              className="w-full rounded-xl border border-(--line) bg-(--panel) py-2 ps-9 pe-3 text-[13px] text-(--ink) outline-none backdrop-blur-xl placeholder:text-(--ink-3) focus:border-(--accent)/40"
            />
          </div>
        </div>

        {/* list */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-(--ink-3) px-2 pb-2 pt-1">
            المحادثات
          </div>
          {loadingList ? (
            <div className="space-y-2 px-1">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-(--glass-hi)" style={{ opacity: 1 - i * 0.12 }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12px] text-(--ink-3)">
              {query ? "لا توجد نتائج مطابقة" : "لا محادثات بعد — ابدأ واحدة!"}
            </p>
          ) : (
            <div className="space-y-0.5">
              <AnimatePresence initial={false}>
                {filtered.map((c) => (
                  <ConversationItem
                    key={c.id}
                    conv={c}
                    active={c.id === activeId}
                    onSelect={() => selectConversation(c.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="border-t border-(--line) p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-(--ink-3)">Nexus AI v20</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={onOpenUpgrade}
                aria-label="ترقية إلى Pro"
                title="ترقية"
                className="press grid size-8 cursor-pointer place-items-center rounded-lg text-(--ink-3) hover:bg-(--glass-hi) hover:text-(--gold)"
              >
                <Sparkles className="size-4" />
              </button>
              <button
                onClick={onOpenSettings}
                aria-label="الإعدادات"
                title="الإعدادات"
                className="press grid size-8 cursor-pointer place-items-center rounded-lg text-(--ink-3) hover:bg-(--glass-hi) hover:text-(--ink)"
              >
                <Settings className="size-4" />
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </motion.aside>
    </>
  );
}
