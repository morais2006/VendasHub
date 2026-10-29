import {
  ArrowLeft,
  Loader2,
  Minus,
  PackageSearch,
  Plus,
  ShoppingCart,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { FilterTabs, SearchInput } from '@/components/list-controls';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState } from '@/components/states';
import { errorMessage } from '@/lib/error-message';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useApiMutation, useCustomer, useCustomers, useProducts } from '@/hooks/use-api';
import { api, ApiError } from '@/lib/api';
import { formatInt, formatMoney, parseMoneyInput } from '@/lib/format';
import type { OrderMutationResult, Product } from '@/lib/types';
import { cn } from '@/lib/utils';

interface CartLine {
  product: Product;
  quantity: number;
}

function ProductPicker({ cart, onAdd }: { cart: CartLine[]; onAdd: (product: Product) => void }) {
  const [search, setSearch] = useState('');
  const query = useProducts({
    search,
    status: 'active',
    sort: 'name',
    order: 'asc',
    page_size: 12,
  });
  const inCart = (id: string) => cart.find((line) => line.product.id === id)?.quantity ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Produtos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome ou SKU" />
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !query.data ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : query.data.items.length === 0 ? (
          <EmptyState
            icon={<PackageSearch />}
            title="Nenhum produto ativo encontrado"
            className="py-6"
          />
        ) : (
          <ul className="divide-y rounded-md border">
            {query.data.items.map((product) => {
              const available = product.stock_quantity - inCart(product.id);
              return (
                <li key={product.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground tabular">
                      {formatMoney(product.price)} ·{' '}
                      <span className={cn(product.stock_quantity === 0 && 'text-destructive')}>
                        {product.stock_quantity === 0
                          ? 'sem estoque'
                          : `${formatInt(product.stock_quantity)} em estoque`}
                      </span>
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={available <= 0}
                    onClick={() => onAdd(product)}
                    aria-label={`Adicionar ${product.name}`}
                  >
                    <Plus /> Adicionar
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CustomerPicker({
  value,
  onChange,
}: {
  value: { id: string; name: string } | null;
  onChange: (customer: { id: string; name: string } | null) => void;
}) {
  const [search, setSearch] = useState('');
  const query = useCustomers({
    search,
    status: 'active',
    sort: 'name',
    order: 'asc',
    page_size: 5,
  });

  if (value)
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
        <UserRound className="size-4 text-muted-foreground" aria-hidden />
        <span className="flex-1 truncate font-medium">{value.name}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Remover cliente"
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      </div>
    );

  return (
    <div className="space-y-2">
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Buscar cliente (opcional)"
        label="Buscar cliente"
      />
      {search && query.data && (
        <ul className="divide-y rounded-md border text-sm">
          {query.data.items.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">Nenhum cliente encontrado</li>
          ) : (
            query.data.items.map((customer) => (
              <li key={customer.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  onClick={() => {
                    onChange({ id: customer.id, name: customer.name });
                    setSearch('');
                  }}
                >
                  <span className="block font-medium">{customer.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {customer.email ?? customer.phone ?? ''}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {!search && (
        <p className="text-xs text-muted-foreground">
          Sem cliente, a venda fica como consumidor final.
        </p>
      )}
    </div>
  );
}

export default function NewOrderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetCustomerId = searchParams.get('cliente');
  const presetCustomer = useCustomer(presetCustomerId ?? '', Boolean(presetCustomerId));

  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null | undefined>(
    undefined,
  );
  const [discountText, setDiscountText] = useState('');
  const [status, setStatus] = useState<'pending' | 'paid'>('paid');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Uma chave por tentativa de venda: repetir o envio (clique duplo, rede
  // instável) devolve o mesmo pedido em vez de baixar o estoque de novo.
  const idempotencyKey = useRef(crypto.randomUUID());

  const selectedCustomer =
    customer !== undefined
      ? customer
      : presetCustomerId && presetCustomer.data
        ? { id: presetCustomer.data.id, name: presetCustomer.data.name }
        : null;

  const subtotal = useMemo(
    () =>
      Math.round(cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0) * 100) /
      100,
    [cart],
  );
  const discount = parseMoneyInput(discountText) ?? 0;
  const discountInvalid =
    discountText !== '' && (parseMoneyInput(discountText) === null || discount > subtotal);
  const total = Math.max(0, subtotal - discount);

  const mutation = useApiMutation(
    () =>
      api<OrderMutationResult>('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey.current },
        body: {
          customer_id: selectedCustomer?.id ?? null,
          items: cart.map((line) => ({ product_id: line.product.id, quantity: line.quantity })),
          discount,
          status,
          notes: notes.trim() || null,
        },
      }),
    ['orders', 'products', 'dashboard', 'stock', 'customers'],
  );

  const addProduct = (product: Product) =>
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing)
        return current.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: Math.min(line.quantity + 1, product.stock_quantity) }
            : line,
        );
      return [...current, { product, quantity: 1 }];
    });

  const setQuantity = (id: string, quantity: number) =>
    setCart((current) =>
      current.map((line) =>
        line.product.id === id
          ? { ...line, quantity: Math.max(1, Math.min(quantity, line.product.stock_quantity)) }
          : line,
      ),
    );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (cart.length === 0) return setError('Adicione pelo menos um produto.');
    if (discountInvalid) return setError('O desconto não pode ser maior que o subtotal.');
    try {
      const result = await mutation.mutateAsync();
      idempotencyKey.current = crypto.randomUUID();
      toast.success(
        result.replayed
          ? `Pedido #${result.number} já estava registrado`
          : `Venda #${result.number} registrada`,
      );
      navigate(`/pedidos/${result.id}`, { replace: true });
    } catch (err) {
      // Erro de negócio (ex.: estoque insuficiente): a venda não aconteceu,
      // então a próxima tentativa recebe uma chave nova.
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        idempotencyKey.current = crypto.randomUUID();
      }
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <Link
        to="/pedidos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Vendas
      </Link>
      <PageHeader
        title="Nova venda"
        description="Escolha os produtos, o cliente e a forma de registro."
      />

      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[1fr_400px] lg:items-start">
        <ProductPicker cart={cart} onAdd={addProduct} />

        <Card className="lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="size-4" aria-hidden /> Venda
              {cart.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  · {cart.reduce((sum, line) => sum + line.quantity, 0)} item(ns)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {cart.length === 0 ? (
              <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                Adicione produtos do catálogo.
              </p>
            ) : (
              <ul className="max-h-80 divide-y overflow-auto rounded-md border px-3">
                {cart.map((line) => (
                  <li key={line.product.id} className="space-y-2 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{line.product.name}</p>
                        <p className="text-xs text-muted-foreground tabular">
                          {formatMoney(line.product.price)} un. · máx.{' '}
                          {formatInt(line.product.stock_quantity)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remover ${line.product.name}`}
                        onClick={() =>
                          setCart((current) =>
                            current.filter((l) => l.product.id !== line.product.id),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label="Diminuir quantidade"
                          disabled={line.quantity <= 1}
                          onClick={() => setQuantity(line.product.id, line.quantity - 1)}
                        >
                          <Minus />
                        </Button>
                        <Input
                          aria-label={`Quantidade de ${line.product.name}`}
                          inputMode="numeric"
                          value={line.quantity}
                          onChange={(e) =>
                            setQuantity(
                              line.product.id,
                              Number(e.target.value.replace(/\D/g, '')) || 1,
                            )
                          }
                          className="h-7 w-14 text-center tabular"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label="Aumentar quantidade"
                          disabled={line.quantity >= line.product.stock_quantity}
                          onClick={() => setQuantity(line.product.id, line.quantity + 1)}
                        >
                          <Plus />
                        </Button>
                      </div>
                      <span className="text-sm font-medium tabular">
                        {formatMoney(line.product.price * line.quantity)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <CustomerPicker value={selectedCustomer} onChange={setCustomer} />
            </div>

            <div className="space-y-1.5">
              <Label>Registrar como</Label>
              <FilterTabs
                label="Status inicial"
                value={status}
                options={[
                  { value: 'paid', label: 'Pago' },
                  { value: 'pending', label: 'Pendente' },
                ]}
                onChange={setStatus}
              />
              <p className="text-xs text-muted-foreground">
                Em ambos os casos o estoque é baixado agora; um cancelamento devolve.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="discount">Desconto (R$)</Label>
              <Input
                id="discount"
                inputMode="decimal"
                placeholder="0,00"
                value={discountText}
                onChange={(e) => setDiscountText(e.target.value)}
                aria-invalid={discountInvalid}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                rows={2}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <dl className="space-y-1.5 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular">{formatMoney(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Desconto</dt>
                <dd className="tabular">− {formatMoney(discount)}</dd>
              </div>
              <div className="flex justify-between pt-1 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{formatMoney(total)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              Valores de referência. Preços e total são confirmados pelo servidor no registro.
            </p>

            {error && (
              <p
                role="alert"
                className="rounded-md bg-destructive/8 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="h-10 w-full"
              disabled={mutation.isPending || cart.length === 0}
            >
              {mutation.isPending && <Loader2 className="animate-spin" />}
              Registrar venda
            </Button>
          </CardContent>
        </Card>
      </form>
    </>
  );
}
