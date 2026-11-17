import { Pool, type QueryResultRow } from "pg";
import { databaseUrl } from "./env";

/**
 * db.ts — طبقة قاعدة البيانات (Neon Postgres).
 * • Pool واحد مشترك بين كل الطلبات (globalThis) لتجنّب نفاد الاتصالات في Vercel.
 * • ensureDb() تبني المخطط + تزرع الكاتالوج مرة واحدة فقط (advisory lock).
 */

declare global {
  // eslint-disable-next-line no-var
  var __chinwiPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __chinwiSchema: Promise<void> | undefined;
}

export function pool(): Pool {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL غير مضبوط — أضِفه في إعدادات Vercel.");
  if (!globalThis.__chinwiPool) {
    globalThis.__chinwiPool = new Pool({
      connectionString: url,
      ssl: /sslmode=(require|prefer|verify-ca|verify-full)/.test(url) ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.DB_POOL_MAX) || 4,
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT ?? 15000),
      connectionTimeoutMillis: 12_000,
      allowExitOnIdle: true,
    });
    globalThis.__chinwiPool.on("error", (err) => console.error("[db] pool error", err.message));
  }
  return globalThis.__chinwiPool;
}

export async function q<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool().query<T>(sql, params as never[]);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (client: {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: QueryResultRow[] }>;
}) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn({
      query: async (sql, params = []) => {
        const r = await client.query(sql, params as never[]);
        return { rows: r.rows };
      },
    });
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/* ───────────────────────── المخطط ───────────────────────── */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  tg_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_owner BOOLEAN NOT NULL DEFAULT false,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  avatar_file_id TEXT,
  orders_count INTEGER NOT NULL DEFAULT 0,
  total_spent NUMERIC(14,2) NOT NULL DEFAULT 0,
  state TEXT,
  state_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  ban_reason TEXT,
  joined_from TEXT,
  password_changed_at TIMESTAMPTZ,
  messages_count BIGINT NOT NULL DEFAULT 0,
  clicks_count BIGINT NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS messages_count BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS clicks_count BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '📦',
  section TEXT NOT NULL DEFAULT 'games',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(12,2),
  price_label TEXT,
  image_url TEXT,
  image_file_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  featured BOOLEAN NOT NULL DEFAULT false,
  sort INTEGER NOT NULL DEFAULT 0,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  stock INTEGER,
  badge TEXT,
  sold INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  user_id BIGINT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'product',
  product_id INTEGER,
  product_name TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'دج',
  rate NUMERIC(10,2),
  usd_amount NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'pending_payment',
  payment_method TEXT,
  wallet_id INTEGER,
  receipt_file_id TEXT,
  receipt_kind TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT,
  admin_note TEXT,
  reviewed_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallets (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '💳',
  kind TEXT NOT NULL DEFAULT 'other',
  account TEXT NOT NULL DEFAULT '',
  holder TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS channels (
  id SERIAL PRIMARY KEY,
  chat TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS media (
  id BIGSERIAL PRIMARY KEY,
  mime TEXT NOT NULL DEFAULT 'image/jpeg',
  data BYTEA NOT NULL,
  filename TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS logs (
  id BIGSERIAL PRIMARY KEY,
  level TEXT NOT NULL DEFAULT 'info',
  action TEXT NOT NULL,
  actor TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id BIGSERIAL PRIMARY KEY,
  session TEXT NOT NULL DEFAULT 'main',
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  media_id BIGINT,
  actions JSONB,
  provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS broadcasts (
  id SERIAL PRIMARY KEY,
  body TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coupons (
  id serial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  kind text NOT NULL DEFAULT 'percent',
  amount numeric NOT NULL DEFAULT 0,
  min_amount numeric NOT NULL DEFAULT 0,
  max_uses integer NOT NULL DEFAULT 0,
  uses integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  note text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS faq (
  id serial PRIMARY KEY,
  question text NOT NULL,
  answer text NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  hits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reviews (
  id serial PRIMARY KEY,
  user_id bigint,
  name text,
  rating integer NOT NULL DEFAULT 5,
  body text,
  product_name text,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tasks (
  id serial PRIMARY KEY,
  title text NOT NULL,
  note text,
  done boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 2,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS security_events (
  id serial PRIMARY KEY,
  kind text NOT NULL,
  user_id bigint,
  detail text,
  severity text NOT NULL DEFAULT 'info',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS visits (
  id BIGSERIAL PRIMARY KEY,
  path TEXT NOT NULL DEFAULT '/',
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id, sort);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_seen ON users(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_session ON ai_messages(session, created_at);
`;

/* ───────────────────────── الافتراضيات ───────────────────────── */

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  store_name: "CHINWI STORE",
  store_tagline: "شحن فوري • أسعار لا تُقاوَم • خدمة 24/7",
  currency: "دج",
  owner_username: "F_Q_Q_T",
  support_username: "F_Q_Q_T",
  owner_chat_id: 0,
  require_subscription: true,
  // حسابات معفاة من بوابة الاشتراك الإجباري
  gate_bypass: "@A_B_B_X_N",
  banner_image: "/catalog/banner.jpg",
  logo_image: "/catalog/logo.png",
  // ── مركز الحماية ──
  bot_locked: false,
  lock_message: "🛠 المتجر في صيانة سريعة، نرجع بعد قليل — شكراً لصبرك 💚",
  rate_limit_per_min: 20,
  max_orders_per_hour: 6,
  block_words: [],
  auto_block_after: 3,
  anti_fake_receipt: true,
  require_phone_confirm: false,
  new_users_quiet_hours: false,
  security_alert_owner: true,
  maintenance: false,
  maintenance_text: "🛠 المتجر في صيانة سريعة… نرجع لك خلال دقائق.",
  welcome_text:
    "أهلاً بك في <b>CHINWI STORE</b> 👑\nأسرع متجر شحن وتفعيل رقمي في الجزائر 🇩🇿\nاختر ما تريد من القائمة واترك الباقي علينا.",
  usd_rates: [250, 255],
  usd_min: 5,
  receipt_note: "بعد الدفع أرسل صورة الإيصال هنا وسيتم التحقق خلال دقائق ⏱",
  theme: "emerald",
  show_unpriced: true,
  emoji_animated: false,
  emoji_map: {},
  bot_username: "",
  announcement: "🔥 عروض جديدة كل أسبوع — الشحن فوري وآمن 100%",
  orders_open: true,
  auto_approve_usd: false,
  min_order: 0,
};

/** إعدادات محمية لا تظهر قيمتها في الواجهة أبداً */
export const SECRET_SETTINGS = ["admin_password", "panel_salt"];

/* ───────────────────────── البناء + الزرع ───────────────────────── */


/* ── إضافات كاتالوج الألعاب (صور شعارات حقيقية لكل لعبة، بدون أسعار في الصور) ── */
const GAME_FIELDS = [
  { key: "player_id", label: "🎮 آي دي اللاعب (ID)", placeholder: "123456789", required: true },
];

const GAME_SEED: SeedCategory[] = [
  {
    slug: "pubg",
    name: "ببجي موبايل",
    emoji: "🔫",
    section: "games",
    image: "/catalog/games/pubg-poster.jpg",
    description: "شحن UC ببجي موبايل رسمي بأفضل سعر — تسليم سريع بالآي دي.",
    products: [{ name: "60 UC", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 2 }, { name: "325 UC", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 3 }, { name: "660 UC", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 4 }],
  },
  {
    slug: "codm",
    name: "كول أوف ديوتي موبايل",
    emoji: "🎯",
    section: "games",
    image: "/catalog/games/codm-poster.jpg",
    description: "شحن CP لكول أوف ديوتي موبايل — فتح الصناديق والباتل باس.",
    products: [{ name: "80 CP", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 2 }, { name: "420 CP", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 3 }, { name: "880 CP", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 4 }],
  },
  {
    slug: "fcmobile",
    name: "FC موبايل",
    emoji: "⚽️",
    section: "games",
    image: "/catalog/games/fcmobile-poster.jpg",
    description: "شحن عملات FC موبايل لفتح اللاعبين والصناديق.",
    products: [{ name: "250 FC", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 2 }, { name: "1050 FC", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 3 }, { name: "2200 FC", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 4 }],
  },
  {
    slug: "fortnite",
    name: "فورتنايت",
    emoji: "🛠",
    section: "games",
    image: "/catalog/games/fortnite-poster.jpg",
    description: "شحن V-Bucks فورتنايت — سكينات وتحدّيات.",
    products: [{ name: "1000 V-Bucks", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 2 }, { name: "2800 V-Bucks", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 3 }, { name: "5000 V-Bucks", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 4 }],
  },
  {
    slug: "coc",
    name: "كلاش أوف كلانس",
    emoji: "🏰",
    section: "games",
    image: "/catalog/games/coc-poster.jpg",
    description: "جواهر كلاش أوف كلانس — تطوير سريع للقرية.",
    products: [{ name: "500 جوهرة", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 2 }, { name: "1200 جوهرة", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 3 }, { name: "2500 جوهرة", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 4 }],
  },
  {
    slug: "brawl",
    name: "براول ستارز",
    emoji: "⭐️",
    section: "games",
    image: "/catalog/games/brawl-poster.jpg",
    description: "جواهر براول ستارز + باتل باس.",
    products: [{ name: "30 جوهرة", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 2 }, { name: "80 جوهرة", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 3 }, { name: "170 جوهرة", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 4 }],
  },
  {
    slug: "clashroyale",
    name: "كلاش رويال",
    emoji: "👑",
    section: "games",
    image: "/catalog/games/clashroyale-poster.jpg",
    description: "جواهر كلاش رويال وصناديق الترقية.",
    products: [{ name: "500 جوهرة", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 2 }, { name: "1200 جوهرة", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 3 }, { name: "2500 جوهرة", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 4 }],
  },
  {
    slug: "roblox",
    name: "روبلكس",
    emoji: "🧱",
    section: "games",
    image: "/catalog/games/roblox-poster.jpg",
    description: "شحن Robux لحساب روبلكس.",
    products: [{ name: "400 Robux", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 2 }, { name: "800 Robux", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 3 }, { name: "1700 Robux", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 4 }],
  },
  {
    slug: "genshin",
    name: "جينشين إمباكت",
    emoji: "🌀",
    section: "games",
    image: "/catalog/games/genshin-poster.jpg",
    description: "شحن Genesis Crystals لجينشين إمباكت.",
    products: [{ name: "300 Crystal", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 2 }, { name: "980 Crystal", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 3 }, { name: "1980 Crystal", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 4 }],
  },
  {
    slug: "mlbb",
    name: "موبايل ليجندز",
    emoji: "🗡",
    section: "games",
    image: "/catalog/games/mlbb-poster.jpg",
    description: "شحن دايموندز موبايل ليجندز بانغ بانغ.",
    products: [{ name: "86 Diamond", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 2 }, { name: "172 Diamond", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 3 }, { name: "257 Diamond", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 4 }],
  },
  {
    slug: "minecraft",
    name: "ماينكرافت",
    emoji: "🟩",
    section: "games",
    image: "/catalog/games/minecraft.jpg",
    description: "شحن Minecoins وحسابات ماينكرافت.",
    products: [{ name: "1720 Coin", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 2 }, { name: "3500 Coin", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 3 }, { name: "5000 Coin", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 4 }],
  },
  {
    slug: "stumble",
    name: "ستامبل جايز",
    emoji: "🏃",
    section: "games",
    image: "/catalog/games/stumble.png",
    description: "شحن جواهر ستامبل جايز وسكينات.",
    products: [{ name: "100 جوهرة", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 2 }, { name: "300 جوهرة", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 3 }, { name: "700 جوهرة", priceLabel: "تواصل مع المالك", fields: GAME_FIELDS, sort: 4 }],
  },
];

/** يضيف الألعاب الجديدة ويصحّح صور الأقسام الموجودة — مرة واحدة، وبدون حذف أي شي */
export async function ensureGameCatalog(): Promise<void> {
  const done = Number((await getSetting<number>("catalog_games_v3")) ?? 0);
  if (done) return;
  const existing = await pool().query("SELECT id, slug FROM categories");
  const bySlug = new Map<string, number>();
  for (const row of existing.rows as { id: number; slug: string }[]) bySlug.set(row.slug, row.id);
  for (const [i, cat] of GAME_SEED.entries()) {
    const inserted = await pool().query(
      `INSERT INTO categories (slug, name, emoji, section, description, image_url, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (slug) DO UPDATE SET image_url = EXCLUDED.image_url, section = EXCLUDED.section
       RETURNING id`,
      [cat.slug, cat.name, cat.emoji, cat.section, cat.description, cat.image ?? null, 100 + i],
    );
    const catId = (inserted.rows[0] as { id?: number } | undefined)?.id;
    if (!catId) continue;
    for (const [pi, p] of cat.products.entries()) {
      await pool().query(
        `INSERT INTO products (category_id, name, description, price, price_label, fields, sort, badge, featured, active)
         SELECT $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,true
         WHERE NOT EXISTS (SELECT 1 FROM products WHERE category_id = $1 AND name = $2)`,
        [catId, p.name, p.description ?? "", p.price ?? null, p.priceLabel ?? null, JSON.stringify(p.fields ?? []), p.sort ?? pi + 1, p.badge ?? null, Boolean(p.featured)],
      );
    }
  }
  // تصحيح صور الأقسام: بوسترات الأسعار الأصلية في مكانها + بوستر لكل لعبة جديدة
  await pool().query("UPDATE categories SET image_url = $1 WHERE slug = 'efootball'", ["/catalog/pes-poster.jpg"]);
  await pool().query("UPDATE categories SET image_url = $1 WHERE slug = 'freefire'", ["/catalog/freefire-poster.jpg"]);
  await pool().query("UPDATE categories SET image_url = $1 WHERE slug = 'tiktok'", ["/catalog/tiktok-poster.jpg"]);
  // محفظة Flexy — المتجر يقبل الشراء بها (وللمالك أيضاً)
  await pool().query(
    `INSERT INTO wallets (name, emoji, kind, account, holder, instructions, sort)
     SELECT $1,$2,$3,$4,$5,$6,$7
     WHERE NOT EXISTS (SELECT 1 FROM wallets WHERE lower(name) LIKE '%flexy%')`,
    ["Flexy", "💠", "flexy", "ضع رقم/معرّف Flexy هنا من لوحة التحكم", "Flexy", "ادفع عبر Flexy ثم أرسل صورة الإيصال — الشحن فوري بعد التأكيد.", 5],
  );
  // إزالة الحد الأدنى لشراء الدولار
  await setSetting("usd_min", 0);
  await setSetting("catalog_games_v3", 1);
  await log("catalog_games", { games: GAME_SEED.length }, "success", "system");
}

export async function ensureDb(): Promise<void> {
  if (!globalThis.__chinwiSchema) {
    globalThis.__chinwiSchema = (async () => {
      await q("SELECT 1");
      await q(SCHEMA);
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await q(
          `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
           ON CONFLICT (key) DO NOTHING`,
          [key, JSON.stringify(value)],
        );
      }
      await seedCatalog();
      await ensureGameCatalog();
      await ensureOwner();
    })().catch((err) => {
      globalThis.__chinwiSchema = undefined;
      throw err;
    });
  }
  return globalThis.__chinwiSchema;
}

/** ضمان وجود حساب المالك (حتى تصل إشعارات الطلبات) */
async function ensureOwner(): Promise<void> {
  const handle = String((await getSetting<string>("owner_username")) || "F_Q_Q_T").replace(/^@/, "");
  const envId = Number((await getSetting<number>("owner_chat_id")) || 0);
  if (envId > 0) {
    await q(
      `INSERT INTO users (tg_id, is_owner, is_admin) VALUES ($1, true, true)
       ON CONFLICT (tg_id) DO UPDATE SET is_owner = true, is_admin = true`,
      [envId],
    );
    return;
  }
  await q(
    `UPDATE users SET is_owner = true, is_admin = true
     WHERE lower(username) = lower($1)`,
    [handle],
  );
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await one<{ value: T }>("SELECT value FROM settings WHERE key = $1", [key]);
  if (row) return row.value;
  const def = DEFAULT_SETTINGS[key];
  // نُعيد نسخة مستقلة حتى لا يُعدَّل الافتراضي المشترك بين الطلبات
  if (def && typeof def === "object") return JSON.parse(JSON.stringify(def)) as T;
  return def as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await q(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value ?? null)],
  );
}

export async function allSettings(): Promise<Record<string, unknown>> {
  const rows = await q<{ key: string; value: unknown }>("SELECT key, value FROM settings");
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function log(
  action: string,
  details: Record<string, unknown> = {},
  level: "info" | "warn" | "error" | "success" = "info",
  actor?: string,
): Promise<void> {
  try {
    await q("INSERT INTO logs (level, action, actor, details) VALUES ($1,$2,$3,$4::jsonb)", [
      level,
      action,
      actor ?? null,
      JSON.stringify(details),
    ]);
  } catch (err) {
    console.error("[log] failed", err);
  }
}

/* ───────────────────────── كاتالوج البداية (من صور الأسعار) ───────────────────────── */

type SeedProduct = {
  name: string;
  price?: number | null;
  priceLabel?: string;
  description?: string;
  fields?: { key: string; label: string; placeholder?: string; required?: boolean }[];
  badge?: string;
  featured?: boolean;
  sort?: number;
};

type SeedCategory = {
  slug: string;
  name: string;
  emoji: string;
  section: string;
  description: string;
  image?: string;
  products: SeedProduct[];
};

const FF_FIELDS = [
  { key: "player_id", label: "🆔 آيدي اللاعب (ID) في فري فاير", placeholder: "مثال: 1234567890", required: true },
];
const PES_FIELDS = [
  { key: "konami_id", label: "🆔 آيدي حسابك في eFootball (Konami ID)", placeholder: "مثال: 123-456-789", required: true },
];
const TG_FIELDS = [
  { key: "username", label: "👤 اسم المستخدم (@username) الذي تريد ترقية بريميوم عليه", placeholder: "@example", required: true },
];
const TT_FIELDS = [
  { key: "username", label: "👤 اسم مستخدم تيك توك (@username)", placeholder: "@example", required: true },
];

const SEED: SeedCategory[] = [
  {
    slug: "freefire",
    name: "فري فاير",
    emoji: "💎",
    section: "games",
    image: "/catalog/freefire.jpg",
    description: "جواهر فري فاير + عضويات أسبوعية وشهرية — شحن فوري بأفضل سعر في الجزائر.",
    products: [
      { name: "100 جوهرة", price: 320, fields: FF_FIELDS, sort: 1 },
      { name: "310 جوهرة", price: 900, fields: FF_FIELDS, sort: 2 },
      { name: "500 جوهرة", price: 1450, fields: FF_FIELDS, sort: 3 },
      { name: "1060 جوهرة", price: 3000, fields: FF_FIELDS, sort: 4, badge: "🔥 الأكثر طلباً", featured: true },
      { name: "2180 جوهرة", price: 6000, fields: FF_FIELDS, sort: 5 },
      { name: "5600 جوهرة", price: 15000, fields: FF_FIELDS, sort: 6, badge: "👑 أفضل قيمة" },
      { name: "عضوية أسبوعية (مخفّضة)", price: 250, fields: FF_FIELDS, sort: 7 },
      { name: "عضوية أسبوعية", price: 420, fields: FF_FIELDS, sort: 8 },
      { name: "عضوية شهرية", price: 3000, fields: FF_FIELDS, sort: 9, badge: "⭐ VIP" },
    ],
  },
  {
    slug: "efootball",
    name: "eFootball PES",
    emoji: "⚽️",
    section: "games",
    image: "/catalog/pes.jpg",
    description: "شحن كوينز وباقات eFootball PES بأفضل الأسعار — تفعيل سريع ومضمون.",
    products: [
      { name: "شحن بوغرة", price: 350, fields: PES_FIELDS, sort: 1 },
      { name: "شحن سواريز", price: 350, fields: PES_FIELDS, sort: 2 },
      { name: "شحن كاسياس", price: 800, fields: PES_FIELDS, sort: 3 },
      { name: "شحن تخفيض 500 كوينز", price: 800, fields: PES_FIELDS, sort: 4 },
      { name: "شحن تخفيض 1500 كوينز", price: 2500, fields: PES_FIELDS, sort: 5, featured: true },
      { name: "شحن تخفيض 4500 كوينز", price: 7000, fields: PES_FIELDS, sort: 6, badge: "👑 أفضل قيمة" },
      { name: "100 كوينز", price: 320, fields: PES_FIELDS, sort: 7 },
      { name: "300 كوينز", price: 800, fields: PES_FIELDS, sort: 8 },
      { name: "500 كوينز عادي", price: 1300, fields: PES_FIELDS, sort: 9 },
      { name: "1000 كوينز", price: 2600, fields: PES_FIELDS, sort: 10, badge: "🔥 الأكثر طلباً", featured: true },
      { name: "3000 كوينز", price: 7000, fields: PES_FIELDS, sort: 11 },
    ],
  },
  {
    slug: "tiktok",
    name: "تيك توك كوينز",
    emoji: "🎵",
    section: "services",
    image: "/catalog/tiktok.jpg",
    description: "شحن عملات تيك توك (Coins) بسرعة وأمان — أرسل اسم المستخدم فقط.",
    products: [
      { name: "70 عملة تيك توك", price: 350, fields: TT_FIELDS, sort: 1 },
      { name: "350 عملة تيك توك", price: 1500, fields: TT_FIELDS, sort: 2, featured: true },
      { name: "700 عملة تيك توك", price: 3200, fields: TT_FIELDS, sort: 3 },
      { name: "1400 عملة تيك توك", price: 6400, fields: TT_FIELDS, sort: 4, badge: "👑 أفضل قيمة" },
    ],
  },
  {
    slug: "telegram",
    name: "تيليجرام بريميوم",
    emoji: "⭐️",
    section: "services",
    image: "/catalog/telegram.jpg",
    description: "تفعيل Telegram Premium رسمي على حسابك — بدون كلمة سر وبدون مخاطر.",
    products: [
      { name: "Telegram Premium — شهر واحد", price: 1700, fields: TG_FIELDS, sort: 1, badge: "⚡️ تفعيل فوري", featured: true },
      { name: "Telegram Premium — 3 أشهر", price: null, priceLabel: "تواصل مع المالك", fields: TG_FIELDS, sort: 2 },
      { name: "Telegram Premium — 6 أشهر", price: null, priceLabel: "تواصل مع المالك", fields: TG_FIELDS, sort: 3 },
      { name: "Telegram Premium — سنة كاملة", price: null, priceLabel: "تواصل مع المالك", fields: TG_FIELDS, sort: 4 },
      { name: "Telegram Stars (نجوم)", price: null, priceLabel: "تواصل مع المالك", sort: 5 },
      { name: "باقة هدايا بريميوم (Gift)", price: null, priceLabel: "تواصل مع المالك", sort: 6 },
    ],
  },
  {
    slug: "digital",
    name: "المنتجات الرقمية",
    emoji: "🗂",
    section: "digital",
    description: "عشرات المنتجات الرقمية: حسابات AI، منصات أفلام، تصميم، ألعاب، اشتراكات… السعر يحدده المالك عند الطلب.",
    products: [
      { name: "ChatGPT Plus (شهر)", priceLabel: "تواصل مع المالك" },
      { name: "ChatGPT Plus (3 أشهر)", priceLabel: "تواصل مع المالك" },
      { name: "Claude Pro", priceLabel: "تواصل مع المالك" },
      { name: "Gemini Advanced", priceLabel: "تواصل مع المالك" },
      { name: "Grok Premium (xAI)", priceLabel: "تواصل مع المالك" },
      { name: "Perplexity Pro", priceLabel: "تواصل مع المالك" },
      { name: "Midjourney", priceLabel: "تواصل مع المالك" },
      { name: "Cursor Pro", priceLabel: "تواصل مع المالك" },
      { name: "GitHub Copilot", priceLabel: "تواصل مع المالك" },
      { name: "ElevenLabs", priceLabel: "تواصل مع المالك" },
      { name: "Netflix (حساب خاص)", priceLabel: "تواصل مع المالك" },
      { name: "Shahid VIP", priceLabel: "تواصل مع المالك" },
      { name: "Disney+", priceLabel: "تواصل مع المالك" },
      { name: "Amazon Prime Video", priceLabel: "تواصل مع المالك" },
      { name: "OSN+", priceLabel: "تواصل مع المالك" },
      { name: "Crunchyroll", priceLabel: "تواصل مع المالك" },
      { name: "Spotify Premium", priceLabel: "تواصل مع المالك" },
      { name: "YouTube Premium", priceLabel: "تواصل مع المالك" },
      { name: "Anghami Plus", priceLabel: "تواصل مع المالك" },
      { name: "Canva Pro", priceLabel: "تواصل مع المالك" },
      { name: "Adobe Creative Cloud", priceLabel: "تواصل مع المالك" },
      { name: "CapCut Pro", priceLabel: "تواصل مع المالك" },
      { name: "Figma Pro", priceLabel: "تواصل مع المالك" },
      { name: "Steam (لعبة / رصيد)", priceLabel: "تواصل مع المالك" },
      { name: "PSN Card", priceLabel: "تواصل مع المالك" },
      { name: "Xbox Game Pass", priceLabel: "تواصل مع المالك" },
      { name: "PUBG UC", priceLabel: "تواصل مع المالك" },
      { name: "Roblox Robux", priceLabel: "تواصل مع المالك" },
      { name: "Valorant Points", priceLabel: "تواصل مع المالك" },
      { name: "Minecraft (حساب)", priceLabel: "تواصل مع المالك" },
      { name: "Google Play Gift Card", priceLabel: "تواصل مع المالك" },
      { name: "iTunes Gift Card", priceLabel: "تواصل مع المالك" },
      { name: "Windows 11 Pro (مفتاح)", priceLabel: "تواصل مع المالك" },
      { name: "Office 365 (مفتاح)", priceLabel: "تواصل مع المالك" },
      { name: "NordVPN", priceLabel: "تواصل مع المالك" },
      { name: "ExpressVPN", priceLabel: "تواصل مع المالك" },
      { name: "Kaspersky / حماية", priceLabel: "تواصل مع المالك" },
      { name: "Coursera Plus", priceLabel: "تواصل مع المالك" },
      { name: "Udemy (دورة)", priceLabel: "تواصل مع المالك" },
      { name: "LinkedIn Premium", priceLabel: "تواصل مع المالك" },
      { name: "Zoom Pro", priceLabel: "تواصل مع المالك" },
      { name: "خدمة رشق متابعين (Boost)", priceLabel: "تواصل مع المالك" },
      { name: "بطاقة شراء من أي متجر", priceLabel: "تواصل مع المالك" },
      { name: "حساب ألعاب نادر (Special Order)", priceLabel: "تواصل مع المالك" },
    ],
  },
];

const SEED_WALLETS = [
  {
    name: "Binance (USDT)",
    emoji: "🟡",
    kind: "binance",
    account: "1210865168",
    holder: "PAY ID / Binance ID",
    instructions: "حوّل المبلغ عبر Binance Pay إلى الـ Pay ID ثم أرسل صورة الإيصال.",
    sort: 1,
  },
  {
    name: "RedotPay",
    emoji: "🟣",
    kind: "redotpay",
    account: "1681967118",
    holder: "RedotPay UID",
    instructions: "أرسل المبلغ إلى UID في RedotPay ثم أرسل لقطة شاشة للعملية.",
    sort: 2,
  },
  {
    name: "Bybit",
    emoji: "🔵",
    kind: "bybit",
    account: "603043475",
    holder: "Bybit UID",
    instructions: "حوّل المبلغ إلى UID داخل Bybit ثم أرسل صورة الإيصال.",
    sort: 3,
  },
  {
    name: "BaridiMob",
    emoji: "🟢",
    kind: "baridimob",
    account: "00799999004327338404",
    holder: "RIP / CCP",
    instructions: "حوّل عبر تطبيق BaridiMob إلى رقم RIP ثم أرسل صورة الوصل.",
    sort: 4,
  },
];

/** ترحيلات لمرة واحدة على القواعد الموجودة مسبقاً */
async function migrateOnce(query: Query): Promise<void> {
  const bump = async (key: string, fn: () => Promise<void>): Promise<void> => {
    const done = await query("SELECT value FROM settings WHERE key = $1", [key]);
    if (done.rows.length) return;
    await fn();
    await query(
      "INSERT INTO settings (key, value) VALUES ($1, 'true'::jsonb) ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb",
      [key],
    );
  };

  // محفظة 603043475 = Bybit (كانت مسمّاة PayPal سابقاً)
  await bump("migr_bybit_wallet", async () => {
    await query("UPDATE wallets SET name = 'Bybit', emoji = '🔵', holder = 'Bybit UID' WHERE account = '603043475'");
    await query("UPDATE wallets SET emoji = '🟣' WHERE account = '1681967118'");
    await query("UPDATE wallets SET emoji = '🟡' WHERE account = '1210865168'");
    await query("UPDATE wallets SET emoji = '🟢' WHERE account = '00799999004327338404'");
  });
}

const SEED_CHANNELS = [
  { chat: "@ft_H_N_O", title: "قناة ft_H_N_O", url: "https://t.me/ft_H_N_O", sort: 1 },
  { chat: "@CHNawaa", title: "قناة CHNawaa", url: "https://t.me/CHNawaa", sort: 2 },
];

type Query = (sql: string, params?: unknown[]) => Promise<{ rows: QueryResultRow[] }>;

async function seedCatalog(): Promise<void> {
  // قفل استشاري على مستوى المعاملة: يمنع الزرع المزدوج عند إقلاع عدة دوال معاً
  await tx(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(917263)");
    await migrateOnce(client.query);
    await seedWithin(client.query);
  });
}

async function seedWithin(query: Query): Promise<void> {
  const markerRow = await query("SELECT value FROM settings WHERE key = 'seed_version'");
  const marker = markerRow.rows[0] as { value: unknown } | undefined;
  const current = Number(marker?.value ?? 0);
  if (current >= 3) return;

  const catsRow = await query("SELECT count(*)::text AS count FROM categories");
  const hasCats = Number((catsRow.rows[0] as { count?: string } | undefined)?.count ?? 0) > 0;

  if (!hasCats) {
    for (const [ci, cat] of SEED.entries()) {
      const inserted = await query(
        `INSERT INTO categories (slug, name, emoji, section, description, image_url, sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [cat.slug, cat.name, cat.emoji, cat.section, cat.description, cat.image ?? null, ci + 1],
      );
      const catId = (inserted.rows[0] as { id?: number } | undefined)?.id;
      if (!catId) continue;
      for (const [pi, p] of cat.products.entries()) {
        await query(
          `INSERT INTO products (category_id, name, description, price, price_label, fields, sort, badge, featured, active)
           SELECT $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,true
           WHERE NOT EXISTS (SELECT 1 FROM products WHERE category_id = $1 AND name = $2)`,
          [
            catId,
            p.name,
            p.description ?? "",
            p.price ?? null,
            p.priceLabel ?? null,
            JSON.stringify(p.fields ?? []),
            p.sort ?? pi + 1,
            p.badge ?? null,
            Boolean(p.featured),
          ],
        );
      }
    }
  }

  const walletRow = await query("SELECT count(*)::text AS count FROM wallets");
  if (Number((walletRow.rows[0] as { count?: string } | undefined)?.count ?? 0) === 0) {
    for (const w of SEED_WALLETS) {
      await query(
        `INSERT INTO wallets (name, emoji, kind, account, holder, instructions, sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [w.name, w.emoji, w.kind, w.account, w.holder, w.instructions, w.sort],
      );
    }
  }

  const chRow = await query("SELECT count(*)::text AS count FROM channels");
  if (Number((chRow.rows[0] as { count?: string } | undefined)?.count ?? 0) === 0) {
    for (const c of SEED_CHANNELS) {
      await query("INSERT INTO channels (chat, title, url, sort) VALUES ($1,$2,$3,$4) ON CONFLICT (chat) DO NOTHING", [
        c.chat,
        c.title,
        c.url,
        c.sort,
      ]);
    }
  }

  await query(
    `INSERT INTO settings (key, value) VALUES ('seed_version', '3'::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = '3'::jsonb`,
  );
}

/* ───────────────────────── النسخ الاحتياطي ───────────────────────── */

export const BACKUP_TABLES = [
  "settings",
  "users",
  "categories",
  "products",
  "wallets",
  "channels",
  "orders",
  "media",
  "ai_messages",
  "broadcasts",
  "visits",
  "logs",
] as const;

export async function backupJson(): Promise<{
  exported_at: string;
  counts: Record<string, number>;
  tables: Record<string, unknown[]>;
}> {
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const t of BACKUP_TABLES) {
    const limit = t === "logs" ? " ORDER BY created_at DESC LIMIT 2000" : "";
    const rows = await q<Record<string, unknown>>(`SELECT * FROM ${t}${limit}`);
    tables[t] = rows;
    counts[t] = rows.length;
  }
  return { exported_at: new Date().toISOString(), counts, tables };
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === "object") return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

export async function backupSql(): Promise<string> {
  const parts: string[] = [
    `-- CHINWI STORE — نسخة احتياطية كاملة`,
    `-- التاريخ: ${new Date().toISOString()}`,
    `-- الاستعادة: psql "$DATABASE_URL" -f backup.sql`,
    "",
  ];
  for (const t of BACKUP_TABLES) {
    const limit = t === "logs" ? " ORDER BY created_at DESC LIMIT 2000" : "";
    const rows = await q<Record<string, unknown>>(`SELECT * FROM ${t}${limit}`);
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    parts.push(`-- ${t}: ${rows.length} صف`);
    for (const row of rows) {
      parts.push(
        `INSERT INTO ${t} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols
          .map((c) => sqlLiteral(row[c]))
          .join(", ")}) ON CONFLICT DO NOTHING;`,
      );
    }
    parts.push("");
  }
  return parts.join("\n");
}
