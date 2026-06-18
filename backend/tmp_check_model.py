import sqlite3, json
conn = sqlite3.connect('data/rag.db')
cur = conn.cursor()
cur.execute('SELECT id, name, config_json FROM apps ORDER BY id')
for r in cur.fetchall():
    cfg = json.loads(r[2]) if r[2] else {}
    print('App %d: %s => model=%s, provider=%s' % (r[0], r[1], cfg.get('model'), cfg.get('provider')))
cur.execute('SELECT id, title FROM conversations ORDER BY id DESC LIMIT 5')
for r in cur.fetchall():
    print('Conv %d: %s' % r)
conn.close()
