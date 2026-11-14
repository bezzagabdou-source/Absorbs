# اختبارات Postgres (PGlite)

هاد الاختبارات كتشغّل **نفس SQL** اللي في `src/lib/store.ts` و`src/db/schema.ts`
على Postgres حقيقي (PGlite = Postgres مضمّن في WASM)، بلا ما تحتاج سيرفر ولا سحابة.

```bash
cd ft-contest-bot
npm i --no-save @electric-sql/pglite typescript
node test/pg/schema.pg.test.mjs   # المخطط + الترحيلات + rollback
node test/pg/store.pg.test.mjs    # get/set/incr/zset/list/lease
```

المسارات مطلقة داخل الملفات (`/home/user/Absorbs/...`)؛ بدّلها بمسار المستودع عند التشغيل من جهاز آخر.
