# اختبارات الصمود (عطل القاعدة + الدمج)

```bash
npm i --no-save tsx @electric-sql/pglite @electric-sql/pglite-socket
python3 -m venv /tmp/fr && /tmp/fr/bin/pip install fakeredis
FAKEREDIS_PY=/tmp/fr/bin/python npx tsx test/resilience/outage.e2e.ts   # عطل Postgres + سجلّ Redis + إعادة آمنة
npx tsx test/resilience/import.e2e.ts                                   # دمج قاعدة قديمة في جديدة بلا عدّ مزدوج
```
