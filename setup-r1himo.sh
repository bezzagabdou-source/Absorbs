#!/usr/bin/env bash
# =====================================================================
#  R1HIMO SHOP — مُثبِّت تلقائي (Termux / Linux VPS / أي جهاز فيه bash)
#
#  الاستخدام:
#      bash setupr.sh
#
#  يقوم بـ: تنزيل rabot.py، سؤالك عن معرّفك، تشغيل البوت، وطباعة
#           رابط لوحة التحكم وكلمة مرورها.
# =====================================================================
set -u

GREEN='\033[0;32m'; RED='\033[0;31m'; YEL='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { printf "${GREEN}✅ %s${NC}\n" "$*"; }
err()  { printf "${RED}❌ %s${NC}\n" "$*"; }
warn() { printf "${YEL}⚠️  %s${NC}\n" "$*"; }
info() { printf "${CYAN}➜  %s${NC}\n" "$*"; }

REPO_RAW="https://raw.githubusercontent.com/bezzagabdou-source/Absorbs/arena/6a950223-absorbs"
CODE_URL="$REPO_RAW/rabot.py"
ARCHIVE_URL="https://codeload.github.com/bezzagabdou-source/Absorbs/tar.gz/refs/heads/arena/6a950223-absorbs"
DIR="$HOME/rabot"

printf "\n"
printf "==================================================\n"
printf "   R1HIMO SHOP  —  تثبيت تلقائي\n"
printf "==================================================\n\n"

# ---------- 1. python ----------
PY=""
for cand in python3 python; do
    if command -v "$cand" >/dev/null 2>&1; then
        if "$cand" -c 'import sys; sys.exit(0 if sys.version_info>=(3,8) else 1)' 2>/dev/null; then
            PY="$cand"; break
        fi
    fi
done

if [ -z "$PY" ]; then
    warn "بايثون غير مثبّت. سأحاول تثبيته..."
    if command -v pkg >/dev/null 2>&1; then          # Termux
        pkg update -y >/dev/null 2>&1 && pkg install -y python >/dev/null 2>&1
    elif command -v apt-get >/dev/null 2>&1; then    # Debian/Ubuntu
        (sudo apt-get update -y && sudo apt-get install -y python3) >/dev/null 2>&1 \
          || apt-get update -y >/dev/null 2>&1 && apt-get install -y python3 >/dev/null 2>&1
    elif command -v dnf >/dev/null 2>&1; then
        (sudo dnf install -y python3) >/dev/null 2>&1
    elif command -v apk >/dev/null 2>&1; then
        apk add --no-cache python3 >/dev/null 2>&1
    fi
    command -v python3 >/dev/null 2>&1 && PY="python3"
fi

if [ -z "$PY" ]; then
    err "لم أستطع تثبيت بايثون تلقائياً."
    echo "   Termux:   pkg install python"
    echo "   Ubuntu:   sudo apt install python3"
    exit 1
fi
ok "بايثون: $($PY --version 2>&1)"

# ---------- 2. download ----------
mkdir -p "$DIR" && cd "$DIR" || exit 1

fetch() {  # $1=url  $2=outfile
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL --retry 3 --connect-timeout 20 "$1" -o "$2"
    elif command -v wget >/dev/null 2>&1; then
        wget -q -O "$2" --tries=3 "$1"
    else
        "$PY" - "$1" "$2" <<'PYEOF'
import sys, urllib.request
url, out = sys.argv[1], sys.argv[2]
req = urllib.request.Request(url, headers={"User-Agent": "rabot-setup"})
with urllib.request.urlopen(req, timeout=60) as r, open(out, "wb") as f:
    f.write(r.read())
PYEOF
    fi
}

info "تنزيل rabot.py ..."
if fetch "$CODE_URL" rabot.py && [ -s rabot.py ] && \
   "$PY" -c "import ast,sys; ast.parse(open('rabot.py',encoding='utf-8').read())" 2>/dev/null; then
    ok "تم تنزيل rabot.py ($(wc -c < rabot.py) بايت)"
else
    warn "الرابط المباشر فشل، أجرّب الأرشيف..."
    rm -f kit.tar.gz
    if fetch "$ARCHIVE_URL" kit.tar.gz && tar -xzf kit.tar.gz 2>/dev/null; then
        FOUND=$(find . -maxdepth 2 -name rabot.py -type f | head -1)
        if [ -n "$FOUND" ]; then cp "$FOUND" ./rabot.py; ok "تم التثبيت من الأرشيف"; fi
        # نظّف المخلّفات: الأرشيف (30MB) والمجلد المستخرَج بالكامل
        rm -f kit.tar.gz
        find . -maxdepth 1 -type d -name 'Absorbs-*' -exec rm -rf {} + 2>/dev/null
    fi
fi

if [ ! -s rabot.py ]; then
    err "فشل التنزيل. تحقّق من الإنترنت ثم أعد المحاولة."
    exit 1
fi

