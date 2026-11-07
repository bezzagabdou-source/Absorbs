"use client";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import Image from "next/image";
import { Modal, ErrorNotice } from "./ui";
import { useI18n } from "@/lib/i18n/client";
import { useMarketplace } from "./marketplace-provider";
import { apiFetch } from "@/lib/api-client";
import { conditionSchema } from "@/lib/validation/schemas";
import { Icon } from "./Icon";
export type VendorListing = { id: string; title: string; price: string; status: string; images: string[]; views: number; categoryId: string | null; wilayaCode: string | null; commune: string | null; description: string; condition: string; costDzd: string | null; deliveryAvailable: boolean };
type UploadedImage = { id: string; url: string; width: number; height: number; byteSize: number };
const MAX_FILES = 8;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif";
export function ListingEditor({ listing, onClose, onSaved }: { listing?: VendorListing; onClose: () => void; onSaved: () => void }) {
  const { t, locale } = useI18n(); const { reference, notify } = useMarketplace();
  const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false); const [dragging, setDragging] = useState(false); const [error, setError] = useState<unknown>(null);
  const [images, setImages] = useState<string[]>(listing?.images ?? []);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadFiles = async (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (!selected.length) return;
    setError(null);
    if (images.length + selected.length > MAX_FILES) { setError({ code: "too_many_images" }); return; }
    for (const file of selected) {
      if (!file.type.startsWith("image/")) { setError({ code: "unsupported_image_type" }); return; }
      if (file.size > MAX_BYTES) { setError({ code: "image_too_large" }); return; }
    }
    setUploading(true);
    try {
      for (const file of selected) {
        const form = new FormData(); form.append("file", file);
        const uploaded = await apiFetch<UploadedImage>("/api/uploads", { method: "POST", body: form });
        setImages((current) => [...current, uploaded.url].slice(0, MAX_FILES));
      }
    } catch (cause) { setError(cause); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); if (!uploading && !busy) void uploadFiles(event.dataTransfer.files); };
  const removeImage = (index: number) => { setImages((current) => current.filter((_, i) => i !== index)); };
  const moveImage = (index: number, delta: number) => { setImages((current) => { const next = [...current]; const target = index + delta; if (target < 0 || target >= next.length) return current; const [item] = next.splice(index, 1); next.splice(target, 0, item); return next; }); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (uploading) return;
    if (!images.length) { setError({ code: "image_required" }); return; }
    const form = new FormData(event.currentTarget); const value = (key: string) => String(form.get(key) ?? "").trim();
    setBusy(true); setError(null);
    try {
      const json = { title: value("title"), description: value("description"), priceDzd: Number(value("price")), ...(value("cost") ? { costDzd: Number(value("cost")) } : {}), categoryId: value("categoryId"), wilayaCode: value("wilaya"), commune: value("commune"), condition: value("condition"), images, deliveryAvailable: form.get("delivery") === "on" };
      await apiFetch(listing ? `/api/listings/${listing.id}` : "/api/listings", { method: listing ? "PATCH" : "POST", json });
      notify(t(listing ? "listingUpdated" : "listingCreated")); onSaved(); onClose();
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  };
  return <Modal title={t(listing ? "editListing" : "createListing")} onClose={onClose} className="listing-dialog"><form className="stack-form listing-form" onSubmit={submit}><label>{t("title")}<input name="title" required minLength={5} maxLength={180} defaultValue={listing?.title} /></label><label>{t("description")}<textarea name="description" required minLength={20} maxLength={5000} rows={4} defaultValue={listing?.description} /></label><div className="form-grid"><label>{t("price")} ({t("currency")})<input name="price" type="number" required min="0.01" max="999999999999" step="0.01" defaultValue={listing?.price} /></label><label>{t("cost")} ({t("currency")})<input name="cost" type="number" min="0" max="999999999999" step="0.01" defaultValue={listing?.costDzd ?? ""} /><small>{t("costHint")}</small></label><label>{t("category")}<select name="categoryId" required defaultValue={listing?.categoryId ?? ""}><option value="" disabled>{t("category")}</option>{reference.categories.map((c) => <option key={c.id} value={c.id}>{c.name[locale]}</option>)}</select></label><label>{t("wilaya")}<select name="wilaya" required defaultValue={listing?.wilayaCode ?? ""}><option value="" disabled>{t("wilaya")}</option>{reference.wilayas.map((w) => <option key={w.code} value={w.code}>{w.code} · {w.name[locale]}</option>)}</select></label><label>{t("commune")}<input name="commune" required minLength={2} maxLength={120} defaultValue={listing?.commune ?? ""} /></label><label>{t("condition")}<select name="condition" defaultValue={listing?.condition ?? "good"}>{conditionSchema.options.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select></label></div>
      <div className="image-upload-field"><span className="field-label">{t("images")}</span><div className={`image-dropzone ${dragging ? "dragging" : ""} ${uploading ? "busy" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}><Icon name="camera" size={24} /><b>{t(uploading ? "uploadingImages" : "uploadImages")}</b><small>{t("uploadImagesHint")}</small><button type="button" className="button-outline" disabled={uploading || busy || images.length >= MAX_FILES} onClick={() => inputRef.current?.click()}><Icon name="plus" size={16} />{t("chooseImages")}</button><input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(event) => event.target.files && void uploadFiles(event.target.files)} /></div>
        {images.length > 0 && <ul className="upload-previews">{images.map((image, index) => <li key={`${image}-${index}`}><Image src={image} alt={t("photo", { number: index + 1 })} width={320} height={320} unoptimized /><div className="upload-preview-actions"><button type="button" aria-label={t("moveImageLeft")} disabled={index === 0} onClick={() => moveImage(index, -1)}><Icon name="chevron" size={14} className="directional" /></button><button type="button" aria-label={t("removeImage")} onClick={() => removeImage(index)}><Icon name="close" size={14} /></button><button type="button" aria-label={t("moveImageRight")} disabled={index === images.length - 1} onClick={() => moveImage(index, 1)}><Icon name="chevron" size={14} /></button></div>{index === 0 && <span className="cover-badge">{t("coverImage")}</span>}</li>)}</ul>}
        <small>{t("imagesHint")}</small></div>
      <label className="checkbox-label"><input name="delivery" type="checkbox" defaultChecked={listing?.deliveryAvailable ?? true} />{t("delivery")}</label><ErrorNotice error={error} /><button className="button-dark full-width" disabled={busy || uploading}>{t(busy ? "loading" : "save")}<Icon name="check" size={17} /></button></form></Modal>;
}
