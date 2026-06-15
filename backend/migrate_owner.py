"""一次性迁移：给 knowledge_bases 表加 owner_id 列。"""
import sqlite3

conn = sqlite3.connect("data/rag.db")
cur = conn.cursor()

cur.execute("PRAGMA table_info(knowledge_bases)")
cols = [r[1] for r in cur.fetchall()]
print("current cols:", cols)

if "owner_id" not in cols:
    cur.execute("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1")
    row = cur.fetchone()
    if row is None:
        raise SystemExit("no admin user, start app once first to seed admin")
    admin_id = row[0]
    print("default owner_id =", admin_id)

    cur.execute(
        "ALTER TABLE knowledge_bases "
        "ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE"
    )
    cur.execute(
        "UPDATE knowledge_bases SET owner_id=? WHERE owner_id IS NULL", (admin_id,)
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS ix_knowledge_bases_owner_id "
        "ON knowledge_bases(owner_id)"
    )
    conn.commit()
    print("added owner_id and backfilled with admin", admin_id)
else:
    print("owner_id already exists")

cur.execute("SELECT id,name,owner_id FROM knowledge_bases")
print("KBs:", cur.fetchall())
conn.close()
