"""一次性迁移：创建 provider_configs 表 / 补 category 列。

新建 DB 时 init_db() 会自动建表；本脚本只为已存在的旧 DB 做增量。
"""
import sqlite3

conn = sqlite3.connect("data/rag.db")
cur = conn.cursor()

cur.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='provider_configs'"
)
exists = cur.fetchone() is not None
print("provider_configs exists?", exists)

if not exists:
    cur.execute(
        """
        CREATE TABLE provider_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(64) UNIQUE NOT NULL,
            label VARCHAR(128) DEFAULT '',
            category VARCHAR(32) DEFAULT 'model',
            source VARCHAR(16) DEFAULT 'builtin',
            module_path VARCHAR(256) DEFAULT '',
            installed BOOLEAN DEFAULT 0,
            is_active BOOLEAN DEFAULT 0,
            base_url VARCHAR(512) DEFAULT '',
            api_key VARCHAR(512) DEFAULT '',
            embedding_model VARCHAR(128) DEFAULT '',
            extra_json TEXT DEFAULT '{}',
            error TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cur.execute(
        "CREATE UNIQUE INDEX ix_provider_configs_name ON provider_configs(name)"
    )
    cur.execute(
        "CREATE INDEX ix_provider_configs_category ON provider_configs(category)"
    )
    conn.commit()
    print("provider_configs created")
else:
    # 增量：补 category 列
    cur.execute("PRAGMA table_info(provider_configs)")
    cols = {row[1] for row in cur.fetchall()}
    if "category" not in cols:
        cur.execute(
            "ALTER TABLE provider_configs ADD COLUMN category VARCHAR(32) DEFAULT 'model'"
        )
        cur.execute(
            "UPDATE provider_configs SET category='model' WHERE category IS NULL OR category=''"
        )
        # 索引可能不存在，try/except
        try:
            cur.execute(
                "CREATE INDEX ix_provider_configs_category ON provider_configs(category)"
            )
        except sqlite3.OperationalError:
            pass
        conn.commit()
        print("provider_configs.category added & backfilled")
    else:
        print("provider_configs.category already exists")

cur.execute("SELECT id,name,category,source,installed,is_active FROM provider_configs")
print("rows:", cur.fetchall())
conn.close()
