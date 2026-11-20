"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowUpLeft, BadgeCheck, Check, ChevronDown, Copy, HeartHandshake,
  Leaf, LockKeyhole, MapPin, Menu, MessageCircle, Minus, PackageCheck, Plus,
  Search, ShoppingBag, SlidersHorizontal, Sparkles, Sprout, Store, Trash2, Truck,
  X, Phone, ShieldCheck,
} from "lucide-react";
import type { Category, Product, StoreData } from "@/lib/types";
import AdminPanel from "@/components/AdminPanel";

const categoryLabel = (category: Category) => {
  if (category.name.startsWith("الأعشاب")) return "الأعشاب والخلطات";
  if (category.name.startsWith("المراهم")) return "الزيوت والعناية";
  return category.name;
};

const normalize = (value: string) => value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/[ًٌٍَُِّْـ]/g, "").trim();
const money = (price: string | number) => new Intl.NumberFormat("ar-DZ", { maximumFractionDigits: 2 }).format(Number(price));

function whatsappNumber(number: string) {
  const digits = number.replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `213${digits.slice(1)}`;
  return digits;
}

function whatsappLink(number: string, message: string) {
  return `https://wa.me/${whatsappNumber(number)}?text=${encodeURIComponent(message)}`;
}

const statusInfo = {
  available: { label: "متوفر", className: "available" },
  unavailable: { label: "غير متوفر حالياً", className: "unavailable" },
  limited: { label: "لا يتوفر دائماً", className: "limited" },
};

// مركز حي Azirou Amer، وليس إحداثيات المتجر غير المقدمة.
const mapUrl = "https://www.openstreetmap.org/export/embed.html?bbox=5.4425%2C36.6556%2C5.4605%2C36.6676&layer=mapnik&marker=36.6616%2C5.4515";
const directionsUrl = "https://www.google.com/maps/search/?api=1&query=36.6616%2C5.4515";

type Cart = Record<number, number>;