# ---------- 3. settings ----------
echo
info "الآن سأجمع إعداداتك (اضغط Enter للقيم الافتراضية)"

if [ -f .env ] && grep -q "BOT_TOKEN=..*" .env 2>/dev/null; then
    warn "يوجد ملف .env سابق — سيتم تحديثه."
fi

# --- OWNER_ID (رقم فقط) ---
OWNER_ID=""
for _ in 1 2 3; do
    printf "👉 معرّفك الرقمي في تيليغرام (من @userinfobot، أرقام فقط): "
    read -r OWNER_ID || OWNER_ID=""
    OWNER_ID=$(printf "%s" "$OWNER_ID" | tr -cd '0-9')
    [ -n "$OWNER_ID" ] && break
    warn "يجب أن يكون أرقاماً فقط."
done
if [ -z "$OWNER_ID" ]; then
    err "بدون معرّف المالك لن يظهر زر لوحة التحكم. توقف."
    exit 1
fi

# --- BOT_TOKEN ---
EXISTING_TOKEN=""
[ -f .env ] && EXISTING_TOKEN=$(grep -E '^BOT_TOKEN=' .env 2>/dev/null | head -1 | cut -d= -f2-)
printf "👉 توكن البوت [Enter للإبقاء على الحالي]: "
read -r BOT_TOKEN || BOT_TOKEN=""
[ -z "$BOT_TOKEN" ] && BOT_TOKEN="$EXISTING_TOKEN"
if [ -z "$BOT_TOKEN" ]; then
    printf "👉 الصق توكن البوت من @BotFather: "
    read -r BOT_TOKEN || BOT_TOKEN=""
fi
if ! printf "%s" "$BOT_TOKEN" | grep -qE '^[0-9]{6,}:[A-Za-z0-9_-]{30,}$'; then
    err "صيغة التوكن غير صحيحة. يجب أن يشبه: 123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    exit 1
fi

# --- PANEL_PASSWORD ---
EXISTING_PASS=""
[ -f .env ] && EXISTING_PASS=$(grep -E '^PANEL_PASSWORD=' .env 2>/dev/null | head -1 | cut -d= -f2-)
if [ -n "$EXISTING_PASS" ]; then
    PANEL_PASSWORD="$EXISTING_PASS"
    ok "استخدمت كلمة المرور المحفوظة سابقاً."
else
    PANEL_PASSWORD=$("$PY" -c "import secrets,string;a=string.ascii_letters+string.digits;print(''.join(secrets.choice(a) for _ in range(14)))")
    ok "تم توليد كلمة مرور قوية: $PANEL_PASSWORD"
fi

PORT="${PORT:-8080}"

cat > .env <<ENVEOF
# ==== R1HIMO SHOP — لا تشارك هذا الملف مع أي أحد ====
BOT_TOKEN=$BOT_TOKEN
OWNER_ID=$OWNER_ID
PANEL_PASSWORD=$PANEL_PASSWORD
PORT=$PORT
HOST=0.0.0.0
DB_PATH=$DIR/rabot_data/rabot.db
ENVEOF
chmod 600 .env
ok "تم حفظ الإعدادات في $DIR/.env"

# ---------- 4. run ----------
echo
IP=$("$PY" - <<'PYEOF'
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(("8.8.8.8", 80)); print(s.getsockname()[0])
except Exception:
    print("127.0.0.1")
finally:
    s.close()
PYEOF
)

cat > run.sh <<RUNEOF
#!/usr/bin/env bash
cd "$DIR" || exit 1
set -a; . "$DIR/.env"; set +a
exec "$PY" "$DIR/rabot.py"
RUNEOF
chmod +x run.sh

cat > keepalive.sh <<'KAEOF'
#!/usr/bin/env bash
# إبقاء البوت يعمل (للهاتف/الجهاز الذي يُغلق الشاشة)
cd "$(dirname "$0")" || exit 1
while true; do
    ./run.sh
    echo "[keepalive] توقّف البوت — إعادة التشغيل بعد 5 ثوان..."
    sleep 5
done
KAEOF
chmod +x keepalive.sh

# Termux: منع النظام من إيقاف البوت عند قفل الشاشة
if command -v termux-wake-lock >/dev/null 2>&1; then
    termux-wake-lock 2>/dev/null && ok "تم تفعيل wake-lock (البوت يبقى يعمل)"
fi

printf "\n"
printf "==================================================\n"
printf "  جاهز! معلوماتك:\n"
printf "==================================================\n"
printf "  📁 المجلد      : %s\n" "$DIR"
printf "  🌐 لوحة التحكم : http://%s:%s/panel\n" "$IP" "$PORT"
printf "  🔑 كلمة المرور : %s\n" "$PANEL_PASSWORD"
printf "  🤖 البوت       : افتح تيليغرام ← بوتك ← /start\n"
printf "==================================================\n\n"

info "تشغيل البوت الآن... (اضغط Ctrl+C للإيقاف)"
echo
sleep 2
exec "$PY" "$DIR/rabot.py"
