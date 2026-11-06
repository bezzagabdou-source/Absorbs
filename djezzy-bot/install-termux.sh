#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
#  تثبيت وتشغيل بوت جيزي على الهاتف (Termux) — أمر واحد فقط
#  curl -sL https://raw.githubusercontent.com/bezzagabdou-source/Absorbs/main/djezzy-bot/install-termux.sh | bash
# ============================================================================
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
say()  { printf "%b\n" "${GREEN}$1${NC}"; }
warn() { printf "%b\n" "${YELLOW}$1${NC}"; }
die()  { printf "%b\n" "${RED}$1${NC}"; exit 1; }

REPO_URL="https://github.com/bezzagabdou-source/Absorbs"
TARGET="$HOME/Absorbs/djezzy-bot"

say "==> 1/5 تجهيز الحِزم (Node.js + git)…"
if ! command -v node >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
  pkg update -y >/dev/null 2>&1 || true
  pkg install -y nodejs-lts git || die "تعذّر تثبيت nodejs-lts — تأكد من الاتصال بالإنترنت."
fi
say "    Node.js: $(node -v)"

say "==> 2/5 تحميل المشروع…"
if [ -d "$TARGET/.git" ]; then
  cd "$TARGET" && git pull --ff-only >/dev/null 2>&1 || true
else
  mkdir -p "$HOME"
  cd "$HOME"
  rm -rf "$HOME/Absorbs"
  git clone --depth 1 "$REPO_URL" "$HOME/Absorbs" || die "تعذّر تحميل المشروع من GitHub."
fi
cd "$TARGET" || die "مجلد المشروع غير موجود."

say "==> 3/5 تثبيت مكتبات المشروع…"
npm install --no-audit --no-fund --omit=dev >/dev/null 2>&1 || npm install --no-audit --no-fund

say "==> 4/5 كتابة ملف الإعدادات (.env)…"
cat > .env <<'EOF'
# بوت جيزي — إعدادات التشغيل من الهاتف
BOT_TOKEN=9000927557:AAG6z4AhWH7p_KaS7jxJKmUnVYDr9hk16uY
SESSION_ENCRYPTION_KEY=c80a02529e8b1b9bde9eecc3db29cf7cbd731cac7b9e3e32da147c8407670738

# محرّك جيزي — حقيقي
DJEZZY_DRY_RUN=false
DJEZZY_BASE_URL=https://apim.djezzy.dz
DJEZZY_CLIENT_ID=6E6CwTkp8H1CyQxraPmcEJPQ7xka
DJEZZY_CLIENT_SECRET=MVpXHW_ImuMsxKIwrJpoVVMHjRsa
DJEZZY_CLIENT_ID_LEGACY=87pIExRhxBb3_wGsA5eSEfyATloa
DJEZZY_CLIENT_SECRET_LEGACY=uf82p68Bgisp8Yg1Uz8Pf6_v1XYa
DJEZZY_GIFT_WALK_CODE=GIFTWALKWIN2GO
DJEZZY_SCAN_QR=https://www.djezzy.dz/scanwin-wd26?1
DJEZZY_USER_AGENT=MobileApp/3.0.9
DJEZZY_TIMEOUT_MS=45000

ALLOWED_PREFIXES=7
MAX_NUMBERS_PER_USER=2
EOF
say "    تم حفظ .env"

say "==> 5/5 تشغيل البوت…"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true

cat <<'BANNER'

 ┌──────────────────────────────────────────────┐
 │  ✅ البوت يشتغل الآن                          │
 │  افتح تيليجرام → @Djezzynetbot → /start       │
 │  ثم: 📱 إضافة رقم  →  +2137XXXXXXXX           │
 │  ستصلك رسالة SMS فيها رمز التحقق — أدخله.      │
 │                                              │
 │  لإيقاف البوت: Ctrl+C                        │
 │  لإعادة التشغيل لاحقاً:                       │
 │    cd ~/Absorbs/djezzy-bot && npm run poll   │
 └──────────────────────────────────────────────┘

BANNER

exec node scripts/poll.js
