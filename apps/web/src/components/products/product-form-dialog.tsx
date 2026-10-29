import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useApiMutation } from '@/hooks/use-api';
import { api, ApiError } from '@/lib/api';
import { moneyToInput, parseMoneyInput } from '@/lib/format';
import type { Product } from '@/lib/types';

const moneyField = z
  .string()
  .trim()
  .refine((value) => parseMoneyInput(value) !== null, 'Informe um valor')
  .refine((value) => (parseMoneyInput(value) ?? -1) >= 0, 'Não pode ser negativo');

const intField = z.string().trim().regex(/^\d+$/, 'Use um número inteiro (0 ou mais)');

const schema = z.object({
  sku: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/, 'Letras, números, ponto, hífen ou _ (até 40)'),
  name: z.string().trim().min(2, 'Mínimo de 2 caracteres').max(120),
  description: z.string().trim().max(1000),
  price: moneyField,
  cost: moneyField,
  stock_quantity: intField,
  min_stock: intField,
});
type FormValues = z.infer<typeof schema>;

const toValues = (product?: Product | null): FormValues => ({
  sku: product?.sku ?? '',
  name: product?.name ?? '',
  description: product?.description ?? '',
  price: moneyToInput(product?.price),
  cost: moneyToInput(product?.cost ?? 0),
  stock_quantity: String(product?.stock_quantity ?? 0),
  min_stock: String(product?.min_stock ?? 0),
});

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ausente = cadastro; presente = edição. */
  product?: Product | null;
  onSaved?: (product: Product) => void;
}) {
  const editing = Boolean(product);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toValues(product),
  });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) form.reset(toValues(product));
  }, [open, product, form]);

  const mutation = useApiMutation(
    (values: FormValues) => {
      const body = {
        sku: values.sku,
        name: values.name,
        description: values.description || null,
        price: parseMoneyInput(values.price),
        cost: parseMoneyInput(values.cost),
        min_stock: Number(values.min_stock),
        ...(editing ? {} : { stock_quantity: Number(values.stock_quantity) }),
      };
      return editing
        ? api<Product>(`/products/${product!.id}`, { method: 'PATCH', body })
        : api<Product>('/products', { method: 'POST', body });
    },
    ['products', 'dashboard', 'stock'],
  );

  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await mutation.mutateAsync(values);
      toast.success(editing ? 'Produto atualizado' : 'Produto cadastrado');
      onOpenChange(false);
      onSaved?.(saved);
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(error.fieldErrors())) {
          form.setError(field as keyof FormValues, { message });
        }
        if (error.code === 'DUPLICATE') form.setError('sku', { message: error.message });
      }
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar');
    }
  });

  const input = (name: keyof FormValues) => ({
    id: `product-${name}`,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `product-${name}-error` : undefined,
    ...form.register(name),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar produto' : 'Novo produto'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'O saldo de estoque muda só por movimentação, para manter o histórico.'
              : 'O estoque inicial fica registrado como a primeira movimentação.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field id="product-sku" label="SKU" error={errors.sku?.message}>
            <Input {...input('sku')} autoComplete="off" placeholder="CAF-250" />
          </Field>
          <Field id="product-name" label="Nome" error={errors.name?.message}>
            <Input {...input('name')} autoComplete="off" />
          </Field>
          <div className="sm:col-span-2">
            <Field
              id="product-description"
              label="Descrição (opcional)"
              error={errors.description?.message}
            >
              <Textarea {...input('description')} rows={2} />
            </Field>
          </div>
          <Field id="product-price" label="Preço de venda (R$)" error={errors.price?.message}>
            <Input {...input('price')} inputMode="decimal" placeholder="0,00" />
          </Field>
          <Field
            id="product-cost"
            label="Custo (R$)"
            error={errors.cost?.message}
            hint="Usado no lucro bruto"
          >
            <Input {...input('cost')} inputMode="decimal" placeholder="0,00" />
          </Field>
          {!editing && (
            <Field
              id="product-stock_quantity"
              label="Estoque inicial"
              error={errors.stock_quantity?.message}
            >
              <Input {...input('stock_quantity')} inputMode="numeric" />
            </Field>
          )}
          <Field
            id="product-min_stock"
            label="Estoque mínimo"
            error={errors.min_stock?.message}
            hint="Abaixo disso, o produto entra no alerta"
          >
            <Input {...input('min_stock')} inputMode="numeric" />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              {editing ? 'Salvar alterações' : 'Cadastrar produto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
