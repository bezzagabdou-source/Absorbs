# DZ Exchange — نسخة 1.1 (APK + نشر Uptodown)

**رابط التحميل المباشر:** https://marketplace-fixed.vercel.app/download/apk
**صفحة التحميل:** https://marketplace-fixed.vercel.app/app
**سياسة الخصوصية (رابط منفصل):** https://marketplace-fixed.vercel.app/privacy
**حذف الحساب:** https://marketplace-fixed.vercel.app/account-deletion
**شروط الاستخدام:** https://marketplace-fixed.vercel.app/terms

| | |
|---|---|
| الإصدار | 1.1 (versionCode 2) |
| الحزمة | `app.dzexchange.marketplace` |
| الحجم | 71 677 بايت (≈ 70 Ko) |
| SHA-256 | `5d03ae5032f9ab7d4ff9d6bc032d2599ef8e1073dc1da0821d9e5c01f90c8381` |
| أندرويد | 6.0 (API 23) وأحدث · targetSdk 35 |
| الأذونات | INTERNET + ACCESS_NETWORK_STATE فقط |
| التوقيع | v1 + v2 + v3 ✓ |
| بصمة الشهادة SHA-256 | `75:13:04:18:A6:D7:69:BC:D2:57:B8:CB:78:95:EC:62:8C:48:A4:E9:B7:A6:25:C4:92:45:11:D6:D4:77:3F:70` |

---

## 1. مفتاح التوقيع — احتفظ به الآن

الملفان التاليان هما مفتاح التوقيع الدائم. **بدونهما لا يمكن تحديث التطبيق مستقبلًا.**

- `android/release.keystore` (نسخة احتياطية: `~/DZ-Exchange-release.keystore`)
- `android/signing.properties` (كلمة السر + الاسم المستعار `dzexchange`) — نسخة: `~/DZ-Exchange-signing.properties`

⚠️ هذان الملفان غير مرفوعين إلى GitHub (مستبعدان في `.gitignore`). احفظهما في مكان آمن خارج الجهاز.

> ملاحظة: هذه النسخة موقّعة بمفتاح جديد. من ثبّت 1.0 يجب أن يحذف التطبيق القديم قبل تثبيت 1.1.

## 2. نشر Uptodown

1. **التسجيل:** https://uptodown.com/developer — حساب مطوّر (مجاني).
2. **إضافة تطبيق:** لوحة المطوّر ← «Upload app».
3. **الملف:** نزّل `https://marketplace-fixed.vercel.app/download/apk` وارفع نفس الملف.
4. **بيانات الفتحة (انسخ كما هي):**

   - **Name:** DZ Exchange — سوق الجزائر
   - **Package:** `app.dzexchange.marketplace`
   - **Version:** 1.1
   - **Category:** Shopping
   - **License:** Free
   - **Platform:** Android
   - **Min Android:** 6.0
   - **Size:** 70 KB
   - **Developer:** DZ Exchange
   - **Email:** support@dzexchange.app
   - **Website:** https://marketplace-fixed.vercel.app
   - **Privacy policy:** https://marketplace-fixed.vercel.app/privacy
   - **Short description (EN):** Buy and sell second-hand goods across all 58 Algerian wilayas, with a built-in AI assistant and Google sign-in.
   - **Short description (FR):** Achetez et vendez d’occasion dans les 58 wilayas algériennes, avec assistant IA et connexion Google.
   - **Short description (AR):** اشترِ وبِع المستعمل في 58 ولاية جزائرية، مع مساعد ذكي وتسجيل دخول عبر Google.

5. **الأيقونة:** `marketplace/public/store/icon-512.png` (512×512) أو `icon-1024.png` (1024×1024).
6. **الصور (1080×1920):** `marketplace/public/store/screenshots/` — خمس لقطات: `s1-home.png`, `s2-explore.png`, `s3-product.png`, `s4-ai.png`, `s5-download.png`.
7. **الوصف الكامل:** استعمل نص «Full description» أدناه.

### Full description (EN)

```
DZ Exchange is a local Algerian marketplace for buying and selling second-hand
goods. Browse listings in all 58 wilayas, filter by price, condition and
category, then make an offer and chat with the seller inside the app.

• Publish a listing in under a minute, with up to 8 photos
• Send and receive offers; accept, reject or counter-offer
• Safe in-app messaging, no phone number required
• AI assistant that drafts your listing, suggests search keywords and gives
  practical anti-fraud advice — it keeps working even offline
• Sign in with Google or with an email and password
• French, Arabic and English interface
• Delete your account and all your data at any time

DZ Exchange never handles payments. Always inspect the item in a public place
before paying, and never share passwords, OTP codes or bank codes with anyone.
```

