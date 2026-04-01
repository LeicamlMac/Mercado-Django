# Mercado - Django + React

Production-style prototype with:

- Backend API: Django + DRF + JWT auth
- Inventory ledger with package conversion (fardo/caixa/unidade -> unidade)
- Frontend app: React + Vite
- Role-based access (`catalog_manager` writes, `viewer` read-only)
- Automation scripts for setup and local run

## Quick start

```powershell
.\scripts\setup.ps1
```

This setup command installs dependencies, migrates DB, creates dev users and seeds products.

## Run apps

Terminal 1:

```powershell
.\scripts\dev-backend.ps1
```

Terminal 2:

```powershell
.\scripts\dev-frontend.ps1
```

## Bluesoft Cosmos (catalogo automatico)

Para usar a API da Bluesoft Cosmos no assistente de catalogo:

```powershell
$env:BLUESOFT_COSMOS_TOKEN = "SEU_TOKEN_COSMOS"
$env:BLUESOFT_COSMOS_USER_AGENT = "SEU_USER_AGENT_COSMOS"
```

Sem essas variaveis, o sistema continua funcionando com o catalogo local como fallback.

## Banco monstro (PostgreSQL recomendado)

Para ambiente de carga alta, use PostgreSQL em vez de SQLite.

1. Copie `.env.example` para `.env` e ajuste se necessario.
2. Suba o banco:

```powershell
.\scripts\db-up.ps1
```

3. Rode backend com postgres:

```powershell
.\scripts\dev-backend-postgres.ps1
```

Variaveis suportadas:

```powershell
$env:DB_BACKEND = "postgres"
$env:DB_NAME = "mercado"
$env:DB_USER = "postgres"
$env:DB_PASSWORD = "postgres"
$env:DB_HOST = "127.0.0.1"
$env:DB_PORT = "5432"
$env:DB_SSLMODE = "prefer"

# Tuning de conexao/latencia
$env:DB_CONN_MAX_AGE = "120"
$env:DB_CONNECT_TIMEOUT = "10"
$env:DB_STATEMENT_TIMEOUT_MS = "12000"
$env:DB_LOCK_TIMEOUT_MS = "5000"
$env:DB_IDLE_IN_TX_TIMEOUT_MS = "30000"

# Pool de conexoes (Django + psycopg)
$env:DB_POOL_ENABLED = "true"
$env:DB_POOL_MIN_SIZE = "4"
$env:DB_POOL_MAX_SIZE = "40"
$env:DB_POOL_TIMEOUT = "30"
```

Depois:

```powershell
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_products
```

Fallback local:
- Se `DB_BACKEND` nao for `postgres`, o projeto continua usando SQLite automaticamente.

Comandos utilitarios:
- `.\scripts\db-up.ps1`: sobe o Postgres via Docker.
- `.\scripts\db-down.ps1`: para o Postgres.
- `.\scripts\db-reset.ps1`: derruba e recria com volume limpo.

## Dev credentials

- Manager: `manager / Manager@123`
- Viewer: `viewer / Viewer@123`

## Main URLs

- Frontend: `http://127.0.0.1:5173`
- Django admin: `http://127.0.0.1:8001/admin/`
- Auth token: `http://127.0.0.1:8001/api/auth/token/`
- Current session: `http://127.0.0.1:8001/api/auth/me/`
- Categories API: `http://127.0.0.1:8001/api/categories/`
- Departments API: `http://127.0.0.1:8001/api/departments/`
- Base products API: `http://127.0.0.1:8001/api/products/`
- Variant items API: `http://127.0.0.1:8001/api/items/`
- Item packages API: `http://127.0.0.1:8001/api/packages/`
- Stock movements API: `http://127.0.0.1:8001/api/movements/`
- Quick entry API: `http://127.0.0.1:8001/api/items/quick-entry/`
- Restock API: `http://127.0.0.1:8001/api/items/<id>/restock/`
- Receive by package API: `http://127.0.0.1:8001/api/items/receive/`
- Sell units/package API: `http://127.0.0.1:8001/api/items/sell/`
- Manual adjust API: `http://127.0.0.1:8001/api/items/adjust/`
- Presets API: `http://127.0.0.1:8001/api/catalog/presets/`
- Metrics API: `http://127.0.0.1:8001/api/items/metrics/`

## Useful backend commands

```powershell
.\.venv\Scripts\python.exe manage.py bootstrap_users
.\.venv\Scripts\python.exe manage.py seed_products
.\.venv\Scripts\python.exe manage.py test
```

## Stress test (dia lotado)

Teste rapido:

```powershell
.\.venv\Scripts\python.exe manage.py stress_db --threads 16 --ops-per-thread 500 --read-ratio 0.85 --write-mode dry-run --serve --open-browser --output .tmp/stress-report.html --json-output .tmp/stress-report.json
```

Teste pesado (perfil atacado):

```powershell
.\scripts\stress-heavy-day.ps1
```

Obs:
- `write-mode real` altera estoque e grava movimentacoes.
- `write-mode dry-run` exercita escrita com rollback para nao sujar os dados.
