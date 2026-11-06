#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
#  بوت جيزي (Polling) — تثبيت كامل على Termux بأمر واحد، ثم تشغيل 24/7 عبر pm2
#  الاستعمال:
#     curl -sL https://raw.githubusercontent.com/bezzagabdou-source/Absorbs/main/djezzy-polling-bot/install-termux.sh | bash
#  (لاختبار فرع آخر قبل دمجه)
#     curl -sL https://raw.githubusercontent.com/bezzagabdou-source/Absorbs/<branch>/djezzy-polling-bot/install-termux.sh | ABSORBS_BRANCH=<branch> bash
# ============================================================================
set -e

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
say()  { printf "%b\n" "${G}$1${N}"; }
warn() { printf "%b\n" "${Y}$1${N}"; }
die()  { printf "%b\n" "${R}$1${N}"; exit 1; }

REPO_URL="https://github.com/bezzagabdou-source/Absorbs"
ROOT="$HOME/Absorbs"
DIR="$ROOT/djezzy-polling-bot"
APP="djezzy-bot"

# الفرع: من المتغيّر، وإلا الفرع الحالي للنسخة الموجودة، وإلا main
if [ -n "${ABSORBS_BRANCH:-}" ]; then
  BRANCH="$ABSORBS_BRANCH"
elif [ -d "$ROOT/.git" ]; then
  BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
  [ "$BRANCH" = "HEAD" ] && BRANCH="main"
else
  BRANCH="main"
fi

say "════════════════════════════════════════════════════"
say " بوت جيزي — تثبيت كامل (Termux) · الفرع: $BRANCH"
say "════════════════════════════════════════════════════"

# ---------------------------------------------------------------- 1) الحزم
say "==> 1/6 تجهيز Node.js و git و pm2…"
command -v pkg >/dev/null 2>&1 || die "هذا السكربت لـ Termux فقط (pkg غير موجود)."
if ! command -v node >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
  pkg update -y >/dev/null 2>&1 || true
  pkg install -y nodejs-lts git >/dev/null 2>&1 || pkg install -y nodejs git || die "تعذّر تثبيت Node.js — تحقّق من الإنترنت."
fi
command -v node >/dev/null 2>&1 || die "Node.js غير مثبّت."
say "    Node.js $(node -v)"

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2 --no-audit --no-fund >/dev/null 2>&1 || npm install -g pm2 || warn "⚠️ تعذّر تثبيت pm2 — سيُشغَّل البوت في المقدّمة فقط."
fi
command -v pm2 >/dev/null 2>&1 && say "    pm2 $(pm2 -v 2>/dev/null | tail -1)"

# ---------------------------------------------------------------- 2) المشروع
say "==> 2/6 تحميل المشروع (الفرع $BRANCH)…"
if [ -d "$ROOT/.git" ]; then
  cd "$ROOT"
  if git fetch --depth 1 origin "$BRANCH" >/dev/null 2>&1; then
    git checkout -q -B "$BRANCH" FETCH_HEAD >/dev/null 2>&1 || git reset --hard FETCH_HEAD >/dev/null 2>&1 || true
    git reset --hard FETCH_HEAD >/dev/null 2>&1 || true
  elif [ -f "$DIR/index.js" ]; then
    warn "    تعذّر التحديث من GitHub — نُكمل بالنسخة الموجودة محلياً."
  else
    die "تعذّر تحميل الكود — تحقّق من الإنترنت ثم أعد المحاولة."
  fi
else
  rm -rf "$ROOT"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$ROOT" >/dev/null 2>&1 || die "تعذّر تحميل المشروع (git clone)."
fi
[ -f "$DIR/index.js" ] || die "ملفات البوت غير موجودة في $DIR"
cd "$DIR"
say "    تم — $(git rev-parse --short HEAD 2>/dev/null || echo 'نسخة محلية')"

# ---------------------------------------------------------------- 3) المكتبات
say "==> 3/6 تثبيت المكتبات…"
npm install --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund
say "    تم"

# ---------------------------------------------------------------- 4) .env
say "==> 4/6 ضبط .env…"
if [ ! -f .env ]; then
cat > .env <<'EOF'
# ===== بوت جيزي (Polling) =====
BOT_TOKEN=9000927557:AAG6z4AhWH7p_KaS7jxJKmUnVYDr9hk16uY
SESSION_KEY=

DJEZZY_CLIENT_ID=6E6CwTkp8H1CyQxraPmcEJPQ7xka
DJEZZY_CLIENT_SECRET=MVpXHW_ImuMsxKIwrJpoVVMHjRsa
DJEZZY_CLIENT_ID_LEGACY=87pIExRhxBb3_wGsA5eSEfyATloa
DJEZZY_CLIENT_SECRET_LEGACY=uf82p68Bgisp8Yg1Uz8Pf6_v1XYa

DJEZZY_USER_AGENT=MobileApp/3.0.9 (Android 13; DalilDjezzy)
DJEZZY_ACCEPT_LANGUAGE=ar-DZ

# الشبكة — هذه القيم تُصلح ECONNABORTED/ETIMEDOUT على شبكات الهاتف
DJEZZY_BASE_URL=https://apim.djezzy.dz
DJEZZY_TIMEOUT_MS=45000
DJEZZY_RETRIES=3
DJEZZY_FORCE_IPV4=1
DJEZZY_FALLBACK_DNS=1.1.1.1,8.8.8.8
DJEZZY_WATCH_MS=300000

