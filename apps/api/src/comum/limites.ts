import { Throttle } from '@nestjs/throttler';

/** Limite geral por IP: folgado, só para conter abuso. */
export const LIMITE_GERAL = { ttl: 60_000, limit: 300 };

/**
 * Rotas públicas de conta (login, cadastro, tokens): 10 tentativas por minuto
 * por IP, contra tentativa de senha e envio de e-mail em massa.
 */
export const LimiteDeConta = () =>
  Throttle({ default: { ttl: 60_000, limit: 10 } });
