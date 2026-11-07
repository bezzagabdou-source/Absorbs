# OpenCode — التشغيل عبر GitHub Codespaces (أسرع طريقة)

الهدف: تشغيل سيرفر OpenCode على GitHub، وبعدها تدخل له من تطبيق **OpenCode Mobile**
بصيغة: `https://<codespace>-8080.app.github.dev`

---

## 1) أنشئ الـ Codespace (مرة واحدة)

1. افتح الريبو: https://github.com/bezzagabdou-source/Absorbs
2. اضغط الزر الأخضر **Code** ← تبويب **Codespaces** ← **Create codespace on main**
3. اختر الآلة **4-core / 8 GB** (كافية) وانتظر 1–2 دقيقة.
   ملفات `.devcontainer/` في هذا الريبو تثبّت OpenCode وتشغّل السيرفر تلقائيًا على المنفذ `8080`،
   والمفتاح الافتراضي: `nexus-opencode-change-me`

> إذا ظهرت رسالة أن Codespaces غير مفعّلة: لازم تفعّل **Codespaces** من إعدادات حسابك
> (GitHub Settings → Codespaces) — الحساب المجاني عنده ساعات شهرية مجانية.

---

## 2) اجعل المنفذ عامًا (Public) — خطوة مهمة

1. في الـ Codespace، في الأسفل جنب كلمة **Ports** اضغط على المنفذ **8080**
2. كليك يمين ← **Port Visibility** ← **Public**
3. انسخ الرابط، شكله:

```
https://<codespace-name>-8080.app.github.dev
```

---

## 3) اربط التطبيق

في تطبيق OpenCode Mobile:

| الخانة | القيمة |
|---|---|
| Server URL | `https://<codespace-name>-8080.app.github.dev` |
| Password | `nexus-opencode-change-me` |

اضغط **Connect**، وفعّل بعدها **Auto-connect on startup**.

> إذا التطبيق سألك عن username: اكتب `opencode` (أو أي اسم) — المصادقة هنا بالـ password فقط.

---

## 4) إذا احتجت إعادة التشغيل يدويًا

داخل طرفية الـ Codespace:

```bash
bash .devcontainer/start-opencode.sh          # يشغّل السيرفر من جديد
tail -f /tmp/opencode-server.log              # تشوف اللوغ
```

فحص سريع من داخل الـ Codespace:

```bash
curl -s http://127.0.0.1:8080/config | head -c 120
```

---

## 5) تغيير كلمة السر

في طرفية الـ Codespace:

```bash
export OPENCODE_SERVER_PASSWORD='كلمة-سر-قوية-عندك'
bash .devcontainer/start-opencode.sh
```

أو أضفها كـ **Codespaces secret** باسم `OPENCODE_SERVER_PASSWORD` من:
GitHub → Settings → Codespaces → Secrets، وبعدها أعد بناء الـ Codespace.

---

## ملاحظات

- الـ Codespace يتوقف تلقائيًا بعد 30 دقيقة خمول (Idle timeout). ترجع تشغّله من
  https://github.com/codespaces واضغط على اسمه — نفس الرابط يبقى صالح.
- لا تشارك الرابط ولا كلمة السر مع أحد: من يملكهم يملك طرفية كاملة على الكود.
- بديل محلي على حاسوبك: `npm i -g opencode-ai` ثم `opencode serve --hostname 0.0.0.0 --port 8080`
  واستعمل نفق مثل `cloudflared tunnel --url http://localhost:8080` لو احتجت دخول من خارج الشبكة.