### الوصف الكامل (AR)

```
DZ Exchange سوق جزائري محلي لبيع وشراء المستعمل. تصفّح الإعلانات في 58 ولاية،
وصفِّ النتائج بالسعر والحالة والفئة، ثم أرسل عرضك وتواصل مع البائع داخل التطبيق.

• انشر إعلانك في أقل من دقيقة، مع حتى 8 صور
• أرسل واستقبل العروض؛ اقبل أو ارفض أو قدّم عرضًا مضادًا
• مراسلة آمنة داخل التطبيق دون كشف رقم هاتفك
• مساعد ذكي يكتب إعلانك ويقترح كلمات البحث ونصائح ضد الغش — يعمل حتى دون اتصال
• تسجيل الدخول بحساب Google أو بالبريد وكلمة المرور
• واجهة بالعربية والفرنسية والإنجليزية
• احذف حسابك وبياناتك في أي وقت

DZ Exchange لا يتعامل مع الدفع. عاين السلعة في مكان عام قبل الدفع، ولا تشارك
كلمات المرور أو رموز OTP أو الرموز البنكية مع أي شخص.
```

## 3. ما يجب أن يكون جاهزًا قبل النشر (تم ✓)

- [x] APK موقّع (v1+v2+v3) ويعمل على API 23+.
- [x] الأذونات مقلّصة إلى الإنترنت فقط (لا كاميرا، لا موقع، لا جهات اتصال).
- [x] سياسة خصوصية على رابط مستقل + صفحة حذف حساب.
- [x] شروط الاستخدام.
- [x] أيقونة 512 و1024 + 5 لقطات 1080×1920.
- [x] تسجيل الدخول عبر Google يعمل عبر Firebase.
- [x] المساعد الذكي يعمل دائمًا (مزوّد + بديل محلي).
- [x] 36 اختبارًا آليًا ناجحًا + بناء إنتاجي ناجح.
- [x] `https://marketplace-fixed.vercel.app/download/apk` يعيد الملف الصحيح ببصمة مطابقة.
- [x] `assetlinks.json` منشور للروابط العميقة.
- [x] صفحة ترخيص التطبيق + صفحة المكوّنات الخارجية (مطلوبتان في لوحة Uptodown).

## 3.1 إدارة ترخيص التطبيق في Uptodown — الإجابات الجاهزة

| الحقل | القيمة |
|---|---|
| نموذج التوزيع (Distribution Model) | **حر / Free** |
| المشتريات داخل التطبيق (IAP) | **لا** — لا يوجد أي دفع داخل التطبيق |
| الاشتراك (Subscription) | **لا** |
| الإعلانات (Ads) | **لا** |
| نوع الترخيص (License Type) | **ملكية / Proprietary** |
| رابط نص الترخيص (License Text URL) | `https://marketplace-fixed.vercel.app/license` |
| رابط الكود المصدري (Source Code URL) | **اتركه فارغًا** |
| رابط الإشعارات (Notice URL) | `https://marketplace-fixed.vercel.app/notices` |

**لماذا:** الترخيص ملكية خاصة، لكن الموقع يستعمل مكوّنات Apache 2.0
(Drizzle ORM، Firebase SDK، Dexie.js، sharp) والمادة 4(د) من Apache 2.0
تفرض إرفاق ملف NOTICE، ولهذا يُذكر رابط الإشعارات. تطبيق الأندرويد نفسه
مكتوب بلغة Java فقط فوق `android.jar` ولا يحزم أي مكتبة خارجية — لا AndroidX
ولا Kotlin ولا Play Services ولا خطوط — لذلك لا يحتاج إشعارات خاصة به.

## 4. ملاحظات تقنية

- **تسجيل Google داخل التطبيق:** Google ترفض OAuth داخل WebView، لذلك يفتح زر Google
  المتصفح ثم يعود التطبيق عبر `dzexchange://auth` بكود صالح 120 ثانية ولمرة واحدة فقط.
- **قاعدة البيانات:** هجرة `0002_app_handoff_codes` + سياسة RLS لجدول الأكواد.
- **iOS:** غير مشمول؛ التطبيق أندرويد فقط حاليًا.
