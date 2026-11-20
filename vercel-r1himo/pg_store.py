"""PostgreSQL storage adapter for R1HIMO. Not a complete serverless deployment.

Requires a dedicated PostgreSQL database. Does not affect the local SQLite bot.
"""
import re
import threading
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row
import rabot


def _sql(statement):
    # All placeholders in the bot's SQL are positional and never occur in literals.
    s = statement.replace('?', '%s')
    s = re.sub(r'\brow\b', '"row"', s, flags=re.I)
    # SQLite scalar MAX; this is not PostgreSQL's aggregate MAX.
    s = s.replace('MAX(0, ROUND(', 'GREATEST(0, ROUND(')
    return s


def _args(args):
    # PostgreSQL's round(numeric, integer) does not support double precision.
    return tuple(Decimal(str(x)) if isinstance(x, float) else x for x in args)


def _row(row):
    if row is None:
        return None
    return {key: float(value) if isinstance(value, Decimal) else value
            for key, value in row.items()}


class _Cursor:
    def __init__(self, cursor, lastrowid=None):
        self.cursor = cursor
        self.lastrowid = lastrowid
        self.rowcount = cursor.rowcount
    def fetchone(self):
        return _row(self.cursor.fetchone())
    def fetchall(self):
        return [_row(row) for row in self.cursor.fetchall()]


class _Connection:
    def __init__(self, connection):
        self.connection = connection
    def execute(self, statement, args=()):
        sql = _sql(statement)
        # The bot uses generated ids for all INSERTs except settings.
        insert_id = bool(re.match(r'\s*INSERT\s+INTO\s+(?!settings\b)', statement, re.I))
        if insert_id:
            sql += ' RETURNING id'
        cur = self.connection.execute(sql, _args(args))
        lastrowid = cur.fetchone()['id'] if insert_id else None
        return _Cursor(cur, lastrowid)
    def executemany(self, statement, args):
        with self.connection.cursor() as cur:
            cur.executemany(_sql(statement), [_args(a) for a in args])
    def commit(self):
        self.connection.commit()
    def rollback(self):
        self.connection.rollback()


class PostgresStore(rabot.Store):
    def __init__(self, url):
        self.path = 'postgresql'
        self.lock = threading.RLock()
        raw = psycopg.connect(url, row_factory=dict_row, connect_timeout=10)
        self.conn = _Connection(raw)
        schema = rabot.SCHEMA.replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'BIGSERIAL PRIMARY KEY')
        schema = re.sub(r'\bINTEGER\b', 'BIGINT', schema)
        schema = re.sub(r'\bREAL\b', 'NUMERIC', schema)
        schema = re.sub(r'\brow\b', '"row"', schema, flags=re.I)
        try:
            raw.execute('SELECT pg_advisory_xact_lock(1380534594)')
            raw.execute(schema)
            raw.commit()
            self._settings = {}
            self._load_settings()
            # Serialize seed/initialisation across cold starts.
            raw.execute('SELECT pg_advisory_lock(1380534594)')
            raw.commit()
            try:
                self._load_settings()
                self._seed()
            finally:
                raw.execute('SELECT pg_advisory_unlock(1380534594)')
                raw.commit()
        except Exception:
            raw.close()
            raise

    def take_stock(self, product_id, order_id):
        # PostgreSQL evaluates a subquery before waiting on a contested row.
        # FOR UPDATE SKIP LOCKED ensures two orders never claim the same item.
        with self.lock:
            try:
                cur = self.conn.connection.execute(
                    'UPDATE stock_items SET used=1, order_id=%s '
                    'WHERE id=(SELECT id FROM stock_items WHERE product_id=%s AND used=0 '
                    'ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING content',
                    (order_id, product_id))
                row = cur.fetchone()
                self.conn.commit()
                return row['content'] if row else None
            except Exception:
                self.conn.rollback()
                raise

    def close(self):
        self.conn.connection.close()
