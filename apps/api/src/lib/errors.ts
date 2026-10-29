/** Erro com status HTTP e mensagem segura para o usuário final. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'VALIDATION_ERROR', message, details);
export const unauthorized = (message = 'Sessão inválida ou expirada. Entre novamente.') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Seu perfil não permite esta operação.') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Registro não encontrado.') =>
  new AppError(404, 'NOT_FOUND', message);

/** Formato dos erros devolvidos pelo PostgREST / supabase-js. */
export interface PostgrestLikeError {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

interface BusinessError {
  status: number;
  message: string | ((details: Record<string, unknown> | null) => string);
}

/** Erros de negócio levantados pelas funções SQL (SQLSTATE VHxxx). */
const BUSINESS_ERRORS: Record<string, BusinessError> = {
  NOT_AUTHENTICATED: { status: 401, message: 'Sessão inválida ou expirada. Entre novamente.' },
  NOT_A_MEMBER: { status: 403, message: 'Você não tem acesso a esta empresa.' },
  ROLE_REQUIRED: { status: 403, message: 'Seu perfil não permite esta operação.' },
  COMPANY_NOT_FOUND: { status: 404, message: 'Empresa não encontrada.' },
  COMPANY_LIMIT_REACHED: { status: 409, message: 'Limite de 5 empresas por usuário atingido.' },
  PRODUCT_NOT_FOUND: { status: 404, message: 'Produto não encontrado ou arquivado.' },
  CUSTOMER_NOT_FOUND: { status: 404, message: 'Cliente não encontrado ou arquivado.' },
  ORDER_NOT_FOUND: { status: 404, message: 'Pedido não encontrado.' },
  ORDER_WITHOUT_ITEMS: { status: 400, message: 'O pedido precisa de pelo menos um item.' },
  TOO_MANY_ITEMS: { status: 400, message: 'O pedido aceita no máximo 100 itens.' },
  INVALID_ORDER_ITEM: { status: 400, message: 'Item de pedido inválido.' },
  INVALID_DISCOUNT: { status: 400, message: 'Desconto inválido.' },
  DISCOUNT_EXCEEDS_SUBTOTAL: {
    status: 400,
    message: 'O desconto não pode ser maior que o subtotal.',
  },
  IDEMPOTENCY_KEY_REQUIRED: { status: 400, message: 'Chave de idempotência ausente.' },
  INVALID_INITIAL_STATUS: { status: 400, message: 'Um pedido novo deve ser pendente ou pago.' },
  INSUFFICIENT_STOCK: {
    status: 409,
    message: (d) =>
      d
        ? `Estoque insuficiente para "${String(d.name)}": disponível ${String(d.available)}, solicitado ${String(d.requested)}.`
        : 'Estoque insuficiente.',
  },
  USE_CANCEL_ORDER: { status: 400, message: 'Use a ação de cancelamento para cancelar o pedido.' },
  INVALID_STATUS_TRANSITION: { status: 409, message: 'Mudança de status não permitida.' },
  ORDER_ALREADY_CANCELED: { status: 409, message: 'Este pedido já foi cancelado.' },
  ORDER_COMPLETED: { status: 409, message: 'Pedidos concluídos não podem ser cancelados.' },
  INVALID_MOVEMENT_TYPE: { status: 400, message: 'Tipo de movimentação inválido.' },
  INVALID_QUANTITY: { status: 400, message: 'Quantidade inválida para a movimentação.' },
  REASON_REQUIRED: { status: 400, message: 'Informe o motivo do ajuste.' },
  PRODUCT_ARCHIVED: { status: 409, message: 'Produto arquivado: restaure-o antes de movimentar.' },
  NEGATIVE_STOCK: {
    status: 409,
    message: (d) =>
      d
        ? `O ajuste deixaria o estoque negativo (saldo atual: ${String(d.available)}).`
        : 'O ajuste deixaria o estoque negativo.',
  },
  INVALID_PERIOD: { status: 400, message: 'Período inválido.' },
  PERIOD_TOO_LONG: { status: 400, message: 'O período máximo é de 366 dias.' },
  INVALID_TIMEZONE: { status: 400, message: 'Fuso horário inválido.' },
};

const UNIQUE_CONSTRAINTS: Record<string, string> = {
  products_company_sku_key: 'Já existe um produto com este SKU.',
  customers_company_email_key: 'Já existe um cliente com este e-mail.',
};

function parseDetails(details: string | null | undefined): Record<string, unknown> | null {
  if (!details) return null;
  try {
    const parsed: unknown = JSON.parse(details);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Converte um erro do banco em AppError com mensagem amigável e sem detalhes internos. */
export function fromDatabaseError(error: PostgrestLikeError): AppError {
  const code = error.code ?? '';

  if (code.startsWith('VH')) {
    const known = BUSINESS_ERRORS[error.message];
    const details = parseDetails(error.details);
    if (known) {
      const message = typeof known.message === 'function' ? known.message(details) : known.message;
      return new AppError(known.status, error.message, message, details ?? undefined);
    }
    return new AppError(Number(code.slice(2)) || 400, error.message, 'Operação não permitida.');
  }

  switch (code) {
    case '23505': {
      const constraint = Object.keys(UNIQUE_CONSTRAINTS).find((name) =>
        error.message.includes(name),
      );
      return new AppError(
        409,
        'DUPLICATE',
        constraint ? UNIQUE_CONSTRAINTS[constraint]! : 'Registro duplicado.',
      );
    }
    case '23514':
      return new AppError(400, 'CHECK_VIOLATION', 'Algum valor está fora do permitido.');
    case '23503':
      return new AppError(409, 'REFERENCE_VIOLATION', 'Registro relacionado não encontrado.');
    case '22P02':
    case '22003':
      return new AppError(400, 'INVALID_INPUT', 'Valor em formato inválido.');
    case '42501':
      return new AppError(403, 'FORBIDDEN', 'Seu perfil não permite esta operação.');
    case 'PGRST116':
      return notFound();
    case 'PGRST301':
    case 'PGRST303':
      return unauthorized();
    default:
      return new AppError(502, 'DATABASE_ERROR', 'Falha ao consultar o banco de dados.');
  }
}

/** Lança o AppError correspondente quando a resposta do supabase-js trouxe erro. */
export function throwIfDbError(error: PostgrestLikeError | null): void {
  if (error) throw fromDatabaseError(error);
}
