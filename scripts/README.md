# Production DB dump script

Dump Railway **production** MySQL to `sql/prod-backup.sql`. Each successful run **replaces** the previous backup. Incomplete dumps are discarded so a good file is not overwritten.

Dump files under `sql/*.sql` are gitignored (real production data).

## Prerequisites

- `mysqldump` and `mysql` installed locally
- Railway production MySQL with **public TCP proxy** enabled  
  (host like `*.proxy.rlwy.net`, not `*.railway.internal`)

## Setup (once)

```bash
cd /path/to/dialer

cp .env.db-dump.example .env.db-dump
```

Edit `.env.db-dump` with production values from Railway → **production** → MySQL → **Variables**:

| Variable | Railway source |
|----------|----------------|
| `PROD_MYSQL_HOST` | Public host (TCP Proxy) |
| `PROD_MYSQL_PORT` | Public port (TCP Proxy) |
| `PROD_MYSQL_USER` | `MYSQLUSER` |
| `PROD_MYSQL_PASSWORD` | `MYSQLPASSWORD` |
| `PROD_MYSQL_DATABASE` | `MYSQLDATABASE` |

`.env.db-dump` is gitignored — do not commit it.

## Run the dump

```bash
./scripts/dump-prod-db.sh
```

On success you should see:

```text
OK: wrote .../sql/prod-backup.sql (... ) — previous backup replaced.
```

Output file: [`sql/prod-backup.sql`](../sql/prod-backup.sql)

## Restore into local Docker MySQL (optional)

Local DB from `docker-compose.yml`: `127.0.0.1:3307`, user `root`, password `password`, database `dialer_db`.

**This overwrites local `dialer_db`.**

```bash
# ensure local MySQL is up
docker compose up -d db

mysql -h 127.0.0.1 -P 3307 -u root -ppassword \
  -e "DROP DATABASE IF EXISTS dialer_db; CREATE DATABASE dialer_db;"

mysql -h 127.0.0.1 -P 3307 -u root -ppassword dialer_db < sql/prod-backup.sql

mysql -h 127.0.0.1 -P 3307 -u root -ppassword dialer_db \
  -e "SHOW TABLES; SELECT COUNT(*) AS users FROM Users;"
```

If the host `mysql` client is missing:

```bash
docker compose exec -T db mysql -uroot -ppassword \
  -e "DROP DATABASE IF EXISTS dialer_db; CREATE DATABASE dialer_db;"

docker compose exec -T db mysql -uroot -ppassword dialer_db < sql/prod-backup.sql
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Access denied for user 'root'@'...'` | Wrong password in `.env.db-dump` (not still `your-password-here`) |
| Connection timeout / can't connect | Use public TCP proxy host/port, not `mysql.railway.internal` |
| `dump looks incomplete` / missing `Users` | Dump was cut off; re-run and wait until the command finishes |
| `Using a password on the command line can be insecure` | Harmless warning from `mysqldump` |

## Notes

- Do not push `sql/prod-backup.sql` or `.env.db-dump` to git.
- Prefer local / staging secrets for Twilio and JWT when testing against a prod data copy.
