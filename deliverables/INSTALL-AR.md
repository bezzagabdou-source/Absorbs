# DZ Exchange — تطبيق أندرويد (نسخة release موقّعة)

## 1. التحميل المباشر

**الرابط الأساسي (GitHub Releases):**

```
https://github.com/bezzagabdou-source/Absorbs/releases/download/v1.0/DZ-Exchange.apk
```

**رابط بديل (نفس الملف حرفياً، على Vercel):**

```
https://marketplace-fixed.vercel.app/DZ-Exchange.apk
```

كلا الرابطين ينتهيان بـ `.apk` ويرسلان
`Content-Type: application/vnd.android.package-archive` مع
`Content-Disposition: attachment`، أي أن الهاتف يبدأ التنزيل فوراً بدون صفحة وسيطة.

- الحجم: **288,210 بايت** (≈ 281 كيلوبايت)
- SHA-256: `736aaf19d601f794a3084c04858a8bb509fdc4be52a21f76536646bb945b2a9e`

رموز QR موجودة في نفس المجلد:
`DZ-Exchange-download-QR.png` (الأساسي) و `DZ-Exchange-download-QR-vercel.png` (البديل).

## 2. خطوات التثبيت على الهاتف

> **مهم:** إذا كان لديك النسخة القديمة (`android-v3`) مثبّتة، **احذفها أولاً**.
> النسخة القديمة موقّعة بشهادة debug، والنسخة الجديدة موقّعة بشهادة release
> مختلفة، وأندرويد يرفض الترقية فوق توقيع مختلف
> (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`). بياناتك على الموقع لا تتأثر لأن
> الحساب محفوظ في السيرفر وليس في التطبيق.

1. احذف تطبيق **DZ Exchange** القديم إن وُجد (اضغط مطوّلاً على الأيقونة ← إلغاء التثبيت).
2. افتح أحد الرابطين أعلاه من متصفح الهاتف (Chrome)، أو امسح رمز QR.
3. سيظهر تحذير «قد يكون هذا النوع من الملفات ضاراً» — اختر **تنزيل / Download**.
4. افتح الملف من شريط الإشعارات أو من تطبيق «الملفات» ← «التنزيلات».
5. إذا ظهرت رسالة «التثبيت من مصادر غير معروفة غير مسموح»:
   - اضغط **الإعدادات** في نفس النافذة،
   - فعّل **السماح من هذا المصدر** (Allow from this source) للمتصفح أو لتطبيق الملفات الذي تستخدمه،
   - ارجع واضغط **تثبيت**.
   - على أندرويد 8 وأحدث الإذن يُمنح لكل تطبيق على حدة، لا يوجد إعداد عام.
6. بعد التثبيت اضغط **فتح**. ستظهر أيقونة DZ Exchange بخلفية `#0F766E`.
7. يُستحسن إعادة تعطيل «السماح من هذا المصدر» بعد الانتهاء.

**قد يظهر تحذير Play Protect** («تطبيق غير معروف») لأن التطبيق ليس منشوراً على
Google Play. اختر **التفاصيل ← التثبيت على أي حال**. هذا متوقع لأي APK
موزّع خارج المتجر.

## 3. ما تم التحقق منه فعلياً

| البند | النتيجة |
| --- | --- |
| نوع البناء | release، `android:debuggable` غير موجود إطلاقاً |
| التوقيع | v1 + v2 + v3 = true، مفتاح RSA 4096 خاص، صالح حتى 2056-10-29 |
| شهادة debug | غير مستخدمة |
| الحزمة / الإصدار | `app.dzexchange.marketplace` / 1.0 (versionCode 1) |
| SDK | minSdk 23، targetSdk 35 |
| الأذونات | `INTERNET` + `ACCESS_NETWORK_STATE` فقط |
| `allowBackup` / `usesCleartextTraffic` | false / false |
| مكتبات تتبّع أو إعلانات | لا شيء (0 dependencies) |
| الرابط الوحيد داخل الكود | `https://marketplace-fixed.vercel.app/` |
| التثبيت والتشغيل | نجح على محاكي API 30 و API 35، بدون أي crash |
| مطابقة الملفات المنشورة | GitHub و Vercel مطابقان بايت ببايت للملف الموقّع |

التقرير الكامل بالأوامر الحقيقية: `verification-report.txt`
(`apksigner verify --verbose --print-certs`, `aapt dump badging`,
`zipalign -c -v 4`, `curl -I`).

لقطة شاشة من محاكي أندرويد 15: `screenshot-android15.png`.

## 4. سلوك التطبيق

- يفتح `marketplace-fixed.vercel.app` فقط داخل التطبيق. أي رابط لموقع آخر
  (بما فيه النطاقات الفرعية والنطاقات المشابهة) يُفتح في متصفح النظام.
- JavaScript + DOM Storage + الكوكيز مفعّلة، لذلك يبقى تسجيل الدخول محفوظاً.
- رفع الصور من الهاتف يعمل عبر منتقي الملفات/الصور الخاص بأندرويد
  (`onShowFileChooser`) بدون الحاجة لأي إذن تخزين.
- زر الرجوع يرجع في تاريخ التصفح قبل أن يخرج من التطبيق، مع دعم
  predictive back على أندرويد 13+.
- المحتوى لا يختفي تحت شريط الحالة أو شريط التنقّل (edge-to-edge على أندرويد 15).
- عند انقطاع الإنترنت تظهر شاشة عربية «تعذّر الاتصال» مع زر إعادة المحاولة.

## 5. مفتاح التوقيع

المفتاح الخاص **ليس** في هذا المستودع ولا في أي منصة عامة. يُسلَّم لك بشكل
منفصل (ملف keystore + كلمة السر في رسالة/ملف مستقل). احتفظ به في مكان آمن:
بدونه لا يمكنك إصدار تحديث لنفس التطبيق على نفس الأجهزة.

لتوقيع نسخة مستقبلية بنفس المفتاح:

```bash
python3 android/tools/sign-release.py \
  --unsigned android/ci-output/app-release-unsigned.apk \
  --out      DZ-Exchange.apk \
  --keystore /path/to/dz-exchange-release.keystore \
  --alias    dz-exchange \
  --pass-file /path/to/keystore-password.txt \
  --apksigner /path/to/apksigner.jar
```
