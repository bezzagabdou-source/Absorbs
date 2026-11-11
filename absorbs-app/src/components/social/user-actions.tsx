"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, MessageCircle, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/avatar";
import { cn, friendlyError } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import Link from "next/link";

/** Creates (or reuses) the 1-to-1 DM thread via RPC, then opens the chat room. */
export function useStartChat() {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const startChat = async (other: Profile) => {
    setBusyId(other.id);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_or_create_thread", { p_other: other.id });
    setBusyId(null);
    if (error || !data) {
      toast(friendlyError(error, "تعذّر فتح المحادثة — تأكد من تنفيذ schema.sql"), "error");
      return;
    }
    router.push(`/messages/${data}?u=${encodeURIComponent(other.username)}`);
  };

  return { startChat, busyId };
}

export function FollowButton({
  targetId,
  initialFollowing,
  onChange,
  size = "md",
}: {
  targetId: string;
  initialFollowing: boolean;
  onChange?: (following: boolean) => void;
  size?: "sm" | "md";
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  if (!user || user.id === targetId) return null;

  const toggle = async () => {
    if (busy) return;
    const next = !following;
    setFollowing(next);
    onChange?.(next);
    setBusy(true);
    const supabase = createClient();
    const { error } = next
      ? await supabase.from("follows").insert({ follower_id: user.id, following_id: targetId })
      : await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetId);
    setBusy(false);
    if (error) {
      setFollowing(!next);
      onChange?.(!next);
      toast(friendlyError(error, "تعذّر تحديث المتابعة"), "error");
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full font-bold transition active:scale-95",
        size === "sm" ? "px-3.5 py-2 text-xs" : "px-5 py-2.5 text-sm",
        following ? "bg-white/[0.07] text-white ring-1 ring-white/15" : "btn-primary text-white",
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : following ? <Check className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
      {following ? "تتابعه" : "متابعة"}
    </button>
  );
}

export function UserRow({ person, subtitle }: { person: Profile; subtitle?: string }) {
  const { startChat, busyId } = useStartChat();
  return (
    <div className="glass flex items-center gap-3 rounded-[24px] p-3">
      <Link href={`/u/${person.username}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar profile={person} size="md" />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-bold text-white">{person.display_name}</span>
          <span className="block truncate text-xs text-white/45" dir="ltr" style={{ textAlign: "start" }}>
            {subtitle ?? `@${person.username}`}
          </span>
        </span>
      </Link>
      <button
        onClick={() => void startChat(person)}
        disabled={busyId === person.id}
        className="btn-primary flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white"
        aria-label={`مراسلة ${person.display_name}`}
      >
        {busyId === person.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
        مراسلة
      </button>
    </div>
  );
}
