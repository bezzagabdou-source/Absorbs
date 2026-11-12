"use client";

import { useEffect, useRef, useState } from "react";
import { Clapperboard, ImagePlus, Wand2, Loader2, SendHorizonal, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/avatar";
import { compressImage, friendlyError } from "@/lib/utils";
import type { Post } from "@/lib/types";

const MAX_CHARS = 500;

export function Composer({ onPosted, groupId = null }: { onPosted: (post: Post) => void; groupId?: string | null }) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("compose") === "1") {
      areaRef.current?.focus();
    }
    try {
      const draft = localStorage.getItem("dz-draft");
      if (draft) {
        setContent((c) => c || draft);
        localStorage.removeItem("dz-draft");
        areaRef.current?.focus();
      }
    } catch {}
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

  const improveWithAi = async () => {
    if (!content.trim() || aiBusy) return;
    setAiBusy(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "improve-post", text: content }),
      });
      const data = (await res.json()) as { ok: boolean; text?: string; error?: string };
      if (!data.ok || !data.text) throw new Error(data.error ?? "حدث خطأ");
      setContent(data.text.slice(0, MAX_CHARS));
      toast("حسّنه Dz connect ai ✨ راجعه ثم انشر");
    } catch (err) {
      toast(err instanceof Error ? err.message : "تعذّر الاتصال بالمساعد", "error");
    } finally {
      setAiBusy(false);
    }
  };

  const pickVideo = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) return toast("الفيديو كبير — الحد الأقصى 30MB", "error");
    clearImage();
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const clearVideo = () => {
    setVideoFile(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoPreview(null);
  };

  const submit = async () => {
    if (!user || !profile || posting) return;
    const text = content.trim();
    if (!text && !imageFile && !videoFile) return;
    setPosting(true);
    const supabase = createClient();
    try {
      let imageUrl: string | null = null;
      let mediaType: "image" | "video" = "image";
      if (videoFile) {
        mediaType = "video";
        const path = `${user.id}/${crypto.randomUUID()}.mp4`;
        const { error: uploadError } = await supabase.storage
          .from("post-images")
          .upload(path, videoFile, { contentType: videoFile.type || "video/mp4", upsert: false });
        if (uploadError) throw uploadError;
        imageUrl = supabase.storage.from("post-images").getPublicUrl(path).data.publicUrl;
      } else if (imageFile) {
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
        .insert({ author_id: user.id, content: text || null, image_url: imageUrl, media_type: mediaType, group_id: groupId })
        .select("id, created_at")
        .single();
      if (error) throw error;

      onPosted({
        id: data.id,
        author_id: user.id,
        content: text || null,
        image_url: imageUrl,
        media_type: mediaType,
        group_id: groupId,
        created_at: data.created_at,
        author: profile,
        like_count: 0,
        comment_count: 0,
        liked_by_me: false,
      });
      setContent("");
      clearImage();
      clearVideo();
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
          {videoPreview && (
            <div className="relative mb-2 overflow-hidden rounded-3xl ring-1 ring-white/10">
              <video src={videoPreview} controls playsInline className="max-h-64 w-full bg-black object-contain" />
              <button
                onClick={clearVideo}
                aria-label="إزالة الفيديو"
                className="absolute end-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
              >
                <X className="h-4 w-4" />
              </button>
              <span className="absolute start-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-bold text-white">🎬 سيظهر في الريلز</span>
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
              <input
                ref={videoRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  pickVideo(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => videoRef.current?.click()}
                className="flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-white/10 active:scale-95"
              >
                <Clapperboard className="h-4 w-4" /> فيديو
              </button>
              <button
                onClick={() => void improveWithAi()}
                disabled={aiBusy || !content.trim()}
                className="flex items-center gap-1.5 rounded-full bg-gradient-to-l from-indigo-400/25 to-cyan-400/20 px-3 py-1.5 text-xs font-bold text-violet-200 ring-1 ring-violet-300/25 transition hover:from-indigo-400/35 hover:to-cyan-400/30 active:scale-95 disabled:opacity-40"
                title="حسّن منشورك بـ Dz connect ai"
              >
                {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Dz connect ai
              </button>
              <span className={content.length >= MAX_CHARS ? "text-xs font-bold text-red-300" : "text-xs text-white/30"}>
                {content.length}/{MAX_CHARS}
              </span>
            </div>
            <button
              onClick={submit}
              disabled={posting || (!content.trim() && !imageFile && !videoFile)}
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
