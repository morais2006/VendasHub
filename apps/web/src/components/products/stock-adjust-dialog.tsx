import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FilterTabs } from '@/components/list-controls';
import { errorMessage } from '@/lib/error-message';
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
import { useApiMutation } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { formatInt } from '@/lib/format';
import type { Product } from '@/lib/types';

type Mode = 'purchase' | 'add' | 'remove';

const MODES: Array<{ value: Mode; label: string }> = [
  { value: 'purchase', label: 'Entrada (compra)' },
  { value: 'add', label: 'Ajuste +' },
  { value: 'remove', label: 'Ajuste −' },
];

export function StockAdjustDialog({
  product,
  open,
  onOpenChange,
}: {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // O conteúdo do diálogo desmonta ao fechar: o formulário reabre sempre limpo.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <StockAdjustForm product={product} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function StockAdjustForm({ product, onClose }: { product: Product; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('purchase');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const amount = Number(quantity);
  const valid = /^\d+$/.test(quantity) && amount > 0;
  const delta = mode === 'remove' ? -amount : amount;
  const after = product.stock_quantity + (valid ? delta : 0);
  const needsReason = mode !== 'purchase';

  const mutation = useApiMutation(
    () =>
      api(`/products/${product.id}/stock-adjustments`, {
        method: 'POST',
        body: {
          type: mode === 'purchase' ? 'purchase' : 'adjustment',
          quantity: delta,
          reason: reason.trim() || null,
        },
      }),
    ['products', 'stock', 'dashboard'],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!valid) return setError('Informe uma quantidade inteira maior que zero.');
    if (needsReason && reason.trim().length < 3) return setError('Descreva o motivo do ajuste.');
    if (after < 0)
      return setError(
        `O saldo atual é ${formatInt(product.stock_quantity)}: não dá para remover ${amount}.`,
      );
    try {
      await mutation.mutateAsync();
      toast.success('Estoque atualizado');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Movimentar estoque</DialogTitle>
        <DialogDescription>
          {product.name} · saldo atual {formatInt(product.stock_quantity)} un.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FilterTabs label="Tipo de movimentação" value={mode} options={MODES} onChange={setMode} />
        <div className="space-y-1.5">
          <Label htmlFor="adjust-quantity">Quantidade</Label>
          <Input
            id="adjust-quantity"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adjust-reason">Motivo {needsReason ? '' : '(opcional)'}</Label>
          <Input
            id="adjust-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              needsReason ? 'Ex.: inventário, avaria, perda' : 'Ex.: NF 1234, fornecedor'
            }
            maxLength={300}
          />
        </div>
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          Saldo após a movimentação:{' '}
          <span className={after < 0 ? 'font-semibold text-destructive' : 'font-semibold'}>
            {formatInt(after)} un.
          </span>
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
