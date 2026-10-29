import { describe, expect, it } from 'vitest';
import { customerCreateBody, customerUpdateBody } from '../../src/schemas/customers.js';
import { orderCreateBody, orderListQuery } from '../../src/schemas/orders.js';
import {
  productCreateBody,
  productUpdateBody,
  stockAdjustmentBody,
} from '../../src/schemas/products.js';

const PRODUCT = '33333333-3333-4333-8333-333333333333';

describe('pedido', () => {
  it('ignora preço e total enviados pelo cliente (o banco calcula)', () => {
    const parsed = orderCreateBody.parse({
      items: [{ product_id: PRODUCT, quantity: 2, unit_price: 0.01 }],
      total: 0.01,
      subtotal: 0.01,
    });
    expect(parsed).toEqual({
      customer_id: null,
      items: [{ product_id: PRODUCT, quantity: 2 }],
      discount: 0,
      status: 'pending',
      notes: null,
    });
  });

  it('exige itens, quantidades inteiras positivas e status inicial válido', () => {
    expect(orderCreateBody.safeParse({ items: [] }).success).toBe(false);
    expect(
      orderCreateBody.safeParse({ items: [{ product_id: PRODUCT, quantity: 0 }] }).success,
    ).toBe(false);
    expect(
      orderCreateBody.safeParse({ items: [{ product_id: PRODUCT, quantity: 1.5 }] }).success,
    ).toBe(false);
    expect(
      orderCreateBody.safeParse({
        items: [{ product_id: PRODUCT, quantity: 1 }],
        status: 'completed',
      }).success,
    ).toBe(false);
  });

  it('desconto aceita no máximo 2 casas decimais', () => {
    const items = [{ product_id: PRODUCT, quantity: 1 }];
    expect(orderCreateBody.safeParse({ items, discount: 10.5 }).success).toBe(true);
    expect(orderCreateBody.safeParse({ items, discount: 10.555 }).success).toBe(false);
    expect(orderCreateBody.safeParse({ items, discount: -1 }).success).toBe(false);
  });

  it('filtro de período exige início antes do fim', () => {
    expect(orderListQuery.safeParse({ from: '2026-10-10', to: '2026-10-01' }).success).toBe(false);
    expect(orderListQuery.parse({ from: '2026-10-01', to: '2026-10-10' }).page_size).toBe(20);
  });
});

describe('produto', () => {
  it('cadastro aplica padrões e valida dinheiro e quantidades', () => {
    const parsed = productCreateBody.parse({ sku: 'CAF-500', name: 'Café', price: 18.9 });
    expect(parsed).toMatchObject({ cost: 0, stock_quantity: 0, min_stock: 0, description: null });
    expect(
      productCreateBody.safeParse({ sku: 'X', name: 'Café', price: 1, stock_quantity: -1 }).success,
    ).toBe(false);
    expect(productCreateBody.safeParse({ sku: 'com espaço', name: 'Café', price: 1 }).success).toBe(
      false,
    );
  });

  it('edição não aceita alterar o saldo de estoque diretamente', () => {
    const parsed = productUpdateBody.parse({ name: 'Novo nome', stock_quantity: 999 });
    expect(parsed).toEqual({ name: 'Novo nome' });
  });

  it('edição parcial não apaga campos omitidos', () => {
    expect(productUpdateBody.parse({ price: 10 })).toEqual({ price: 10 });
    expect(productUpdateBody.safeParse({}).success).toBe(false);
  });

  it('movimentação: compra positiva e ajuste com motivo', () => {
    expect(stockAdjustmentBody.safeParse({ type: 'purchase', quantity: -2 }).success).toBe(false);
    expect(stockAdjustmentBody.safeParse({ type: 'adjustment', quantity: -2 }).success).toBe(false);
    expect(
      stockAdjustmentBody.safeParse({ type: 'adjustment', quantity: -2, reason: 'Avaria' }).success,
    ).toBe(true);
    expect(stockAdjustmentBody.safeParse({ type: 'purchase', quantity: 0 }).success).toBe(false);
  });
});

describe('cliente', () => {
  it('normaliza e-mail e converte vazios em null', () => {
    expect(
      customerCreateBody.parse({ name: 'Ana Souza', email: ' ANA@Exemplo.com ', phone: '' }),
    ).toEqual({
      name: 'Ana Souza',
      email: 'ana@exemplo.com',
      phone: null,
      notes: null,
    });
    expect(customerCreateBody.safeParse({ name: 'Ana', email: 'sem-arroba' }).success).toBe(false);
  });

  it('edição parcial mantém campos omitidos fora do update', () => {
    expect(customerUpdateBody.parse({ phone: '(11) 98888-7777' })).toEqual({
      phone: '(11) 98888-7777',
    });
  });
});
