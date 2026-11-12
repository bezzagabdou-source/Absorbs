"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRoundX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchProfileByUsername } from "@/lib/queries";
import { useAuth } from "@/components/providers/auth-provider";
import { ProfileView } from "@/components/profile/profile-view";
import { EmptyState, FullPageLoader } from "@/components/ui/feedback";
import type { Profile } from "@/lib/types";
import Link from "next/link";

export default function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && profile && profile.id === user.id) {
      router.replace("/profile");
    }
  }, [user, profile, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = await fetchProfileByUsername(supabaseRef.current, decodeURIComponent(username)).catch(() => null);
      if (!cancelled) {
        setProfile(found);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (loading) return <FullPageLoader label="جارٍ تحميل الملف الشخصي…" />;
  if (!profile) {
    return (
      <EmptyState icon={<UserRoundX className="h-6 w-6" />} title="هذا المستخدم غير موجود" description="ربما غيّر اسم المستخدم أو حذف حسابه.">
        <Link href="/explore" className="btn-primary mt-2 rounded-full px-5 py-2.5 text-sm font-bold text-slate-900">
          العودة للاكتشاف
        </Link>
      </EmptyState>
    );
  }
  return <ProfileView profile={profile} />;
}
