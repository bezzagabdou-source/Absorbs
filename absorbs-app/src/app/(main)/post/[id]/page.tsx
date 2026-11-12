"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { ArrowRight, FileQuestion } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchSinglePost } from "@/lib/queries";
import { useAuth } from "@/components/providers/auth-provider";
import { PostCard } from "@/components/feed/post-card";
import { EmptyState, FullPageLoader } from "@/components/ui/feedback";
import type { Post } from "@/lib/types";
import { useRouter } from "next/navigation";

export default function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const found = await fetchSinglePost(supabaseRef.current, id, user.id).catch(() => null);
      if (!cancelled) {
        setPost(found);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  return (
    <div className="space-y-4">
      <button
        onClick={() => router.back()}
        className="glass flex items-center gap-2 rounded-full py-2 pe-4 ps-2 text-sm font-bold text-slate-900/80 transition hover:bg-slate-900/[0.07] active:scale-95"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/[0.06]">
          <ArrowRight className="h-4 w-4" />
        </span>
        رجوع
      </button>

      {loading ? (
        <FullPageLoader label="جارٍ تحميل المنشور…" />
      ) : !post ? (
        <EmptyState icon={<FileQuestion className="h-6 w-6" />} title="المنشور غير موجود" description="ربما حُذف من صاحبه أو أن الرابط غير صحيح.">
          <Link href="/feed" className="btn-primary mt-2 rounded-full px-5 py-2.5 text-sm font-bold text-slate-900">
            العودة للخلاصة
          </Link>
        </EmptyState>
      ) : (
        <PostCard post={post} defaultCommentsOpen onDeleted={() => router.replace("/feed")} />
      )}
    </div>
  );
}
