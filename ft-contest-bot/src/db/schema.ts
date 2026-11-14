/**
 * 🗄️ طبقة قاعدة البيانات: مخطط واضح + فهارس + ترحيلات (migrations) + أمان المعاملات.
 *
 * نفس القاعدة يستعملها البوت واللوحة (اللوحة عبر واجهات البوت)، لذلك:
 *  • المخطط كامل هنا في مكان واحد مع `ensureSchema()` idempotent.
 *  • كل تعديل بنيوي كيتسجّل في جدول `ft_migrations` باش ما يتنفّذش مرتين
 *    وتقدر تعرف من اللوحة شنو تدار.
 *  • الفهارس مغطّية على الحقول اللي كنسألو بيها بزاف (k + id، m، time).
 */

export type Migration = { id: string; sql: string; note: string };

/** ترحيلات مرتبة — كل واحدة كتتنفّذ مرة واحدة فقط (idempotent حتى لو تعاودت) */
export const MIGRATIONS: Migration[] = [
  {
    id: "0001_core_tables",
    note: "الجداول الأساسية للمخزن (kv / set / zset / list)",
    sql: `
      create table if not exists ft_kv (
        k text primary key,
        v jsonb,
        n bigint not null default 0
      );
      create table if not exists ft_set (
        k text not null,
        m text not null,
        primary key (k, m)
      );
      create table if not exists ft_zset (
        k text not null,
        m text not null,
        score double precision not null default 0,
        primary key (k, m)
      );
      create table if not exists ft_list (
        id bigserial primary key,
        k text not null,
        v text not null
      );
    `,
  },
  {
    id: "0002_indices",
    note: "فهارس على الحقول المستعملة بكثرة (قراءة القوائم، الترتيب، الحذف بالمفتاح)",
    sql: `
      create index if not exists ft_list_k_idx on ft_list (k, id);
      create index if not exists ft_list_k_id_desc on ft_list (k, id desc);
      create index if not exists ft_set_m_idx on ft_set (m);
      create index if not exists ft_zset_k_score_idx on ft_zset (k, score desc, m);
      create index if not exists ft_zset_m_idx on ft_zset (m);
    `,
  },
  {
    id: "0003_migrations_table",
    note: "جدول تتبّع الترحيلات",
    sql: `
      create table if not exists ft_migrations (
        id text primary key,
        note text not null default '',
        applied_at timestamptz not null default now()
      );
    `,
  },
  {
    id: "0004_ledger",
    note: "دفتر عمليات مالي (نقاط/إحالات/متجر) لتدقيق أي خصم أو إيداع",
    sql: `
      create table if not exists ft_ledger (
        id bigserial primary key,
        at timestamptz not null default now(),
        kind text not null,
        user_id text not null,
        delta bigint not null,
        balance bigint,
        ref text not null default '',
        meta jsonb
      );
      create index if not exists ft_ledger_user_idx on ft_ledger (user_id, at desc);
      create index if not exists ft_ledger_kind_idx on ft_ledger (kind, at desc);
    `,
  },
  {
    id: "0005_agent_versions",
    note: "نسخ مفاتيح البيانات (أداة الوكيل db_update + زر التراجع)",
    sql: `
      create table if not exists ft_agent_versions (
        id text primary key,
        snapshot text not null,
        undone boolean not null default false,
        created_at timestamptz not null default now()
      );
      create index if not exists ft_agent_versions_created_idx on ft_agent_versions (created_at desc);
    `,
  },
  {
    id: "0006_webhook_updates",
    note: "منع تكرار تحديثات تيليغرام (idempotency) — نفس update_id ما يتعالجش مرتين",
    sql: `
      create table if not exists ft_update_seen (
        update_id bigint primary key,
        seen_at timestamptz not null default now()
      );
      create index if not exists ft_update_seen_at_idx on ft_update_seen (seen_at desc);
    `,
  },
];

export const SCHEMA_SQL = MIGRATIONS.map((m) => m.sql).join("\n");
