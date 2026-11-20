"""Integration tests against a disposable local PostgreSQL via pgserver.

Run: python -m pip install 'psycopg[binary]' pgserver
     python vercel-r1himo/test_pg_store.py
"""
import logging
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault('OWNER_ID', '6818164226')
from pgserver import PostgresServer
from pg_store import PostgresStore

logging.disable(logging.CRITICAL)


class PostgreSQLTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = PostgresServer(Path(tempfile.mkdtemp()) / 'pg')
        cls.url = cls.server.get_uri()
        cls.store = PostgresStore(cls.url)

    @classmethod
    def tearDownClass(cls):
        cls.store.close()
        cls.server.cleanup()

    def test_01_defaults_and_big_telegram_id(self):
        self.assertEqual(len(self.store.buttons()), 7)
        self.assertEqual(len(self.store.products()), 12)
        user = self.store.get_or_create_user({'id': 6818164226, 'first_name': 'Owner'})
        self.assertEqual(user['tg_id'], 6818164226)
        self.assertEqual(user['is_admin'], 1)

    def test_02_wallet_amounts(self):
        self.store.adjust_balance(6818164226, 10.25)
        self.assertTrue(self.store.debit_balance(6818164226, 0.05))
        self.assertAlmostEqual(self.store.get_user(6818164226)['balance'], 10.20)
        self.assertFalse(self.store.debit_balance(6818164226, 20))

    def test_03_competing_stock_claims(self):
        pid = self.store.add_product({'name': 'Concurrency test', 'price': 1})
        self.store.add_stock_lines(pid, ['one-secret'])
        barrier = threading.Barrier(2)
        result = []
        def claim(order):
            store = PostgresStore(self.url)
            try:
                barrier.wait(timeout=10)
                result.append(store.take_stock(pid, order))
            finally:
                store.close()
        threads = [threading.Thread(target=claim, args=(order,)) for order in (1, 2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
        self.assertEqual(sorted(result, key=lambda item: item is None), ['one-secret', None])
        self.assertEqual(self.store.product_stock(pid), 0)

    def test_04_persistence(self):
        self.store.set_setting('test_persistence', 'saved')
        other = PostgresStore(self.url)
        try:
            self.assertEqual(other.get_setting('test_persistence'), 'saved')
            self.assertAlmostEqual(other.get_user(6818164226)['balance'], 10.20)
        finally:
            other.close()


if __name__ == '__main__':
    unittest.main()