export default function Storefront({ initialData }: { initialData: StoreData }) {
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<number | "all">("all");
  const [availability, setAvailability] = useState("all");
  const [visible, setVisible] = useState(8);
  const [cart, setCart] = useState<Cart>({});
  const [cartReady, setCartReady] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("asil-cart-v1");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const safe: Cart = {};
          Object.entries(parsed).forEach(([key, value]) => {
            if (Number.isInteger(Number(key)) && Number.isInteger(value) && Number(value) > 0 && Number(value) <= 99) safe[Number(key)] = Number(value);
          });
          setCart(safe);
        }
      }
    } catch { /* A damaged or unavailable local cart should not interrupt shopping. */ }
    setCartReady(true);
    try {
      if (!sessionStorage.getItem("asil-visited")) {
        sessionStorage.setItem("asil-visited", "1");
        fetch("/api/visit", { method: "POST" }).then((response) => {
          if (!response.ok) sessionStorage.removeItem("asil-visited");
        }).catch(() => sessionStorage.removeItem("asil-visited"));
      }
    } catch { /* Storage can be unavailable in private browsing. */ }
  }, []);

  useEffect(() => {
    if (cartReady) {
      try { localStorage.setItem("asil-cart-v1", JSON.stringify(cart)); } catch { /* Shopping still works in memory. */ }
    }
  }, [cart, cartReady]);

  useEffect(() => { setVisible(8); }, [query, category, availability]);

  const filtered = useMemo(() => {
    const term = normalize(query);
    return data.products.filter((product) => {
      const group = data.categories.find((item) => item.id === product.categoryId);
      return (category === "all" || product.categoryId === category)
        && (availability === "all" || product.status === availability)
        && (!term || normalize(`${product.name} ${group?.name || ""}`).includes(term));
    });
  }, [data, query, category, availability]);

  const cartItems = data.products.filter((product) => cart[product.id] > 0);
  const cartCount = cartItems.reduce((sum, product) => sum + cart[product.id], 0);
  const cartTotal = cartItems.reduce((sum, product) => sum + Number(product.price) * cart[product.id], 0);
  const hasUnavailable = cartItems.some((product) => product.status === "unavailable");
  const contactLink = whatsappLink(data.settings.whatsapp, `السلام عليكم، أود الاستفسار عن منتجات ${data.settings.storeName}.`);
  const cartMessage = `السلام عليكم، أود حجز أو الاستفسار عن المنتجات التالية من ${data.settings.storeName}:\n\n${cartItems.map((item) => `• ${item.name} × ${cart[item.id]} — ${money(Number(item.price) * cart[item.id])} ${data.settings.currency}`).join("\n")}\n\nالمجموع الاسترشادي: ${money(cartTotal)} ${data.settings.currency}\nأعلم أن ${data.settings.deliveryMessage}، وأود معرفة التفاصيل والتوفر.`;

  function chooseCategory(id: number | "all") {
    setCategory(id);
    setQuery("");
    setAvailability("all");
    document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
  }

  function addToCart(product: Product) {
    if (product.status === "unavailable") return;
    setCart((current) => ({ ...current, [product.id]: Math.min((current[product.id] || 0) + 1, 99) }));
    setNotice(`تمت إضافة ${product.name} إلى السلة`);
    window.setTimeout(() => setNotice(""), 2600);
  }

  function changeQuantity(id: number, delta: number) {
    setCart((current) => {
      const next = { ...current };
      const quantity = (next[id] || 0) + delta;
      if (quantity <= 0) delete next[id];
      else next[id] = Math.min(quantity, 99);
      return next;
    });
  }

  async function refreshStore() {
    try {
      const response = await fetch("/api/store", { cache: "no-store" });
      if (response.ok) setData(await response.json());
    } catch { /* Keep the last loaded data visible. */ }
  }

  async function copyPhone() {
    try {
      await navigator.clipboard.writeText(data.settings.whatsapp);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch { setNotice("تعذر النسخ، الرقم ظاهر أمامك للتواصل."); window.setTimeout(() => setNotice(""), 3000); }
  }

  function focusSearch() {
    document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
    window.setTimeout(() => searchRef.current?.focus(), 400);
  }

  return (
    <>
      <div className="announcement-bar">
        <div className="container announcement-inner">
          <span><Sparkles size={14} /> من خيرات الطبيعة، نختار لكم الأصيل</span>
          <span className="announcement-delivery"><Truck size={15} /> {data.settings.deliveryMessage} <i /> <a href={contactLink} target="_blank" rel="noreferrer">تواصل معنا للحجز <ArrowLeft size={13} /></a></span>
        </div>
      </div>

      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href="#home" aria-label={`${data.settings.storeName} - الرئيسية`}>
            <span className="brand-mark"><Leaf size={27} strokeWidth={1.7} /><span>✦</span></span>
            <span className="brand-name"><strong>{data.settings.storeName}</strong><small>نَكْهَةٌ مِنَ الأَصَالَة</small></span>
          </a>
          <nav className="desktop-nav" aria-label="التنقل الرئيسي">
            <a className="nav-active" href="#home">الرئيسية</a>
            <a href="#categories">الأقسام</a>
            <a href="#products">منتجاتنا</a>
            <a href="#story">حكايتنا</a>
            <a href="#location">موقعنا</a>
          </nav>
          <div className="header-actions">
            <button className="header-icon search-icon" onClick={focusSearch} aria-label="البحث عن منتج"><Search size={20} /></button>
            <button className="header-icon cart-icon" onClick={() => setCartOpen(true)} aria-label={`سلة التسوق، ${cartCount} منتجات`}><ShoppingBag size={20} /><span>{cartCount}</span></button>
            <a className="header-contact" href={contactLink} target="_blank" rel="noreferrer"><MessageCircle size={17} /> تواصل معنا</a>
            <button className="header-icon mobile-menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="فتح القائمة">{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
          </div>
        </div>
        {menuOpen && <nav className="mobile-nav" aria-label="قائمة الهاتف" onClick={() => setMenuOpen(false)}><a href="#home">الرئيسية</a><a href="#categories">الأقسام</a><a href="#products">منتجاتنا</a><a href="#story">حكايتنا</a><a href="#location">موقعنا</a></nav>}
      </header>

      <main id="home">
        <section className="hero-wrap container" aria-label="مرحباً بكم في توابل الأصيل">
          <div className="hero">
            <div className="hero-content">
              <div className="hero-kicker"><span><Leaf size={14} /></span> أصالة الماضي، وجودة الحاضر</div>
              <h1>من الطبيعة إليكم،<br /><em>نكهة تحكي الأصالة.</em></h1>
              <p>توابل وأعشاب مختارة بعناية، تحمل عبق التقاليد وجودة الطبيعة إلى كل بيت.</p>
              <div className="hero-buttons">
                <a className="button button-gold" href="#products">تسوق منتجاتنا <ArrowLeft size={17} /></a>
                <a className="button button-hero-outline" href="#categories">اكتشف أقسامنا <ArrowLeft size={16} /></a>
              </div>
              <div className="hero-bottom"><span className="hero-line" /> مستوحاة من أصالة توابل مغنية <span className="hero-sparkle">✦</span></div>
            </div>
            <div className="hero-note"><span className="hero-note-icon"><BadgeCheck size={22} /></span><span><b>اختيار من الطبيعة</b><small>جودة تستحق الثقة</small></span></div>
          </div>
        </section>

        <section className="benefits container" aria-label="مميزات المتجر">
          <div className="benefit"><span className="benefit-icon"><Sprout /></span><div><b>خيرات طبيعية</b><p>منتجات من أجود ما تقدمه الطبيعة</p></div></div>
          <div className="benefit"><span className="benefit-icon gold-icon"><BadgeCheck /></span><div><b>جودة وأصالة</b><p>اختيارات بعناية تثقون بها</p></div></div>
          <div className="benefit"><span className="benefit-icon"><ShoppingBag /></span><div><b>تشكيلة غنية</b><p>كل احتياجاتكم في مكان واحد</p></div></div>
          <div className="benefit"><span className="benefit-icon gold-icon"><HeartHandshake /></span><div><b>قريبون منكم</b><p>تواصل مباشر بكل سهولة</p></div></div>
        </section>

        <section className="categories-section container section-space" id="categories">
          <div className="section-heading">
            <div><span className="eyebrow"><span /> تشكيلة مختارة لكم</span><h2>تسوق حسب القسم <span className="heading-dot">.</span></h2><p>اكتشفوا خيرات الطبيعة، بتفاصيلها الأصيلة.</p></div>
            <button className="text-link" onClick={() => chooseCategory("all")}>تصفح كل المنتجات <ArrowLeft size={17} /></button>
          </div>
          <div className="category-grid">
            {data.categories.map((item, index) => {
              const count = data.products.filter((product) => product.categoryId === item.id).length;
              return <button className="category-card" key={item.id} onClick={() => chooseCategory(item.id)}>
                <img src={item.image} alt="" loading="lazy" />
                <span className="category-shade" />
                <span className="category-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="category-content"><span><strong>{categoryLabel(item)}</strong><small>{count} منتج بانتظارك</small></span><span className="category-arrow"><ArrowLeft size={18} /></span></span>
              </button>;
            })}
          </div>
        </section>

        <section className="products-section section-space" id="products">
          <div className="container">
            <div className="section-heading products-heading">
              <div><span className="eyebrow"><span /> من رفوف الأصيل</span><h2>منتجات اختيرت بعناية <span className="heading-dot">.</span></h2><p>نكهات أصيلة ومنتجات طبيعية تضيف الخير إلى يومكم.</p></div>
              <div className="catalog-note"><Leaf size={19} /><span>تشكيلة طبيعية<br /><b>بكل تفاصيلها</b></span></div>
            </div>
            <div className="catalog-toolbar">
              <div className="filter-pills" aria-label="تصفية حسب القسم">
                <button className={category === "all" ? "selected" : ""} onClick={() => setCategory("all")}>الكل</button>
                {data.categories.map((item) => <button key={item.id} className={category === item.id ? "selected" : ""} onClick={() => setCategory(item.id)}>{categoryLabel(item)}</button>)}
              </div>
              <div className="catalog-controls">
                <label className="search-field"><Search size={17} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن منتج أو قسم..." aria-label="البحث عن منتج أو قسم" />{query && <button onClick={() => setQuery("")} aria-label="مسح البحث"><X size={15} /></button>}</label>
                <label className="select-field"><SlidersHorizontal size={16} /><select value={availability} onChange={(event) => setAvailability(event.target.value)} aria-label="التصفية حسب التوفر"><option value="all">كل الحالات</option><option value="available">متوفر</option><option value="unavailable">غير متوفر حالياً</option><option value="limited">لا يتوفر دائماً</option></select><ChevronDown size={14} /></label>
              </div>
            </div>
            <div className="results-line"><span>نعرض <b>{Math.min(visible, filtered.length)}</b> من أصل <b>{filtered.length}</b> منتج</span><span>الأسعار استرشادية، يرجى تأكيد السعر والكمية معنا.</span></div>
            {filtered.length ? <div className="product-grid">
              {filtered.slice(0, visible).map((product) => {
                const group = data.categories.find((item) => item.id === product.categoryId);
                const status = statusInfo[product.status] || statusInfo.available;
                const link = whatsappLink(data.settings.whatsapp, `السلام عليكم، أود الاستفسار عن ${product.name} من ${data.settings.storeName}. هل هو متوفر؟`);
                return <article className="product-card" key={product.id}>
                  <div className="product-image"><img src={product.image || group?.image} alt={product.name} loading="lazy" /><span className={`status-badge ${status.className}`}><i />{status.label}</span><a href={link} className="product-contact" target="_blank" rel="noreferrer" aria-label={`استفسر عن ${product.name} عبر واتساب`} title="استفسر عبر واتساب"><MessageCircle size={17} /></a></div>
                  <div className="product-body"><div className="product-category">{group ? categoryLabel(group) : "منتجات طبيعية"}</div><h3>{product.name}</h3><p className="product-description">صورة توضيحية • جودة من الطبيعة</p><div className="product-footer"><div className="product-price"><strong>{money(product.price)} <small>{data.settings.currency}</small></strong><span>سعر استرشادي</span></div><button disabled={product.status === "unavailable"} onClick={() => addToCart(product)} className="add-cart" aria-label={`إضافة ${product.name} إلى السلة`}><Plus size={17} /><span>أضف</span></button></div></div>
                </article>;
              })}
            </div> : <div className="empty-results"><Search size={30} /><h3>لم نجد منتجات مطابقة</h3><p>جرب كلمة أخرى أو غيّر خيارات التصفية.</p><button className="button button-green" onClick={() => { setQuery(""); setCategory("all"); setAvailability("all"); }}>عرض كل المنتجات</button></div>}
            {visible < filtered.length && <div className="more-products"><button className="button button-outline" onClick={() => setVisible((count) => count + 12)}>عرض المزيد من المنتجات <ArrowLeft size={17} /></button><button className="show-all-link" onClick={() => setVisible(filtered.length)}>عرض الكل ({filtered.length})</button></div>}
            <p className="health-note"><ShieldCheck size={15} /> المنتجات الطبيعية لا تُغني عن استشارة المختص، خاصة للحامل والمرضع وأصحاب الحالات الصحية.</p>
          </div>
        </section>

        <section className="story-section container section-space" id="story">
          <div className="story-image"><img src="/images/herbs.png" alt="أعشاب طبيعية مختارة بعناية" loading="lazy" /><div className="story-stamp"><Leaf size={24} /><strong>أصالة</strong><span>من قلب الطبيعة</span></div></div>
          <div className="story-copy"><span className="eyebrow"><span /> حكاية الأصيل</span><h2>للأصالة طعم،<br /><em>وللطبيعة حكاية.</em></h2><p>في {data.settings.storeName}، نؤمن أن أجمل النكهات تبدأ من الطبيعة. اخترنا لكم تشكيلة غنية من التوابل والأعشاب والمنتجات التقليدية، بروح مستوحاة من أصالة توابل مغنية العريقة.</p><p>من زيامة منصورية الجميلة، يسعدنا أن نشارككم خيرات نختارها بكل حب وعناية.</p><div className="story-signature"><span><Leaf size={19} /></span><div><b>من الطبيعة، بكل محبة</b><small>أصالة تُحسّ في كل تفصيلة</small></div></div><a href={contactLink} target="_blank" rel="noreferrer" className="text-link">تعرف علينا أكثر <ArrowLeft size={17} /></a></div>
        </section>

        <section className="contact-banner container"><div className="contact-banner-icon"><MessageCircle size={26} /></div><div><span>نحن هنا لمساعدتك</span><h2>تبحث عن منتج معين؟</h2><p>يسعدنا تواصلكم معنا للاستفسار أو حجز منتجاتكم مباشرة.</p></div><a className="button button-gold" href={contactLink} target="_blank" rel="noreferrer">تواصل عبر واتساب <ArrowLeft size={17} /></a></section>

        <section className="location-section container section-space" id="location">
          <div className="location-copy"><span className="eyebrow"><span /> ننتظركم بكل محبة</span><h2>زورونا في قلب<br /><em>زيامة منصورية.</em></h2><p>بين سحر البحر وجمال الطبيعة في جيجل، يسعدنا استقبالكم في متجرنا ومساعدتكم على اختيار ما يناسبكم.</p><div className="location-detail"><span><MapPin size={20} /></span><div><b>عنوان المتجر</b><p>حي عزيزو أعمر، زيامة منصورية، جيجل</p></div></div><div className="location-detail"><span><Phone size={20} /></span><div><b>تواصلوا معنا</b><p dir="ltr" className="phone-number">{data.settings.whatsapp}</p></div><button className="copy-button" onClick={copyPhone}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "تم النسخ" : "نسخ الرقم"}</button></div><p className="map-help">الخريطة تحدد الحي، تواصل معنا لمعرفة موقع المتجر بالتحديد.</p><a href={directionsUrl} target="_blank" rel="noreferrer" className="button button-green">افتح الموقع في خرائط Google <ArrowUpLeft size={17} /></a></div>
          <div className="map-frame"><iframe src={mapUrl} title="خريطة حي عزيزو أعمر، زيامة منصورية، جيجل" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /><div className="map-caption"><span><MapPin size={19} /></span><div><strong>حي عزيزو أعمر</strong><small>زيامة منصورية، جيجل</small></div><a href={directionsUrl} target="_blank" rel="noreferrer" aria-label="فتح الخريطة"><ArrowUpLeft size={17} /></a></div></div>
        </section>
      </main>

      <footer className="site-footer"><div className="container"><div className="footer-main"><div className="footer-about"><a className="brand footer-brand" href="#home"><span className="brand-mark"><Leaf size={27} strokeWidth={1.7} /><span>✦</span></span><span className="brand-name"><strong>{data.settings.storeName}</strong><small>نَكْهَةٌ مِنَ الأَصَالَة</small></span></a><p>خيرات الطبيعة وأصالة النكهات، نختارها لكم بعناية لتكون جزءاً من أجمل تفاصيل يومكم.</p><span className="footer-natural"><Leaf size={14} /> من الطبيعة... بكل أصالة</span></div><div className="footer-column"><h3>تصفح المتجر</h3><a href="#home">الرئيسية</a><a href="#categories">أقسام المتجر</a><a href="#products">منتجاتنا</a><a href="#story">حكايتنا</a></div><div className="footer-column"><h3>أقسامنا</h3>{data.categories.slice(0, 4).map((item) => <button key={item.id} onClick={() => chooseCategory(item.id)}>{categoryLabel(item)}</button>)}</div><div className="footer-column footer-contact"><h3>يسعدنا تواصلكم</h3><p><MapPin size={17} /> حي عزيزو أعمر، زيامة منصورية، جيجل</p><a href={contactLink} target="_blank" rel="noreferrer"><MessageCircle size={17} /> <span dir="ltr">{data.settings.whatsapp}</span></a><p><Truck size={17} /> {data.settings.deliveryMessage}</p></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} {data.settings.storeName}. بكل حب من الطبيعة.</span><span className="footer-bottom-left">صُنع بعناية <span>✦</span> <button onClick={() => setAdminOpen(true)} aria-label="لوحة التحكم" title="لوحة التحكم"><LockKeyhole size={14} /></button></span></div></div></footer>

      <a className="floating-whatsapp" href={contactLink} target="_blank" rel="noreferrer" aria-label="تواصل معنا عبر واتساب"><MessageCircle size={23} /></a>
      {notice && <div className="toast" role="status"><Check size={17} /> {notice}</div>}

      {cartOpen && <div className="overlay" onClick={() => setCartOpen(false)}><aside className="cart-drawer" onClick={(event) => event.stopPropagation()} aria-label="سلة التسوق" role="dialog" aria-modal="true"><div className="drawer-head"><div><span className="eyebrow"><span /> اختياراتك الأصيلة</span><h2>سلة التسوق <small>({cartCount})</small></h2></div><button className="close-button" onClick={() => setCartOpen(false)} aria-label="إغلاق السلة"><X size={20} /></button></div><div className="delivery-alert"><Truck size={20} /><div><b>{data.settings.deliveryMessage}</b><span>تواصل معنا لحجز منتجاتك أو الاستفسار عنها مباشرة.</span></div></div><div className="cart-content">{cartItems.length ? cartItems.map((item) => <div className="cart-row" key={item.id}><img src={item.image} alt="" /><div className="cart-item-info"><b>{item.name}</b><span>{money(item.price)} {data.settings.currency}</span>{item.status !== "available" && <small className="cart-status">{statusInfo[item.status].label}</small>}<div className="quantity"><button onClick={() => changeQuantity(item.id, -1)} aria-label="إنقاص الكمية"><Minus size={14} /></button><span>{cart[item.id]}</span><button onClick={() => changeQuantity(item.id, 1)} aria-label="زيادة الكمية"><Plus size={14} /></button></div></div><button className="remove-item" onClick={() => setCart((current) => { const next = { ...current }; delete next[item.id]; return next; })} aria-label={`حذف ${item.name}`}><Trash2 size={17} /></button></div>) : <div className="empty-cart"><span><ShoppingBag size={31} /></span><h3>سلتك بانتظار اختياراتك</h3><p>اكتشف منتجاتنا وأضف ما يعجبك إلى السلة.</p><button className="button button-green" onClick={() => { setCartOpen(false); document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }); }}>تصفح المنتجات <ArrowLeft size={16} /></button></div>}</div>{cartItems.length > 0 && <div className="cart-summary"><div><span>المجموع الاسترشادي</span><b>{money(cartTotal)} {data.settings.currency}</b></div><p>السعر والكمية يخضعان للتأكيد عند التواصل.</p>{hasUnavailable && <p className="cart-warning">يرجى إزالة المنتجات غير المتوفرة قبل إرسال السلة.</p>}{hasUnavailable ? <button className="button button-green checkout-button" disabled>بعض المنتجات غير متوفرة</button> : <a className="button button-green checkout-button" href={whatsappLink(data.settings.whatsapp, cartMessage)} target="_blank" rel="noreferrer"><MessageCircle size={18} /> أرسل السلة عبر واتساب</a>}<button className="clear-cart" onClick={() => setCart({})}>إفراغ السلة</button></div>}</aside></div>}
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} onStoreChanged={refreshStore} />}
    </>
  );
}
