-- =============================================================================
-- VendaHub — exclusão de empresa em cascata
--
-- Ao excluir uma empresa, o PostgreSQL apaga produtos, clientes, pedidos e
-- itens por caminhos de cascata diferentes. Com as FKs entre filhos checadas
-- imediatamente, a remoção de um produto era barrada porque o item de pedido
-- que o referencia ainda não tinha sido apagado pela cascata dos pedidos.
--
-- Tornando essas FKs adiáveis (checadas no fim da transação), a exclusão da
-- empresa termina com tudo removido e nenhuma referência órfã. A proteção do
-- dia a dia não muda: usuários não têm permissão de DELETE nessas tabelas.
-- =============================================================================

alter table public.order_items
  alter constraint order_items_product_id_company_id_fkey deferrable initially deferred;

alter table public.stock_movements
  alter constraint stock_movements_product_id_company_id_fkey deferrable initially deferred;

alter table public.stock_movements
  alter constraint stock_movements_order_id_company_id_fkey deferrable initially deferred;

alter table public.orders
  alter constraint orders_customer_id_company_id_fkey deferrable initially deferred;
