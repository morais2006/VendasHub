import { ApiError } from './api';

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Algo deu errado.';
}
