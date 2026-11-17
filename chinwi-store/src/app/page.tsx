import { ensureDb, getSetting } from "@/lib/db";
import { getStats, listCategories, listProducts, listWallets, settingBool, settingString, settings } from "@/lib/store";
import { env } from "@/lib/env";
import { money } from "@/lib/format";
import { CopyBtn } from "@/components/ui";
import type { CategoryRow, ProductRow, WalletRow } from "@/lib/types";

export const dynamic = "force-dynamic";

type Data = {
  categories: CategoryRow[];
  products: ProductRow[];
  wallets: WalletRow[];
  stats: { users: number; orders: number };
  settings: Record<string, unknown>;
  botUsername: string;
  error?: string;
};

async function load(): Promise<Data> {
  const fallback: Data = {
    categories: [],
    products: [],
    wallets: [],
    stats: { users: 0, orders: 0 },
    settings: {},
    botUsername: "",
  };
  try {
    await ensureDb();
    const [categories, products, wallets, stats, conf, botUsername] = await Promise.all([
      listCategories({ activeOnly: true }),
      listProducts({ activeOnly: true, limit: 400 }),
      listWallets(true),
      getStats(),
      settings(),
      getSetting<string>("bot_username"),
    ]);
    return {
      categories,
      products,
      wallets,
      stats: { users: stats.users, orders: stats.orders },
      settings: conf,
      botUsername: botUsername ?? "",
    };
  } catch (err) {
    return { ...fallback, error: String(err).slice(0, 240) };
  }
}

