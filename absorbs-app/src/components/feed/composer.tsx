"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, SendHorizonal, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/avatar";
import { compressImage, friendlyError } from "@/lib/utils";
import type { Post } from "@/lib/types";

const MAX_CHARS = 500;

export function Composer({ onPosted }: { onPosted: (post: Post) => void }) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("compose") === "1") {
      areaRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [content]);

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("اختر ملف صورة صالحًا", "error");
    if (file.size > 12 * 1024 * 1024) return toast("الصورة كبيرة جدًا (الحد 12MB)", "error");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    if (!user || !profile || posting) return;
    const text = content.trim();
    if (!text && !imageFile) return;
    setPosting(true);
    const supabase = createClient();
    try {
      let imageUrl: string | null = null;
      if (imageFile) {
        const blob = await compressImage(imageFile);
        const path = `${user.id}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("post-images")
          .upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (uploadError) throw uploadError;
        imageUrl = supabase.storage.from("post-images").getPublicUrl(path).data.publicUrl;
      }

      const { data, error } = await supabase
        .from("posts")
        .insert({ author_id: user.id, content: text || null, image_url: imageUrl })
        .select("id, created_at")
        .single();
      if (error) throw error;

      onPosted({
        id: data.id,
        author_id: user.id,
        content: text || null,
        image_url: imageUrl,
        created_at: data.created_at,
        author: profile,
        like_count: 0,
        comment_count: 0,
        liked_by_me: false,
      });
      setContent("");
      clearImage();
      toast("تم نشر منشورك ✨");
    } catch (err) {
      toast(friendlyError(err as { message?: string }, "تعذّر النشر — تأكد من تنفيذ schema.sql (يشمل Storage)"), "error");
    } finally {
      setPosting(false);
    }
  };

  return (
    <section className="glass animate-fade-up rounded-[28px] p-4">
      <div className="flex items-start gap-3">
        <Avatar profile={profile} size="md" />
        <div className="min-w-0 flex-1">
          <textarea
            ref={areaRef}
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, MAX_CHARS))}
            rows={2}
            placeholder={profile ? `بما تفكر يا ${profile.display_name.split(" ")[0]}؟ شاركنا…` : "بما تفكر؟"}
            className="w-full resize-none bg-transparent text-[15px] leading-7 text-white outline-none placeholder:text-white/35"
            aria-label="نص المنشور"
          />
          {imagePreview && (
            <div className="relative mt-2 overflow-hidden rounded-3xl ring-1 ring-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="معاينة الصورة" className="max-h-64 w-full object-cover" />
              <button
                onClick={clearImage}
                aria-label="إزالة الصورة"
                className="glass-strong absolute end-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-white transition active:scale-90"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-3">
            <div className="flex items-center gap-1.5">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickImage(e.target.files?.[0])}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-white/10 active:scale-95"
              >
                <ImagePlus className="h-4 w-4" /> صورة
              </button>
              <span className={content.length >= MAX_CHARS ? "text-xs font-bold text-red-300" : "text-xs text-white/30"}>
                {content.length}/{MAX_CHARS}
              </span>
            </div>
            <button
              onClick={submit}
              disabled={posting || (!content.trim() && !imageFile)}
              className="btn-primary flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4 -scale-x-100" />}
              نشر
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
