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
                    label: "حذف المحادثة",
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

export function Sidebar({ onOpenSettings, onOpenUpgrade }: { onOpenSettings: () => void; onOpenUpgrade: () => void }) {
  const {
    conversations,
    loadingList,
    activeId,
    selectConversation,
    newChat,
    sidebarOpen,
    setSidebarOpen,
  } = useNexus();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.includes(q));
  }, [conversations, query]);

  const groups = useMemo(() => {
    const day = 86_400_000;
    const now = Date.now();
    const buckets: { label: string; items: Conversation[] }[] = [
      { label: "اليوم", items: [] },
      { label: "هذا الأسبوع", items: [] },
      { label: "الأرشيف", items: [] },
    ];
    for (const c of filtered) {
      const age = now - new Date(c.updatedAt).getTime();
      if (age < day) buckets[0].items.push(c);
      else if (age < 7 * day) buckets[1].items.push(c);
      else buckets[2].items.push(c);
    }
    return buckets.filter((b) => b.items.length);
  }, [filtered]);

  return (
    <>
      {/* mobile backdrop */}
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

      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-50 flex w-[290px] flex-col p-3 transition-transform duration-300 ease-[var(--ease-fluid)] lg:static lg:translate-x-0!",
          !sidebarOpen && "max-lg:-translate-x-full max-lg:rtl:translate-x-full",
        )}
      >
        <div className="glass hairline flex h-full min-h-0 flex-col overflow-hidden rounded-3xl">
          {/* header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <Logo />
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="إغلاق القائمة"
              className="press grid size-8 cursor-pointer place-items-center rounded-xl text-(--ink-3) hover:bg-(--glass-hi) hover:text-(--ink) lg:hidden"
            >
              <X className="size-4.5" />
            </button>
          </div>

          {/* new chat */}
          <div className="px-3 pb-3">
            <button
              onClick={newChat}
              className="btn-primary flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[14px] font-bold"
            >
              <SquarePen className="size-4.5" />
              محادثة جديدة
            </button>
          </div>

          {/* search */}
          <div className="px-3 pb-2">
            <div className="glass flex items-center gap-2 rounded-xl px-3 py-2">
              <Search className="size-3.5 shrink-0 text-(--ink-3)" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث في المحادثات…"
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-(--ink) outline-none placeholder:text-(--ink-3)"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="مسح البحث"
                  className="press grid size-4.5 cursor-pointer place-items-center rounded-md text-(--ink-3) hover:text-(--ink)"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>

          {/* list */}
          <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {loadingList ? (
              <div className="flex flex-col gap-2 px-1 pt-2">
                {[80, 65, 90, 55, 72].map((w, i) => (
                  <div key={i} className="skeleton-shimmer h-9 rounded-xl" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 pt-14 text-center">
                <MessageSquareText className="size-8 text-(--ink-3)/50" />
                <p className="text-[12.5px] leading-relaxed text-(--ink-3)">
                  {query ? "لا توجد نتائج مطابقة" : "لا محادثات بعد — ابدأ واحدة جديدة"}
                </p>
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.label} className="mb-3">
                  <div className="px-3 pt-2 pb-1.5 text-[10px] font-bold tracking-[0.16em] text-(--ink-3) uppercase">
                    {g.label}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <AnimatePresence initial={false}>
                      {g.items.map((c) => (
                        <ConversationItem
                          key={c.id}
                          conv={c}
                          active={c.id === activeId}
                          onSelect={() => selectConversation(c.id)}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* footer: pro card + settings */}
          <div className="border-t border-(--line) p-3">
            <button
              onClick={onOpenUpgrade}
              className="group mb-2 flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border border-(--gold)/25 bg-gradient-to-l from-(--gold)/12 to-transparent p-3 text-start transition-all hover:border-(--gold)/45 hover:from-(--gold)/18"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-(--gold)/15 text-(--gold)">
                <Crown className="size-4.5" />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[13px] font-bold text-(--ink)" dir="ltr">
                  Nexus <span className="text-(--gold)">Pro</span>
                </span>
                <span className="block truncate text-[11px] text-(--ink-3)">
                  محرّكات أعمق + حدود بلا قيود
                </span>
              </span>
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={onOpenSettings}
                className="glass hover-lift press flex flex-1 cursor-pointer items-center gap-2.5 rounded-2xl px-3 py-2.5 text-[13px] font-semibold text-(--ink-2) hover:text-(--ink)"
              >
                <Settings className="size-4" />
                الإعدادات
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
