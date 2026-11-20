"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  BarChart3, CalendarDays, Check, ChevronLeft, LayoutDashboard, Leaf, LockKeyhole,
  LogOut, PackagePlus, PackageX, Pencil, Plus, RotateCcw, Save, Search, Settings,
  ShoppingBag, Trash2, Users, X,
} from "lucide-react";
import { draftKey, editDraft } from "@/lib/draft";
import { catalogSchema } from "@/lib/file-catalog";
import type { AdminData, Availability, Product } from "@/lib/types";

type Action = (body: Record<string, unknown>, message?: string) => Promise<boolean>;

type Props = { onClose: () => void; onStoreChanged: () => Promise<void> };

export default function AdminPanel({ onClose, onStoreChanged }: Props) {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tab, setTab] = useState<"dashboard" | "products" | "settings">("dashboard");

  async function loadData() {
    const response = await fetch("/api/admin", { cache: "no-store" });
    if (response.ok) {
      const published = await response.json();
      let catalog = published;
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) catalog = catalogSchema.parse(JSON.parse(saved));
      } catch { setError("تعذر فتح المسودة المحلية. نعرض النسخة المنشورة."); }
      setData(catalog);
      return true;
    }
    setData(null);
    return false;
  }

  useEffect(() => {
    loadData().catch(() => setError("تعذر الاتصال بالخادم.")).finally(() => setLoading(false));
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const result = await response.json();
      if (!response.ok) setError(result.error || "تعذر تسجيل الدخول.");
      else { setPassword(""); await loadData(); }
    } catch { setError("تعذر الاتصال بالخادم."); }
    finally { setBusy(false); }
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" }).catch(() => {});
    setData(null); setTab("dashboard"); setSuccess(""); setError("");
  }

  const runAction: Action = async (body, message = "تم حفظ التغييرات بنجاح.") => {
    setBusy(true); setError(""); setSuccess("");
    try {
      if (!data) return false;
      const next = editDraft(data, body);
      localStorage.setItem(draftKey, JSON.stringify(next));
      setData(next);
      setSuccess("حُفظت المسودة على جهازك. انشر الملف لتظهر التغييرات لكل الزوار.");
      return true;
    } catch {
      setError("تعذر حفظ المسودة. تحقق من الحقول ومساحة التخزين.");
      return false;
    } finally { setBusy(false); }
  };

  return <div className="overlay admin-overlay" onClick={onClose}>
    {!data ? <div className="admin-login" role="dialog" aria-modal="true" aria-label="دخول لوحة التحكم" onClick={(event) => event.stopPropagation()}>
      <button className="close-button admin-close" onClick={onClose} aria-label="إغلاق"><X size={20} /></button>
      {loading ? <div className="login-loading">جاري التحميل...</div> : <><span className="login-icon"><LockKeyhole size={25} /></span><span className="eyebrow centered"><span /> مساحة خاصة</span><h2>لوحة تحكم الأصيل</h2><p>أدخل كلمة المرور للمتابعة إلى لوحة إدارة المتجر.</p><form onSubmit={login}><label>كلمة المرور<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="أدخل كلمة المرور" autoFocus required /></label>{error && <div className="admin-error">{error}</div>}<button className="button button-green full-button" disabled={busy}>{busy ? "جاري التحقق..." : "دخول لوحة التحكم"} <ChevronLeft size={17} /></button></form></>}
    </div> : <div className="admin-shell" role="dialog" aria-modal="true" aria-label="لوحة تحكم المتجر" onClick={(event) => event.stopPropagation()}>
      <div className="admin-top"><div className="admin-title"><span><Leaf size={21} /></span><div><b>لوحة تحكم الأصيل</b><small>إدارة متجرك بكل سهولة</small></div></div><div className="admin-top-actions"><button onClick={logout}><LogOut size={16} /> تسجيل الخروج</button><button className="close-button" onClick={onClose} aria-label="إغلاق لوحة التحكم"><X size={20} /></button></div></div>
      <div className="admin-layout"><aside className="admin-sidebar"><span className="admin-sidebar-label">القائمة الرئيسية</span><button className={tab === "dashboard" ? "active" : ""} onClick={() => { setTab("dashboard"); setError(""); setSuccess(""); }}><LayoutDashboard size={18} /> نظرة عامة</button><button className={tab === "products" ? "active" : ""} onClick={() => { setTab("products"); setError(""); setSuccess(""); }}><ShoppingBag size={18} /> المنتجات والأقسام</button><button className={tab === "settings" ? "active" : ""} onClick={() => { setTab("settings"); setError(""); setSuccess(""); }}><Settings size={18} /> إعدادات المتجر</button></aside><div className="admin-content">
        <section className="admin-box"><b>مسودة على هذا الجهاز</b><p>للنشر: نزّل الملف وارفعه بنفس الاسم في المجلد المرتبط، ثم اضغط Commit changes. تظهر التعديلات للزوار بعد تحديث نسخة GitHub.</p>
          <button className="button button-green" onClick={() => { const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+"\n"],{type:"application/json"})); const a=document.createElement("a"); a.href=url; a.download="catalog.json"; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }}>تنزيل ملف الكتالوج</button>{" "}
          <a className="button button-outline" target="_blank" rel="noreferrer" href="https://github.com/bezzagabdou-source/Absorbs/upload/arena/09b8ccc0-absorbs/spice-store/src/data">نشر الملف في GitHub</a>{" "}
          <button className="text-link" onClick={async()=>{ if(confirm("حذف المسودة من جهازك وفتح النسخة المنشورة؟")){localStorage.removeItem(draftKey); await loadData(); await onStoreChanged();}}}>الرجوع للنسخة المنشورة</button></section>
        {error && <div className="admin-error admin-message">{error}<button onClick={() => setError("")} aria-label="إغلاق"><X size={15} /></button></div>}
        {success && <div className="admin-success admin-message"><Check size={16} /> {success}<button onClick={() => setSuccess("")} aria-label="إغلاق"><X size={15} /></button></div>}
        {tab === "dashboard" && <Dashboard data={data} />}
        {tab === "products" && <ProductsManager data={data} action={runAction} busy={busy} />}
        {tab === "settings" && <SettingsForm data={data} action={runAction} busy={busy} />}
      </div></div>
    </div>}
  </div>;
}