# بروكسي جزائري (إجباري إن شغّلت البوت على استضافة خارج الجزائر):
# DJEZZY_PROXIES=http://user:pass@IP:PORT,socks5://user:pass@IP:PORT
# DJEZZY_DIRECT_FALLBACK=1

DJEZZY_GIFT_WALK_CODE=GIFTWALKWIN2GO
DJEZZY_SCAN_QR=https://www.djezzy.dz/scanwin-wd26?1
ALLOWED_PREFIXES=7
EOF
  say "    أُنشئ .env جديد"
else
  warn "    .env موجود — نُحدّث مفاتيح الشبكة فقط (بدون لمس التوكن)"
fi

# ضبط/تصحيح مفاتيح الشبكة داخل .env الموجود
set_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  else
    printf '%s=%s\n' "$key" "$val" >> .env
  fi
}
set_env DJEZZY_TIMEOUT_MS 45000
set_env DJEZZY_RETRIES 3
set_env DJEZZY_FORCE_IPV4 1
set_env DJEZZY_FALLBACK_DNS 1.1.1.1,8.8.8.8
set_env DJEZZY_BASE_URL https://apim.djezzy.dz
set_env ALLOWED_PREFIXES 7
grep -q '^DJEZZY_GIFT_WALK_CODE=' .env || printf 'DJEZZY_GIFT_WALK_CODE=GIFTWALKWIN2GO\n' >> .env
say "    الشبكة: IPv4 فقط · 45s · 4 محاولات · DNS احتياطي"

# ---------------------------------------------------------------- 5) فحص
say "==> 5/6 فحص الاتصال بخوادم جيزي…"
set +e
node diag.js
DIAG=$?
set -e
if [ "$DIAG" -eq 0 ]; then
  say "    ✅ جيزي متاحة من هذه الشبكة"
else
  warn "    ⚠️ جيزي غير متاحة الآن — البوت سيشتغل ويُعيد المحاولة تلقائياً."
  warn "       الحل: أوقف VPN · بدّل بين Wi-Fi وبيانات جيزي · أطفي Private DNS."
fi

# ---------------------------------------------------------------- 6) التشغيل
say "==> 6/6 التشغيل 24/7 عبر pm2…"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true

# حذف أي نسخة قديمة (سواء bot قديم في ~/djezzy-bot أو هذا التطبيق) لتفادي تعارض 409
if command -v pm2 >/dev/null 2>&1; then
  node -e '
const { execSync } = require("child_process");
let list = [];
try { list = JSON.parse(execSync("pm2 jlist", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); } catch (e) { process.exit(0); }
const old = list.filter((p) => /djezzy/i.test((p.pm2_env && p.pm2_env.pm_exec_path) || "") || /djezzy/i.test(p.name || ""));
for (const p of old) { try { execSync("pm2 delete " + p.pm_id, { stdio: "ignore" }); } catch (e) {} }
if (old.length) console.log("    حُذفت " + old.length + " نسخة قديمة من pm2 (تفادي 409)");
' || true

  pm2 start index.js --name "$APP" \
    --restart-delay=5000 \
    --exp-backoff-restart-delay=2000 \
    --max-restarts=100000 \
    --time >/dev/null
  pm2 save >/dev/null 2>&1 || true

  # تشغيل تلقائي بعد إعادة تشغيل الهاتف (يتطلّب تطبيق Termux:Boot)
  mkdir -p "$HOME/.termux/boot" 2>/dev/null || true
  cat > "$HOME/.termux/boot/djezzy-bot.sh" <<'BOOT'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
sleep 8
pm2 resurrect
BOOT
  chmod +x "$HOME/.termux/boot/djezzy-bot.sh" 2>/dev/null || true
fi

sleep 6
say "════════ حالة pm2 ════════"
pm2 list 2>/dev/null | sed -n '1,12p' || true
echo
say "════════ آخر السجلات ════════"
pm2 logs "$APP" --lines 20 --nostream 2>/dev/null || pm2 logs "$APP" --lines 20 || true

cat <<'DONE'

════════════════════ ✅ تم ════════════════════

🤖 البوت يعمل الآن في الخلفية عبر pm2 (لا يتوقف عند إغلاق Termux)
   ولا يُسقطه انقطاع الشبكة: يعيد المحاولة وحده + pm2 يعيد تشغيله لو مات.

📌 أوامر تحتاجها:
   pm2 logs djezzy-bot        # السجلات مباشرة
   pm2 restart djezzy-bot     # بعد تعديل .env
   pm2 stop djezzy-bot        # إيقاف مؤقّت
   node diag.js               # فحص الشبكة/DNS
   nano ~/Absorbs/djezzy-polling-bot/.env

🎯 الخطوات في تيليجرام (لتأكيد أن كل شيء يعمل):
   1. افتح @Djezzynetbot → /start
   2. اضغط 🧪 اختبار حقيقي (SMS + هدية)
      → يقولك: الشبكة ✅ / الرمز أُرسل ✅  (هذا دليل أن OTP يخدم)
   3. 📱 إضافة رقم → 07XXXXXXXX → أدخل رمز SMS
   4. 🎁 هدية 2 جيجا → تتفعّل فوراً

⚠️ شرطان:
   • شبكة جزائرية بلا VPN (Wi-Fi جيزي أو بيانات 4G).
   • ثبّت تطبيق Termux:Boot من F-Droid إن أردت تشغيلاً تلقائياً بعد إعادة تشغيل الهاتف.
DONE
