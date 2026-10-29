import type { MovementType, OrderStatus } from './types';

export type Tone = 'neutral' | 'success' | 'warning' | 'info' | 'danger' | 'brand';

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pendente', tone: 'warning' },
  paid: { label: 'Pago', tone: 'info' },
  completed: { label: 'Concluído', tone: 'success' },
  canceled: { label: 'Cancelado', tone: 'danger' },
};

export const MOVEMENT_TYPE: Record<MovementType, { label: string; tone: Tone }> = {
  initial: { label: 'Estoque inicial', tone: 'neutral' },
  purchase: { label: 'Entrada', tone: 'success' },
  adjustment: { label: 'Ajuste', tone: 'brand' },
  sale: { label: 'Venda', tone: 'info' },
  cancellation: { label: 'Cancelamento', tone: 'warning' },
};
