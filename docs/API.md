# API do VendaHub

Base: `http://localhost:3333/api`. Corpo das requisições e respostas em JSON, com os mesmos nomes de campo das colunas do banco (`snake_case`).

## Cabeçalhos

| Cabeçalho | Quando | Descrição |
|---|---|---|
| `Authorization: Bearer <token>` | todas as rotas, exceto `/health` | Access token do Supabase Auth (sessão do usuário) |
| `X-Company-Id: <uuid>` | rotas de dados da empresa | Empresa ativa; a API confere no banco se o usuário é membro e qual o papel dele |
| `Idempotency-Key: <uuid>` | `POST /orders` | Gerado pelo cliente a cada tentativa de venda; repetir a mesma chave devolve o mesmo pedido |

## Erros

Formato único:

```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "Estoque insuficiente para \"Kit tábua de frios\": disponível 0, solicitado 1.", "details": { "sku": "KIT-FRI", "available": 0, "requested": 1 } } }
```

| HTTP | Situações |
|---|---|
| 400 | `VALIDATION_ERROR` (com `details.fields`), `COMPANY_REQUIRED`, `IDEMPOTENCY_KEY_REQUIRED`, regras de entrada |
| 401 | `UNAUTHORIZED`: sem token, token inválido ou expirado |
| 403 | `FORBIDDEN`: não é membro da empresa ou o papel não permite a ação |
| 404 | `NOT_FOUND`, `PRODUCT_NOT_FOUND`, `ORDER_NOT_FOUND`… (inclusive registros de outra empresa) |
| 409 | `INSUFFICIENT_STOCK`, `DUPLICATE` (SKU ou e-mail), `ORDER_ALREADY_CANCELED`, `ORDER_COMPLETED`, `INVALID_STATUS_TRANSITION`, `NEGATIVE_STOCK` |
| 429 | `RATE_LIMITED`: mais de 300 requisições por minuto |
| 502 | `DATABASE_ERROR`: falha ao falar com o banco (detalhes só no log do servidor) |

## Listas paginadas

Parâmetros `page` (padrão 1) e `page_size` (padrão 20, máximo 100). Resposta:

```json
{ "items": [], "page": 1, "page_size": 20, "total": 0, "total_pages": 1 }
```

## Metadados de cache

As respostas de `/dashboard` e `/products` trazem o objeto `cache`:

```json
{
  "strategy": "HIT",
  "namespace": "dashboard",
  "key": "vendahub:v1:co:<empresa>:dashboard:from=2026-09-30&to=2026-10-29&tz=America%2FSao_Paulo",
  "ttlSeconds": 60,
  "ttlRemaining": 41,
  "computedAt": "2026-10-29T03:15:57.120Z",
  "durationMs": 1.68,
  "sourceDurationMs": null
}
```

| Campo | Descrição |
|---|---|
| `strategy` | `HIT` (Redis), `MISS` (calculado no PostgreSQL e gravado) ou `BYPASS` (Redis indisponível; acompanha o campo `notice`) |
| `ttlSeconds` / `ttlRemaining` | TTL configurado e segundos que faltam para expirar |
| `computedAt` | Quando o valor servido foi calculado no PostgreSQL |
| `durationMs` | Tempo da operação de cache medido no servidor |
| `sourceDurationMs` | Tempo da consulta ao banco; `null` no HIT |

---

## Sistema

| Método | Rota | Papel | Descrição |
|---|---|---|---|
| GET | `/health` | público | `{ status, redis: "up"\|"down", time }` |
| GET | `/system/diagnostics` | membro | Integrações (status e latência), métricas de cache por namespace, chaves da empresa com TTL, eventos, latência por rota, erros recentes |
| POST | `/system/cache/invalidate` | proprietário, gerente | Invalida o cache da empresa (demonstração) |

## Conta

| Método | Rota | Descrição |
|---|---|---|
| GET | `/me` | Usuário logado e empresas: `{ user: { id, email, full_name }, companies: [{ company_id, company_name, role }] }` |
| PATCH | `/me` | `{ full_name }` |
| POST | `/companies` | `{ name }`: cria a empresa com o usuário como proprietário (até 5 por usuário) → **201** |

## Dashboard

| Método | Rota | Papel | Parâmetros |
|---|---|---|---|
| GET | `/dashboard` | membro | `from`, `to` (`AAAA-MM-DD`, opcionais; padrão: últimos 30 dias até hoje; máximo de 366 dias) |

Resposta:

| Campo | Conteúdo |
|---|---|
| `period`, `previous_period` | Período consultado e o período anterior de mesmo tamanho |
| `kpis` | `revenue`, `orders`, `paid_orders`, `average_ticket`, `gross_profit`, `gross_margin`, `items_sold`, `pending_amount`, `pending_orders`, `canceled_orders`, `discounts`, `active_customers` |
| `previous` | Faturamento, pedidos e ticket do período anterior |
| `sales_by_day` | Série diária; dias sem venda vêm com zero |
| `top_products` | Os 5 mais vendidos |
| `low_stock` | `{ count, items }` |
| `status_breakdown` | Pedidos por status |
| `cache` | Metadados de cache (ver acima) |

Faturamento considera pedidos pagos ou concluídos. `average_ticket` e `gross_margin` são `null` quando não há venda paga no período.

## Produtos e estoque

| Método | Rota | Papel | Corpo / parâmetros |
|---|---|---|---|
| GET | `/products` | membro | `search` (nome ou SKU), `status` = `active` \| `low` \| `archived` \| `all`, `sort` = `name` \| `sku` \| `price` \| `stock` \| `updated`, `order` = `asc` \| `desc`, paginação. Resposta em cache (`cache`) |
| POST | `/products` | proprietário, gerente | `{ sku, name, description?, price, cost?, stock_quantity?, min_stock? }` → **201** |
| GET | `/products/:id` | membro | — |
| PATCH | `/products/:id` | proprietário, gerente | Qualquer subconjunto de `{ sku, name, description, price, cost, min_stock }`. O saldo não é editável aqui |
| POST | `/products/:id/archive` | proprietário, gerente | Exclusão lógica |
| POST | `/products/:id/restore` | proprietário, gerente | — |
| POST | `/products/:id/stock-adjustments` | proprietário, gerente | `{ type: "purchase", quantity > 0, reason? }` ou `{ type: "adjustment", quantity ≠ 0, reason }` → **201** `{ stock_quantity, movement_id }` |
| GET | `/products/:id/movements` | membro | Histórico do produto (paginado) |
| GET | `/stock/movements` | membro | `type` = `initial` \| `purchase` \| `adjustment` \| `sale` \| `cancellation`, `product_id`, paginação |

Valores monetários: número com até 2 casas decimais. Quantidades: inteiros.

## Clientes

| Método | Rota | Papel | Corpo / parâmetros |
|---|---|---|---|
| GET | `/customers` | membro | `search` (nome, e-mail ou telefone), `status` = `active` \| `archived` \| `all`, `sort` = `name` \| `total_spent` \| `last_order` \| `created`, `order`, paginação. Cada item traz `orders_count`, `total_spent` e `last_order_at` |
| POST | `/customers` | membro | `{ name, email?, phone?, notes? }` → **201** |
| GET | `/customers/:id` | membro | Cadastro + `insights` (total gasto, pedidos, ticket médio, primeira e última compra, dias desde a última, produtos preferidos) + `recent_orders` |
| PATCH | `/customers/:id` | membro | Subconjunto do cadastro |
| POST | `/customers/:id/archive` / `restore` | membro | — |

## Pedidos

| Método | Rota | Papel | Corpo / parâmetros |
|---|---|---|---|
| GET | `/orders` | membro | `status`, `customer_id`, `from`, `to` (`AAAA-MM-DD`, no fuso da loja), `number`, paginação |
| POST | `/orders` | membro | Cabeçalho `Idempotency-Key`. Corpo `{ items: [{ product_id, quantity }], customer_id?, discount?, status?: "pending" \| "paid", notes? }` → **201** (novo) ou **200** (repetição, `replayed: true`) |
| GET | `/orders/:id` | membro | Pedido com itens (preço histórico), cliente, autor e datas de cada etapa |
| POST | `/orders/:id/status` | membro | `{ status: "paid" \| "completed" }` |
| POST | `/orders/:id/cancel` | proprietário, gerente | `{ reason }`: devolve o estoque |

Preço unitário, subtotal e total **não são aceitos** do cliente: o banco calcula a partir do cadastro no momento da venda.

Exemplo:

```http
POST /api/orders
Authorization: Bearer eyJ...
X-Company-Id: 6f53682f-70fd-41d0-b35c-c30059dee139
Idempotency-Key: 0b8f8a7e-3c0e-4f61-9a43-2f5c3c1a9d10
Content-Type: application/json

{ "items": [{ "product_id": "2b2f19f8-09a0-4bb2-877e-be70a5113141", "quantity": 2 }], "discount": 5, "status": "paid" }
```

```json
{ "id": "7233b835-…", "number": 141, "status": "paid", "subtotal": 120.7, "discount": 5, "total": 115.7, "replayed": false }
```