function Dashboard({data}:{data:AdminData}) {
  return <div className="admin-box"><h2>نظرة عامة</h2><p>{data.categories.length} أقسام · {data.products.length} منتج</p><p>التعديلات لا تمسّ النسخة المنشورة حتى ترفع ملف الكتالوج.</p></div>;
}

function ProductsManager({ data, action, busy }: { data: AdminData; action: Action; busy: boolean }) {
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Partial<Product> | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryImage, setCategoryImage] = useState("");
  const visibleProducts = data.products.filter((item) => `${item.name} ${data.categories.find((category) => category.id === item.categoryId)?.name || ""}`.toLowerCase().includes(search.toLowerCase().trim()));
  const updateEditor = (key: keyof Product, value: string | number) => setEditor((current) => current ? { ...current, [key]: value } : current);

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    if (await action({ action: "saveProduct", product: editor }, editor.id ? "تم تحديث المنتج." : "تمت إضافة المنتج.")) setEditor(null);
  }

  async function addCategory(event: FormEvent) {
    event.preventDefault();
    if (await action({ action: "addCategory", name: categoryName, image: categoryImage }, "تمت إضافة القسم الجديد.")) { setCategoryName(""); setCategoryImage(""); }
  }

  return <><div className="admin-page-heading admin-heading-row"><div><span>إدارة التشكيلة</span><h2>المنتجات والأقسام</h2><p>أضف المنتجات وعدّل أسعارها وحالة توفرها.</p></div><button className="button button-green" onClick={() => setEditor({ name: "", categoryId: data.categories[0]?.id, price: "0", status: "available", image: "" })}><PackagePlus size={17} /> إضافة منتج</button></div>
    {editor && <form className="admin-box product-editor" onSubmit={saveProduct}><div className="editor-title"><h3>{editor.id ? "تعديل المنتج" : "منتج جديد"}</h3><button type="button" className="close-button" onClick={() => setEditor(null)} aria-label="إغلاق"><X size={18} /></button></div><div className="admin-form-grid"><label>اسم المنتج<input value={editor.name || ""} onChange={(event) => updateEditor("name", event.target.value)} maxLength={200} required /></label><label>القسم<select value={editor.categoryId || ""} onChange={(event) => updateEditor("categoryId", Number(event.target.value))} required><option value="">اختر القسم</option>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>السعر ({data.settings.currency})<input type="number" min="0" max="99999999" step="0.01" value={editor.price ?? "0"} onChange={(event) => updateEditor("price", event.target.value)} required /></label><label>حالة التوفر<select value={editor.status || "available"} onChange={(event) => updateEditor("status", event.target.value as Availability)}><option value="available">متوفر</option><option value="unavailable">غير متوفر حالياً</option><option value="limited">لا يتوفر دائماً</option></select></label><label className="wide-field">رابط الصورة (اختياري، https) <input value={editor.image || ""} onChange={(event) => updateEditor("image", event.target.value)} placeholder="اتركه فارغاً لاستخدام صورة القسم" dir="ltr" /></label></div><div className="editor-actions"><button className="button button-green" disabled={busy}><Save size={16} /> حفظ المنتج</button><button type="button" className="button button-outline" onClick={() => setEditor(null)}>إلغاء</button></div></form>}
    <div className="admin-box category-form-box"><div className="admin-box-title"><span><Plus size={19} /></span><div><h3>إضافة قسم جديد</h3><p>يمكنك إنشاء قسم ثم إضافة منتجات إليه.</p></div></div><form onSubmit={addCategory} className="category-form"><input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="اسم القسم الجديد" maxLength={120} required /><input value={categoryImage} onChange={(event) => setCategoryImage(event.target.value)} placeholder="رابط الصورة https (اختياري)" dir="rtl" /><button className="button button-outline" disabled={busy}><Plus size={16} /> إضافة القسم</button></form></div>
    <div className="admin-box product-list-box"><div className="list-header"><div><h3>قائمة المنتجات</h3><p>{visibleProducts.length} منتج</p></div><label className="admin-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالاسم أو القسم" /></label></div><div className="admin-product-list">{visibleProducts.map((product) => <div className="admin-product-row" key={product.id}><img src={product.image} alt="" /><div className="admin-product-name"><b>{product.name}</b><span>{data.categories.find((category) => category.id === product.categoryId)?.name}</span></div><div className="admin-product-price">{Number(product.price).toLocaleString("ar-DZ")} {data.settings.currency}</div><span className={`admin-status ${product.status}`}>{product.status === "available" ? "متوفر" : product.status === "limited" ? "لا يتوفر دائماً" : "غير متوفر"}</span><div className="row-actions"><button onClick={() => { setEditor({ ...product }); document.querySelector(".admin-content")?.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label={`تعديل ${product.name}`}><Pencil size={16} /></button><button onClick={() => { if (window.confirm(`هل تريد حذف ${product.name}؟`)) action({ action: "deleteProduct", id: product.id }, "تم حذف المنتج."); }} disabled={busy} aria-label={`حذف ${product.name}`}><Trash2 size={16} /></button></div></div>)}{!visibleProducts.length && <p className="admin-empty">لا توجد منتجات مطابقة للبحث.</p>}</div></div>
  </>;
}

function SettingsForm({ data, action, busy }: { data: AdminData; action: Action; busy: boolean }) {
  const [form, setForm] = useState({ ...data.settings });
  const change = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <><div className="admin-page-heading"><span>تفاصيل متجرك</span><h2>إعدادات المتجر</h2><p>خصص معلومات المتجر والتواصل. تغيير كلمة المرور يتم من إعداد ADMIN_PASSWORD في Vercel ثم إعادة النشر.</p></div><form className="admin-box settings-form" onSubmit={async (event) => { event.preventDefault(); await action({ action: "saveSettings", settings: form }); }}><div className="admin-box-title"><span><Settings size={19} /></span><div><h3>المعلومات العامة</h3><p>تظهر التغييرات للزوار بعد نشر الملف.</p></div></div><div className="admin-form-grid"><label>اسم المتجر<input value={form.storeName} onChange={(event) => change("storeName", event.target.value)} maxLength={100} required /></label><label>رقم واتساب<input value={form.whatsapp} onChange={(event) => change("whatsapp", event.target.value)} dir="ltr" required /></label><label>رسالة حالة التوصيل<input value={form.deliveryMessage} onChange={(event) => change("deliveryMessage", event.target.value)} maxLength={150} required /></label><label>العملة<input value={form.currency} onChange={(event) => change("currency", event.target.value)} maxLength={12} required /></label></div><button className="button button-green" disabled={busy}><Save size={16} /> حفظ الإعدادات</button></form></>;
}
