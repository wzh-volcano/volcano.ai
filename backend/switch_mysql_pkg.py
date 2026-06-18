"""Switch MySQL MCP plugin to @kevinwatt/mysql-mcp."""
import json
from pathlib import Path

plugin_dir = Path("data/plugins/mysql_mcp_server")

manifest = {
    "name": "mysql_mcp_server",
    "label": "MySQL MCP Server",
    "description": "通过 MCP 协议操作 MySQL 数据库。支持只读查询、写入操作、事务支持",
    "version": "0.1.3",
    "category": "mcp_server",
    "runtime": "npx",
    "package_id": "@kevinwatt/mysql-mcp",
    "env_vars_json": json.dumps({
        "MYSQL_HOST": {"required": True, "description": "MySQL 主机地址"},
        "MYSQL_PORT": {"required": False, "description": "MySQL 端口 (默认 3306)"},
        "MYSQL_USER": {"required": True, "description": "MySQL 用户名"},
        "MYSQL_PASSWORD": {"required": True, "secret": True, "description": "MySQL 密码"},
        "MYSQL_DATABASE": {"required": False, "description": "数据库名"},
    }),
}

(plugin_dir / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
)
print("Updated manifest.json")

# Update DB directly
import sqlite3
conn = sqlite3.connect("data/rag.db")
conn.execute(
    "UPDATE plugin_extensions SET package_id=?, version=?, env_vars_json=?, error=NULL, is_active=0 WHERE name=?",
    ("@kevinwatt/mysql-mcp", "0.1.3", manifest["env_vars_json"], "mysql_mcp_server")
)
conn.commit()
conn.close()
print("Updated DB")