export default async function LandingPage(): Promise<React.ReactElement> {
  const data = await load();
  const currency = settingString(data.settings, "currency", "دج");
  const storeName = settingString(data.settings, "store_name", "CHINWI STORE");
  const tagline = settingString(data.settings, "store_tagline", "شحن فوري • أسعار لا تُقاوَم");
  const support = settingString(data.settings, "support_username", "F_Q_Q_T").replace(/^@/, "");
  const owner = settingString(data.settings, "owner_username", "F_Q_Q_T").replace(/^@/, "");
  const botUser = data.botUsername || owner;
  const botLink = `https://t.me/${botUser}`;
  const games = data.categories.filter((c) => c.section === "games");
  const services = data.categories.filter((c) => c.section === "services");
  const digital = data.categories.find((c) => c.section === "digital");
  const digitalProducts = data.products.filter((p) => p.category_id === digital?.id);
  const featured = data.products.filter((p) => p.featured).slice(0, 6);
  const posters = data.categories.filter((c) => c.image_url).slice(0, 4);

  const productByCat = (id: number): ProductRow[] => data.products.filter((p) => p.category_id === id);

  return (
    <main className="relative overflow-hidden">
      {/* شريط علوي */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#05070b]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <a href="#top" className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 text-lg font-black text-black shadow-lg shadow-emerald-500/30">
              C
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-black tracking-wide text-white">{storeName}</span>
              <span className="block text-[0.65rem] text-emerald-400">متجر الشحن الرقمي</span>
            </span>
          </a>
          <nav className="hidden items-center gap-5 text-sm font-bold text-slate-300 md:flex">
            <a className="hover:text-emerald-400" href="#offers">
              العروض
            </a>
            <a className="hover:text-emerald-400" href="#digital">
              منتجات رقمية
            </a>
            <a className="hover:text-emerald-400" href="#pay">
              طرق الدفع
            </a>
            <a className="hover:text-emerald-400" href="#how">
              كيف أشتري؟
            </a>
            <a className="hover:text-emerald-400" href="/admin">
              لوحة التحكم
            </a>
          </nav>
          <a href={botLink} target="_blank" className="btn btn-green text-sm">
            🚀 افتح البوت
          </a>
        </div>
      </header>

      {/* البطل */}
      <section id="top" className="relative mx-auto max-w-7xl px-4 pb-10 pt-12 sm:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="fade-in">
            <span className="chip border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-emerald-400" /> متجر مفتوح 24/7 — شحن فوري
            </span>
            <h1 className="mt-4 text-3xl font-black leading-[1.25] sm:text-5xl">
              أسرع متجر شحن وتفعيل رقمي <span className="gradient-text">في الجزائر</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
              فري فاير • eFootball PES • تيك توك كوينز • تيليجرام بريميوم • حسابات AI ومنصات أفلام…
              كل شيء في بوت واحد على تيليجرام، بأسعار لا تُقاوَم، وتفعيل خلال دقائق 🚀
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={botLink} target="_blank" className="btn btn-green px-5 py-3 text-base">
                🟢 ابدأ الشراء الآن
              </a>
              <a href="#offers" className="btn btn-ghost px-5 py-3 text-base">
                📋 تصفّح العروض
              </a>
              <a href={`https://t.me/${support}`} target="_blank" className="btn btn-red px-5 py-3 text-base">
                💬 الدعم المباشر
              </a>
            </div>
            <dl className="mt-9 grid max-w-lg grid-cols-3 gap-3">
              {[
                { k: "زبون", v: data.stats.users },
                { k: "طلب", v: data.stats.orders },
                { k: "خدمة", v: data.products.length },
              ].map((item) => (
                <div key={item.k} className="panel px-3 py-3 text-center">
                  <dd className="text-xl font-black text-emerald-400">{item.v.toLocaleString("en-US")}+</dd>
                  <dt className="text-[0.7rem] text-slate-400">{item.k}</dt>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-emerald-500/20 via-transparent to-sky-500/10 blur-2xl" />
            <div className="panel noise relative overflow-hidden p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/catalog/freefire.jpg"
                alt="عروض فري فاير"
                className="w-full rounded-xl object-cover"
              />
              <div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-xl border border-white/10 bg-black/70 px-3 py-2 backdrop-blur">
                <span className="text-xs font-bold text-emerald-300">💎 جواهر فري فاير</span>
                <span className="text-xs text-slate-300">من {money(320, currency)}</span>
              </div>
            </div>
          </div>
        </div>

        {data.error && (
          <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
            ⚠️ تعذّر تحميل بيانات المتجر من قاعدة البيانات الآن. تأكد من متغيّر <code>DATABASE_URL</code> — بعد الربط ستظهر الأسعار تلقائياً.
            <span className="mt-1 block opacity-70">{data.error}</span>
          </div>
        )}
      </section>

      {/* شريط متحرك */}
      <div className="border-y border-white/5 bg-emerald-500/[0.04] py-3">
        <div className="flex overflow-hidden">
          <div className="marquee flex shrink-0 items-center gap-8 whitespace-nowrap text-xs font-bold text-emerald-300/80">
            {[...Array(2)].map((_, copy) => (
              <span key={copy} className="flex items-center gap-8">
                <span>⚡️ شحن فوري خلال دقائق</span>
                <span>🔒 معاملات آمنة 100%</span>
                <span>💳 Binance • RedotPay • PayPal • BaridiMob</span>
                <span>👑 أفضل الأسعار في السوق</span>
                <span>🎁 عروض جديدة كل أسبوع</span>
                <span>💵 نشتري الدولار بأفضل سعر</span>
                <span>🤖 دعم آلي ذكي 24/7</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* قسم الألعاب */}
      <section id="offers" className="mx-auto max-w-7xl px-4 py-14">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-white sm:text-3xl">🎮 شحن الألعاب</h2>
            <p className="mt-1 text-sm text-slate-400">جواهر، كوينز وعضويات — بأفضل سعر وأسرع تفعيل</p>
          </div>
          <a href={botLink} target="_blank" className="btn btn-green">
            🟢 شحن الآن
          </a>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {games.map((cat) => (
            <article key={cat.id} className="panel panel-hover overflow-hidden">
              {cat.image_url && (
                <div className="relative h-44 w-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cat.image_url} alt={cat.name} className="h-full w-full object-cover object-top" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0b1118] via-transparent to-transparent" />
                </div>
              )}
              <div className="p-4">
                <h3 className="flex items-center gap-2 text-lg font-extrabold text-white">
                  <span>{cat.emoji}</span> {cat.name}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs text-slate-400">{cat.description}</p>
                <ul className="mt-3 grid grid-cols-2 gap-2">
                  {productByCat(cat.id)
                    .slice(0, 6)
                    .map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between rounded-lg border border-white/8 bg-black/30 px-2.5 py-2 text-[0.74rem]"
                      >
                        <span className="truncate text-slate-200">{p.name}</span>
                        <span className="shrink-0 font-bold text-emerald-400">
                          {p.price ? money(p.price, currency) : "📩"}
                        </span>
                      </li>
                    ))}
                </ul>
                <a href={botLink} target="_blank" className="btn btn-green mt-4 w-full">
                  🟢 اطلب {cat.name}
                </a>
              </div>
            </article>
          ))}
        </div>

        {services.length > 0 && (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {services.map((cat) => (
              <article key={cat.id} className="panel panel-hover flex gap-4 p-4">
                {cat.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={cat.image_url} alt={cat.name} className="h-28 w-28 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="grid h-28 w-28 shrink-0 place-items-center rounded-xl bg-black/40 text-4xl">{cat.emoji}</span>
                )}
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold text-white">
                    {cat.emoji} {cat.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">{cat.description}</p>
                  <p className="mt-2 text-xs text-emerald-300">
                    يبدأ من {money(productByCat(cat.id).find((p) => p.price)?.price ?? 0, currency)}
                  </p>
                  <a href={botLink} target="_blank" className="btn btn-green mt-3 px-3 py-1.5 text-xs">
                    🟢 اشترِ الآن
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ملصقات العروض */}
      {posters.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-14">
          <h2 className="text-2xl font-black text-white sm:text-3xl">🔥 عروض هذا الأسبوع</h2>
          <p className="mt-1 text-sm text-slate-400">كل الأسعار داخل البوت — اضغط على أي صورة لبدء الطلب</p>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {posters.map((cat) => (
              <a
                key={cat.id}
                href={botLink}
                target="_blank"
                className="panel panel-hover group relative block overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cat.image_url ?? ""} alt={cat.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 py-2 text-xs font-bold text-white">
                  {cat.emoji} {cat.name}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* الأكثر طلباً */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-14">
          <h2 className="text-2xl font-black text-white sm:text-3xl">⭐️ الأكثر طلباً</h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {featured.map((p) => (
              <a key={p.id} href={botLink} target="_blank" className="panel panel-hover p-3 text-center">
                <p className="text-2xl">🎁</p>
                <p className="mt-1 line-clamp-2 min-h-[2.2rem] text-xs font-bold text-slate-200">{p.name}</p>
                <p className="mt-1 text-sm font-black text-emerald-400">
                  {p.price ? money(p.price, currency) : "سعر خاص"}
                </p>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* المنتجات الرقمية */}
      <section id="digital" className="mx-auto max-w-7xl px-4 pb-14">
        <div className="panel p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-white sm:text-3xl">🗂 المنتجات الرقمية</h2>
              <p className="mt-1 text-sm text-slate-400">
                حسابات AI، منصات أفلام ومسلسلات، تصميم، ألعاب واشتراكات — عشرات المنتجات، اطلب أي شيء!
              </p>
            </div>
            <span className="chip border-amber-500/30 bg-amber-500/10 text-amber-300">
              📩 بعض المنتجات بسعر خاص — تواصل مع المالك
            </span>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(digitalProducts.length ? digitalProducts : []).slice(0, 30).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2.5"
              >
                <span className="truncate text-xs font-bold text-slate-200">{p.name}</span>
                <span className={`shrink-0 text-xs font-black ${p.price ? "text-emerald-400" : "text-amber-300"}`}>
                  {p.price ? money(p.price, currency) : "تواصل"}
                </span>
              </div>
            ))}
            {!digitalProducts.length && (
              <p className="text-sm text-slate-400">سيتم عرض المنتجات الرقمية هنا بمجرد ربط قاعدة البيانات.</p>
            )}
          </div>
          <a href={botLink} target="_blank" className="btn btn-green mt-5 w-full sm:w-auto">
            🟢 تصفّح المنتجات الرقمية في البوت
          </a>
        </div>
      </section>

      {/* طرق الدفع */}
      <section id="pay" className="mx-auto max-w-7xl px-4 pb-14">
        <h2 className="text-2xl font-black text-white sm:text-3xl">💳 طرق الدفع</h2>
        <p className="mt-1 text-sm text-slate-400">حوّل المبلغ ثم أرسل صورة الإيصال — يتم التحقق والتسليم بسرعة</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.wallets.map((w) => (
            <div key={w.id} className="panel panel-hover p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold text-white">
                  {w.emoji} {w.name}
                </span>
                <span className="chip border-emerald-500/30 bg-emerald-500/10 text-emerald-300">نشط</span>
              </div>
              <p className="mt-3 break-all rounded-lg bg-black/40 px-2 py-1.5 font-mono text-[0.78rem] text-emerald-300" dir="ltr">
                {w.account}
              </p>
              <p className="mt-2 text-[0.7rem] text-slate-500">{w.holder}</p>
              <div className="mt-3">
                <CopyBtn text={w.account} label="نسخ العنوان" />
              </div>
            </div>
          ))}
          {!data.wallets.length && <p className="text-sm text-slate-400">لا توجد محافظ مضافة بعد.</p>}
        </div>
      </section>

      {/* كيف أشتري */}
      <section id="how" className="mx-auto max-w-7xl px-4 pb-14">
        <h2 className="text-2xl font-black text-white sm:text-3xl">🚀 كيف أشتري؟</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: "01", t: "افتح البوت", d: "اضغط على «ابدأ الشراء» واشترك في القنوات المطلوبة.", i: "🤖" },
            { n: "02", t: "اختر العرض", d: "اختر القسم ثم المنتج وأدخل الآيدي الخاص بك.", i: "🎯" },
            { n: "03", t: "ادفع", d: "حوّل المبلغ عبر Binance أو RedotPay أو PayPal أو BaridiMob.", i: "💳" },
            { n: "04", t: "استلم فوراً", d: "أرسل الإيصال، يتم التحقق ويصلك طلبك خلال دقائق.", i: "⚡️" },
          ].map((s) => (
            <div key={s.n} className="panel relative overflow-hidden p-5">
              <span className="absolute -left-1 -top-3 text-6xl font-black text-white/5">{s.n}</span>
              <p className="text-3xl">{s.i}</p>
              <h3 className="mt-2 text-base font-extrabold text-white">{s.t}</h3>
              <p className="mt-1 text-xs leading-6 text-slate-400">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* بيع الدولار */}
      <section className="mx-auto max-w-7xl px-4 pb-14">
        <div className="panel relative overflow-hidden p-6 sm:p-9">
          <div className="absolute -right-10 -top-10 h-52 w-52 rounded-full bg-amber-400/10 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div>
              <span className="chip border-amber-500/30 bg-amber-500/10 text-amber-300">💵 خدمة جديدة</span>
              <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">نشتري الدولار منك بأفضل سعر</h2>
              <p className="mt-2 max-w-xl text-sm text-slate-400">
                عندك دولار أو USDT وتريد بيعه؟ أرسل الكمية، اختر سعر الصرف، وحوّل لك المبلغ بالدينار
                عبر BaridiMob أو RedotPay — كل ذلك داخل البوت.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <a href={`${botLink}`} target="_blank" className="btn btn-green px-6 py-3">
                💵 ابدأ بيع الدولار
              </a>
              <a href={`https://t.me/${owner}`} target="_blank" className="btn btn-ghost px-6 py-3">
                💬 تحدث مع المالك
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* الميزات */}
      <section className="mx-auto max-w-7xl px-4 pb-16">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { i: "⚡️", t: "شحن فوري", d: "تنفيذ الطلبات في دقائق وليس أيام" },
            { i: "🔒", t: "أمان 100%", d: "تفعيل رسمي بدون مشاركة كلمة السر" },
            { i: "🏷", t: "أرخص الأسعار", d: "أسعار السوق الجزائري بأفضل قيمة" },
            { i: "🤝", t: "دعم 24/7", d: "فريق بشري + مساعد AI يرد فوراً" },
          ].map((f) => (
            <div key={f.t} className="panel p-4">
              <p className="text-2xl">{f.i}</p>
              <p className="mt-1 text-sm font-extrabold text-white">{f.t}</p>
              <p className="mt-1 text-xs text-slate-400">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* تذييل */}
      <footer className="border-t border-white/5 bg-black/40">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-lg font-black text-white">{storeName}</p>
            <p className="mt-1 max-w-sm text-xs leading-6 text-slate-400">{tagline}</p>
            <p className="mt-3 text-[0.7rem] text-slate-500">
              © {new Date().getFullYear()} {storeName} — جميع الحقوق محفوظة.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-6 text-xs">
            <div className="space-y-2">
              <p className="font-bold text-slate-300">روابط</p>
              <a className="block text-slate-400 hover:text-emerald-400" href={botLink} target="_blank">
                بوت المتجر
              </a>
              <a className="block text-slate-400 hover:text-emerald-400" href={`https://t.me/${support}`} target="_blank">
                الدعم الفني
              </a>
              <a className="block text-slate-400 hover:text-emerald-400" href="/admin">
                لوحة التحكم
              </a>
            </div>
            <div className="space-y-2">
              <p className="font-bold text-slate-300">قانوني</p>
              <span className="block text-slate-500">سياسة الاسترجاع</span>
              <span className="block text-slate-500">الشروط والأحكام</span>
              <span className="block text-slate-500">الخصوصية</span>
            </div>
          </div>
        </div>
        <div className="border-t border-white/5 px-4 py-3 text-center text-[0.68rem] text-slate-600">
          صُنع بحب في الجزائر 🇩🇿 — {env.siteUrl.replace(/^https?:\/\//, "")}
        </div>
      </footer>

      {/* زر عائم */}
      <a
        href={botLink}
        target="_blank"
        className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full bg-gradient-to-l from-emerald-500 to-emerald-700 px-5 py-3 text-sm font-black text-black shadow-2xl shadow-emerald-500/40 transition hover:scale-105"
      >
        🚀 اطلب الآن
      </a>
    </main>
  );
}

/* استخدام متغيّر قد لا يُستعمل في بعض الحالات */
void settingBool;
