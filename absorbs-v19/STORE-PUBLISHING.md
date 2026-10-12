# نشر Nexus AI على Google Play و Uptodown

التطبيق PWA جاهز (manifest + service worker + أيقونات 192/512/maskable + privacy.html).
المتجران يطلبان ملف Android (AAB لـ Google Play، APK لـ Uptodown). الطريقة المجانية: **PWABuilder**.

## 1) تحضير الموقع
- انشر المشروع على Vercel بدومين ثابت (HTTPS).
- تأكد أن `https://دومينك/manifest.webmanifest` و `https://دومينك/privacy.html` يفتحان.

## 2) توليد الملف
1. ادخل https://www.pwabuilder.com وضع رابط موقعك ← Package for stores ← Android.
2. Package ID مقترح: `com.nexusai.dz`. فعّل Notifications delegation إن ظهر.
3. حمّل الملف: يحتوي `.aab` (Google Play) و `.apk` (Uptodown) وملف التوقيع `signing.keystore`. **احتفظ بنسخة من الـ keystore وكلمة السر، بدونه لا يمكن تحديث التطبيق أبدًا.**

## 3) ربط الدومين بالتطبيق (يخفي شريط المتصفح)
- افتح `signing-key-info.txt` وخذ SHA-256 fingerprint.
- ضعه في `public/.well-known/assetlinks.json` (بدل PUT:YOUR:SHA256…) ثم أعد النشر.
- إذا فعّلت Play App Signing، أضف أيضًا بصمة Google من Play Console ← App integrity.

## 4) Google Play
- حساب مطوّر (25$ مرة واحدة). Create app ← ارفع `.aab` في Production.
- Privacy policy URL: `https://دومينك/privacy.html`
- Data safety: البريد (تسجيل الدخول)، المحادثات، رقم الجهاز للإشعارات. Content rating: للجميع/+12.
- لقطات شاشة (2 على الأقل) + أيقونة 512 + صورة ميزة 1024×500.
- التطبيق الجديد قد يتطلب اختبارًا مغلقًا (12 مختبرًا لمدة 14 يومًا) إذا الحساب شخصي.

## 5) Uptodown
- https://developers.uptodown.com ← أنشئ حساب مطوّر ← ارفع `.apk` + وصف + لقطات.
- لا يحتاج رسومًا، والمراجعة أسرع.

## 6) الإشعارات كل ساعة
1. `node scripts/gen-vapid.mjs` وأضف المتغيرات الأربعة في Vercel (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET) ثم Redeploy.
2. في https://cron-job.org (مجاني) أنشئ مهمة **كل ساعة** تفتح:
   `https://دومينك/api/push/cron?key=CRON_SECRET`
3. المستخدم يفعّلها من الشريط الذي يظهر بعد 25 ثانية أو من الإعدادات ← الإشعارات.
(Vercel Hobby يسمح بـ cron يوميًا فقط، لذلك استعملنا cron-job.org.)
