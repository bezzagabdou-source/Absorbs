#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
#  تثبيت وتشغيل "بوت جيزي (Polling)" على الهاتف — أمر واحد
#  curl -sL https://raw.githubusercontent.com/bezzagabdou-source/Absorbs/main/djezzy-polling-bot/install-termux.sh | bash
# ============================================================================
set -e

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
say()  { printf "%b\n" "${G}$1${N}"; }
warn() { printf "%b\n" "${Y}$1${N}"; }
die()  { printf "%b\n" "${R}$1${N}"; exit 1; }

REPO="https://github.com/bezzagabdou-source/Absorbs"
DIR="$HOME/Absorbs/djezzy-polling-bot"

say "==> 1/5 تجهيز Node.js و git…"
if ! command -v node >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
  pkg update -y >/dev/null 2>&1 || true
  pkg install -y nodejs-lts git || die "تعذّر التثبيت — تحقّق من الإنترنت."
fi
say "    Node.js $(node -v)"

say "==> 2/5 تحميل المشروع…"
if [ -d "$DIR/.git" ]; then cd "$DIR" && git pull --ff-only >/dev/null 2>&1 || true; else
  rm -rf "$HOME/Absorbs"
  git clone --depth 1 "$REPO" "$HOME/Absorbs" || die "تعذّر تحميل المشروع."
fi
cd "$DIR" || die "مجلد المشروع غير موجود."

say "==> 3/5 تثبيت المكتبات…"
npm install --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund

say "==> 4/5 كتابة .env…"
if [ ! -f .env ]; then
cat > .env <<'EOF'
BOT_TOKEN=9000927557:AAG6z4AhWH7p_KaS7jxJKmUnVYDr9hk16uY
SESSION_KEY=
DJEZZY_CLIENT_ID=6E6CwTkp8H1CyQxraPmcEJPQ7xka
DJEZZY_CLIENT_SECRET=MVpXHW_ImuMsxKIwrJpoVVMHjRsa
DJEZZY_CLIENT_ID_LEGACY=87pIExRhxBb3_wGsA5eSEfyATloa
DJEZZY_CLIENT_SECRET_LEGACY=uf82p68Bgisp8Yg1Uz8Pf6_v1XYa
DJEZZY_USER_AGENT=MobileApp/3.0.9 (Android 13; DalilDjezzy)
DJEZZY_ACCEPT_LANGUAGE=ar-DZ
DJEZZY_TIMEOUT_MS=45000
DJEZZY_RETRIES=1
DJEZZY_GIFT_WALK_CODE=GIFTWALKWIN2GO
DJEZZY_SCAN_QR=https://www.djezzy.dz/scanwin-wd26?1
ALLOWED_PREFIXES=7
EOF
  say "    تم إنشاء .env"
else
  warn "    .env موجود — لم يُعدّل."
fi

say "==> 5/5 فحص الاتصال ثم التشغيل…"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true
node diag.js || warn "⚠️ فشل فحص الاتصال — أكمل على أي حال (سيظهر السبب داخل البوت)."

exec node index.js
