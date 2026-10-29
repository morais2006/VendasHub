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
import type { CustomerSummary } from '@/lib/types';

const schema = z.object({
  name: z.string().trim().min(2, 'Mínimo de 2 caracteres').max(120),
  email: z
    .string()
    .trim()
    .max(160)
    .refine((value) => !value || z.email().safeParse(value).success, 'E-mail inválido'),
  phone: z
    .string()
    .trim()
    .refine(
      (value) => !value || /^[0-9+() -]{8,20}$/.test(value),
      'Use números, espaço, +, ( ) e -',
    ),
  notes: z.string().trim().max(500),
});
type FormValues = z.infer<typeof schema>;

const toValues = (customer?: CustomerSummary | null): FormValues => ({
  name: customer?.name ?? '',
  email: customer?.email ?? '',
  phone: customer?.phone ?? '',
  notes: customer?.notes ?? '',
});

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: CustomerSummary | null;
  onSaved?: (customer: CustomerSummary) => void;
}) {
  const editing = Boolean(customer);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toValues(customer),
  });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) form.reset(toValues(customer));
  }, [open, customer, form]);

  const mutation = useApiMutation(
    (values: FormValues) => {
      const body = {
        name: values.name,
        email: values.email || null,
        phone: values.phone || null,
        notes: values.notes || null,
      };
      return editing
        ? api<CustomerSummary>(`/customers/${customer!.id}`, { method: 'PATCH', body })
        : api<CustomerSummary>('/customers', { method: 'POST', body });
    },
    ['customers'],
  );

  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await mutation.mutateAsync(values);
      toast.success(editing ? 'Cliente atualizado' : 'Cliente cadastrado');
      onOpenChange(false);
      onSaved?.(saved);
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(error.fieldErrors())) {
          form.setError(field as keyof FormValues, { message });
        }
        if (error.code === 'DUPLICATE') form.setError('email', { message: error.message });
      }
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar');
    }
  });

  const field = (name: keyof FormValues) => ({
    id: `customer-${name}`,
    'aria-invalid': Boolean(errors[name]),
    ...form.register(name),
  });
  const error = (name: keyof FormValues) =>
    errors[name] && <p className="text-xs text-destructive">{errors[name]?.message}</p>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
          <DialogDescription>Só o necessário para vender e manter contato.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="customer-name">Nome</Label>
            <Input {...field('name')} autoComplete="off" />
            {error('name')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="customer-email">E-mail (opcional)</Label>
              <Input {...field('email')} type="email" inputMode="email" autoComplete="off" />
              {error('email')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer-phone">Telefone (opcional)</Label>
              <Input {...field('phone')} type="tel" inputMode="tel" placeholder="(11) 98765-4321" />
              {error('phone')}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-notes">Observações (opcional)</Label>
            <Textarea {...field('notes')} rows={2} />
            {error('notes')}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              {editing ? 'Salvar' : 'Cadastrar cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
