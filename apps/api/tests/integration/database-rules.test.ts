import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  cleanup,
  createTenant,
  integrationEnabled,
  skipReason,
  stockOf,
  type TestTenant,
} from './support.js';

if (!integrationEnabled) console.warn(`[integração] testes do Supabase ignorados: ${skipReason}`);

describe.skipIf(!integrationEnabled)('Supabase: RLS, transações e concorrência', () => {
  let a: TestTenant;
  let b: TestTenant;

  beforeAll(async () => {
    [a, b] = await Promise.all([createTenant('a'), createTenant('b')]);
  });

  afterAll(cleanup);

  const createOrder = (
    tenant: TestTenant,
    items: Array<{ sku: string; quantity: number }>,
    extra = {},
  ) =>
    tenant.seller.db.rpc('create_order', {
      p_company_id: tenant.companyId,
      p_items: items.map((item) => ({
        product_id: tenant.products[item.sku]!.id,
        quantity: item.quantity,
      })),
      p_idempotency_key: randomUUID(),
      ...extra,
    });

  describe('isolamento entre empresas (RLS)', () => {
    it('usuário só enxerga produtos da própria empresa', async () => {
      const { data, error } = await a.owner.db.from('products').select('company_id');
      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThan(0);
      expect(new Set(data!.map((row) => row.company_id))).toEqual(new Set([a.companyId]));
    });

    it('filtrar pelo company_id de outra empresa devolve vazio', async () => {
      const { data } = await a.owner.db
        .from('customers')
        .select('id')
        .eq('company_id', b.companyId);
      expect(data).toEqual([]);
    });

    it('não consegue inserir produto em outra empresa', async () => {
      const { error } = await a.owner.db
        .from('products')
        .insert({ company_id: b.companyId, sku: 'INV-1', name: 'Invasor', price: 1 });
      expect(error?.code).toBe('42501');
    });

    it('não consegue criar pedido em outra empresa', async () => {
      const { error } = await a.seller.db.rpc('create_order', {
        p_company_id: b.companyId,
        p_items: [{ product_id: b.products['A-1']!.id, quantity: 1 }],
        p_idempotency_key: randomUUID(),
      });
      expect(error?.message).toBe('NOT_A_MEMBER');
    });

    it('dashboard de outra empresa é negado', async () => {
      const { error } = await a.owner.db.rpc('dashboard_summary', {
        p_company_id: b.companyId,
        p_from: '2026-01-01',
        p_to: '2026-01-31',
      });
      expect(error?.message).toBe('NOT_A_MEMBER');
    });
  });

  describe('integridade e papéis', () => {
    it('saldo de estoque não pode ser alterado por UPDATE direto', async () => {
      const { error } = await a.owner.db
        .from('products')
        .update({ stock_quantity: 999 })
        .eq('id', a.products['A-1']!.id);
      expect(error?.code).toBe('42501');
      expect(await stockOf(a.products['A-1']!.id)).toBe(10);
    });

    it('pedidos e movimentações não aceitam escrita direta', async () => {
      const order = await a.owner.db.from('orders').insert({
        company_id: a.companyId,
        number: 999,
        subtotal: 0,
        total: 0,
        idempotency_key: randomUUID(),
      });
      expect(order.error?.code).toBe('42501');
      const movement = await a.owner.db.from('stock_movements').insert({
        company_id: a.companyId,
        product_id: a.products['A-1']!.id,
        type: 'purchase',
        quantity: 100,
        balance_after: 110,
      });
      expect(movement.error?.code).toBe('42501');
    });

    it('vendedor não cadastra produto (RLS por papel)', async () => {
      const { error } = await a.seller.db
        .from('products')
        .insert({ company_id: a.companyId, sku: 'SEL-1', name: 'Do vendedor', price: 1 });
      expect(error?.code).toBe('42501');
    });

    it('estoque inicial do cadastro gera movimentação de auditoria', async () => {
      const { data } = await a.owner.db
        .from('stock_movements')
        .select('type, quantity, balance_after')
        .eq('product_id', a.products['A-1']!.id)
        .eq('type', 'initial');
      expect(data).toEqual([{ type: 'initial', quantity: 10, balance_after: 10 }]);
    });
  });

  describe('pedidos transacionais', () => {
    it('cria pedido com vários itens: preços do banco, totais e baixa de estoque', async () => {
      const { data, error } = await createOrder(
        a,
        [
          { sku: 'A-1', quantity: 2 },
          { sku: 'B-1', quantity: 1 },
          { sku: 'A-1', quantity: 1 }, // repetido: soma no mesmo item
        ],
        { p_discount: 1.5, p_customer_id: a.customerId },
      );
      expect(error).toBeNull();
      const result = data as { id: string; subtotal: number; total: number; replayed: boolean };
      // 3 × 10,50 + 1 × 7,25 = 38,75; total = 38,75 − 1,50 = 37,25
      expect(result.subtotal).toBe(38.75);
      expect(result.total).toBe(37.25);
      expect(result.replayed).toBe(false);

      expect(await stockOf(a.products['A-1']!.id)).toBe(7);
      expect(await stockOf(a.products['B-1']!.id)).toBe(4);

      const items = await admin()
        .from('order_items')
        .select('product_sku, quantity, unit_price, line_total')
        .eq('order_id', result.id)
        .order('product_sku');
      expect(items.data).toEqual([
        { product_sku: 'A-1', quantity: 3, unit_price: 10.5, line_total: 31.5 },
        { product_sku: 'B-1', quantity: 1, unit_price: 7.25, line_total: 7.25 },
      ]);

      const movements = await admin()
        .from('stock_movements')
        .select('type, quantity')
        .eq('order_id', result.id);
      expect(movements.data).toHaveLength(2);
      expect(movements.data!.every((m) => m.type === 'sale' && m.quantity < 0)).toBe(true);
    });

    it('preço alterado depois não muda o pedido antigo', async () => {
      const { data } = await createOrder(a, [{ sku: 'B-1', quantity: 1 }]);
      const orderId = (data as { id: string }).id;
      await a.owner.db.from('products').update({ price: 50 }).eq('id', a.products['B-1']!.id);

      const item = await admin()
        .from('order_items')
        .select('unit_price')
        .eq('order_id', orderId)
        .single();
      expect(item.data!.unit_price).toBe(7.25);
      await a.owner.db.from('products').update({ price: 7.25 }).eq('id', a.products['B-1']!.id);
    });

    it('falha em um item desfaz o pedido inteiro (rollback)', async () => {
      const stockA = await stockOf(a.products['A-1']!.id);
      const before = await admin()
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', a.companyId);

      const { error } = await createOrder(a, [
        { sku: 'A-1', quantity: 1 },
        { sku: 'C-1', quantity: 5 }, // só há 1 em estoque
      ]);
      expect(error?.message).toBe('INSUFFICIENT_STOCK');
      expect(JSON.parse(error!.details)).toMatchObject({ sku: 'C-1', available: 1, requested: 5 });

      const after = await admin()
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', a.companyId);
      expect(after.count).toBe(before.count);
      expect(await stockOf(a.products['A-1']!.id)).toBe(stockA);
      expect(await stockOf(a.products['C-1']!.id)).toBe(1);
    });

    it('mesma chave de idempotência não baixa o estoque duas vezes', async () => {
      const key = randomUUID();
      const stock = await stockOf(a.products['A-1']!.id);
      const call = () =>
        a.seller.db.rpc('create_order', {
          p_company_id: a.companyId,
          p_items: [{ product_id: a.products['A-1']!.id, quantity: 1 }],
          p_idempotency_key: key,
        });

      const [first, second] = await Promise.all([call(), call()]);
      const results = [first.data, second.data] as Array<{ id: string; replayed: boolean }>;
      expect(results[0]!.id).toBe(results[1]!.id);
      expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
      expect(await stockOf(a.products['A-1']!.id)).toBe(stock - 1);
    });

    it('vendas simultâneas não ultrapassam o estoque disponível', async () => {
      // B-1 tem 4 unidades; 8 vendedores tentam comprar 1 ao mesmo tempo.
      const stock = await stockOf(b.products['B-1']!.id);
      const attempts = await Promise.all(
        Array.from({ length: 8 }, () => createOrder(b, [{ sku: 'B-1', quantity: 1 }])),
      );
      const succeeded = attempts.filter((r) => !r.error).length;
      const rejected = attempts.filter((r) => r.error?.message === 'INSUFFICIENT_STOCK').length;

      expect(succeeded).toBe(stock);
      expect(rejected).toBe(8 - stock);
      expect(await stockOf(b.products['B-1']!.id)).toBe(0);
    });

    it('cancelamento devolve o estoque uma única vez', async () => {
      const { data } = await createOrder(a, [{ sku: 'A-1', quantity: 2 }]);
      const orderId = (data as { id: string }).id;
      const afterSale = await stockOf(a.products['A-1']!.id);

      // Vendedor não pode cancelar.
      const bySeller = await a.seller.db.rpc('cancel_order', {
        p_order_id: orderId,
        p_reason: 'teste',
      });
      expect(bySeller.error?.message).toBe('ROLE_REQUIRED');

      const [first, second] = await Promise.all([
        a.owner.db.rpc('cancel_order', { p_order_id: orderId, p_reason: 'Cliente desistiu' }),
        a.owner.db.rpc('cancel_order', { p_order_id: orderId, p_reason: 'Clique duplo' }),
      ]);
      const errors = [first.error?.message, second.error?.message].filter(Boolean);
      expect(errors).toEqual(['ORDER_ALREADY_CANCELED']);
      expect(await stockOf(a.products['A-1']!.id)).toBe(afterSale + 2);
    });

    it('fluxo de status: pendente → pago → concluído; concluído não cancela', async () => {
      const { data } = await createOrder(a, [{ sku: 'B-1', quantity: 1 }]);
      const orderId = (data as { id: string }).id;

      const backwards = await a.seller.db.rpc('set_order_status', {
        p_order_id: orderId,
        p_status: 'pending',
      });
      expect(backwards.error?.message).toBe('INVALID_STATUS_TRANSITION');

      expect(
        (await a.seller.db.rpc('set_order_status', { p_order_id: orderId, p_status: 'paid' }))
          .error,
      ).toBeNull();
      expect(
        (await a.seller.db.rpc('set_order_status', { p_order_id: orderId, p_status: 'completed' }))
          .error,
      ).toBeNull();

      const cancel = await a.owner.db.rpc('cancel_order', {
        p_order_id: orderId,
        p_reason: 'tarde demais',
      });
      expect(cancel.error?.message).toBe('ORDER_COMPLETED');
    });

    it('ajuste não deixa o estoque negativo', async () => {
      const stock = await stockOf(a.products['C-1']!.id);
      const { error } = await a.owner.db.rpc('adjust_stock', {
        p_product_id: a.products['C-1']!.id,
        p_quantity: -(stock + 1),
        p_type: 'adjustment',
        p_reason: 'Teste de saldo negativo',
      });
      expect(error?.message).toBe('NEGATIVE_STOCK');
      expect(await stockOf(a.products['C-1']!.id)).toBe(stock);
    });
  });

  describe('indicadores', () => {
    it('dashboard reflete pedidos pagos e trata período vazio', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await a.owner.db.rpc('dashboard_summary', {
        p_company_id: a.companyId,
        p_from: today,
        p_to: today,
        p_tz: 'UTC',
      });
      expect(error).toBeNull();
      const summary = data as { kpis: { revenue: number; paid_orders: number; orders: number } };
      expect(summary.kpis.orders).toBeGreaterThan(0);
      expect(summary.kpis.paid_orders).toBe(1); // o pedido concluído do teste de status

      const empty = await a.owner.db.rpc('dashboard_summary', {
        p_company_id: a.companyId,
        p_from: '2020-01-01',
        p_to: '2020-01-07',
      });
      const kpis = (empty.data as { kpis: { revenue: number; average_ticket: number | null } })
        .kpis;
      expect(kpis.revenue).toBe(0);
      expect(kpis.average_ticket).toBeNull();
    });
  });
});
