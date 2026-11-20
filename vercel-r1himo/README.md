# R1HIMO على Vercel — نسخة قيد الاختبار

نسخة معدّلة من البوت الأصلي لاستقبال تحديثات Telegram عبر webhook وتخزين بياناته في PostgreSQL. يلزم مشروع Vercel مرتبط بقاعدة Neon مخصّصة ومتغيرات `BOT_TOKEN` و`OWNER_ID` و`PANEL_PASSWORD` و`DATABASE_URL_UNPOOLED` في بيئة Production. رابط قاعدة البيانات والتوكن أسرار ولا يوضعان في السورس.

## الاختبارات المحلية

```sh
python3 -m venv /tmp/r1himo-pg-test
/tmp/r1himo-pg-test/bin/pip install 'psycopg[binary]' pgserver
/tmp/r1himo-pg-test/bin/python vercel-r1himo/test_pg_store.py
/tmp/r1himo-pg-test/bin/python vercel-r1himo/test_webhook.py
```

الاختبارات تستخدم PostgreSQL مؤقتاً وواجهة Telegram وهمية، ولا تثبت نجاح اتصال Telegram أو Neon في Vercel.

## النشر والتفعيل

يجب ضبط Root Directory للمشروع إلى `vercel-r1himo` ونشر الفرع الحالي مع متغيرات Production. يجب أن يكون رابط الإنتاج متاحاً لـTelegram دون Vercel Authentication، وأن يظهر `VERCEL_PROJECT_PRODUCTION_URL`. بعد نجاح النشر، يدخل المالك إلى اللوحة ويضغط **تفعيل البوت على تيليغرام**؛ هذا يستبدل webhook السابق للتوكن. لا تشغّل long polling آخر لنفس البوت.

## قيود مهمة

- تُسجّل أرقام تحديثات Telegram قبل معالجتها لمنع التكرار والخصم المزدوج. إذا توقفت الدالة أثناء المعالجة فقد تضيع استجابة ذلك التحديث ولا يعاد تنفيذه تلقائياً.
- يُسلسل المهايئ الطلبات عبر قفل جلسة PostgreSQL؛ يجب استخدام اتصال مباشر غير مجمّع، مثل `DATABASE_URL_UNPOOLED`. الإرسال الجماعي الكبير قد يتجاوز مهلة الدالة.
- لم يُختبر النشر ولا webhook الحقيقي ولا صلاحية التوكن من بيئة Vercel حتى الآن؛ اختبر البيع والإيداع بلا أموال حقيقية قبل استخدامه تجارياً.
