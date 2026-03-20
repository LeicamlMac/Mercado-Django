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
