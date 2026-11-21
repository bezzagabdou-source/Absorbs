#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#  تجهيز relay على هاتف أندرويد (Termux) — سطر واحد وينتهي
#  الاستخدام:
#    pkg install -y nodejs-lts curl git   (مرة واحدة)
#    git clone https://github.com/bezzagabdou-source/Absorbs
#    cd Absorbs/djezzy-bot/relay
#    bash termux.sh
#  ثم انسخ القيمتين المطبوعتين (RELAY_TOKEN + DJEZZY_RELAY_URL)
#  وأرسلهما لإعداد البوت على Vercel.
# ============================================================
set -u
cd "$(dirname "$0")"

echo "== [1/4] تثبيت المتطلبات =="
pkg update -y >/dev/null 2>&1 || true
pkg install -y nodejs-lts curl >/dev/null 2>&1 || true
command -v node >/dev/null || { echo "❌ فشل تثبيت node — نفّذ: pkg install nodejs-lts"; exit 1; }

if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund >/dev/null 2>&1 || { echo "❌ فشل npm install"; exit 1; }
fi

if [ ! -f .relay-token ]; then
  node -e "process.stdout.write(require('crypto').randomBytes(24).toString('base64url'))" > .relay-token
fi
RELAY_TOKEN=$(cat .relay-token)
export RELAY_TOKEN

echo "== [2/4] تشغيل الـ relay (المنفذ 8787) =="
pkill -f "node server.js" 2>/dev/null || true
sleep 1
nohup node server.js > relay.log 2>&1 &
sleep 2
grep -q "djezzy-relay" relay.log && echo "   ✅ relay يعمل" || { echo "❌ relay لم يعمل — راجع relay.log"; exit 1; }

echo "== [3/4] تحميل نفق cloudflared (مجاني بلا حساب) =="
if [ ! -x ./cloudflared ]; then
  case "$(uname -m)" in
    aarch64) CF=arm64 ;;
    x86_64)  CF=amd64 ;;
    *)       CF=arm ;;
  esac
  curl -fsSL -o cloudflared "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$CF" \
    || { echo "❌ فشل تنزيل cloudflared"; exit 1; }
  chmod +x cloudflared
fi

echo "== [4/4] فتح النفق العام =="
pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 1
nohup ./cloudflared tunnel --url http://localhost:8787 > tunnel.log 2>&1 &
URL=""
for _ in $(seq 1 40); do
  URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" tunnel.log 2>/dev/null | head -1)
  [ -n "$URL" ] && break
  sleep 1
done

echo
echo "=========================================================="
if [ -n "$URL" ]; then
  echo "✅ كل شيء جاهز! انسخ هذين السطرين وأرسلهما لي:"
  echo
  echo "RELAY_TOKEN=$RELAY_TOKEN"
  echo "DJEZZY_RELAY_URL=$URL"
else
  echo "⚠️ النفق لم يفتح بعد — راجع tunnel.log ثم أعد تشغيل:"
  echo "   RELAY_TOKEN=$RELAY_TOKEN"
  echo "   cat tunnel.log"
fi
echo "=========================================================="
echo "ملاحظات:"
echo "• أبقِ تطبيق Termux مفتوحاً (أوقف تحسين البطارية له) طالما البوت يعمل."
echo "• رابط النفق يتغيّر عند كل إعادة تشغيل — أرسل لي الجديد وقتها."
echo "• لإعادة التشغيل لاحقاً: bash termux.sh"
