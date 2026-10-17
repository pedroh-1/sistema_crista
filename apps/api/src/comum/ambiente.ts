import { z } from 'zod';

/** Segredo de exemplo do .env.example: nunca pode chegar à produção. */
const SEGREDO_DE_EXEMPLO = 'troque-este-segredo';

const opcional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const esquema = z
  .object({
    NODE_ENV: z.string().default('development'),
    DATABASE_URL: z.string().min(1, 'obrigatória'),
    JWT_SECRET: z.string().min(1, 'obrigatório'),
    WEB_URL: z.url({ error: 'precisa ser uma URL' }),
    API_PORT: z.coerce.number().int().positive().default(3000),
    SMTP_HOST: opcional,
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USUARIO: opcional,
    SMTP_SENHA: opcional,
    SMTP_SEGURO: z.enum(['true', 'false']).optional(),
    ARMAZENAMENTO: z.enum(['disco', 's3']).default('disco'),
    S3_BUCKET: opcional,
  })
  .superRefine((v, ctx) => {
    const erro = (campo: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [campo], message });

    if (v.ARMAZENAMENTO === 's3' && !v.S3_BUCKET)
      erro('S3_BUCKET', 'obrigatório com ARMAZENAMENTO=s3');
    if (!!v.SMTP_USUARIO !== !!v.SMTP_SENHA)
      erro('SMTP_SENHA', 'informe usuário e senha do SMTP juntos');

    if (v.NODE_ENV !== 'production') return;
    // Em produção, nada de valor de exemplo nem de atalho de desenvolvimento.
    if (v.JWT_SECRET === SEGREDO_DE_EXEMPLO || v.JWT_SECRET.length < 32)
      erro('JWT_SECRET', 'use um segredo próprio, com 32 ou mais caracteres');
    if (!v.WEB_URL.startsWith('https://'))
      erro('WEB_URL', 'em produção, o endereço precisa ser https');
    if (!v.SMTP_HOST)
      erro(
        'SMTP_HOST',
        'obrigatório em produção: sem ele, ninguém confirma o e-mail',
      );
  });

/**
 * Valida as variáveis de ambiente na subida da API (ConfigModule). Falhar
 * aqui é melhor que descobrir o problema no primeiro e-mail ou login.
 */
export function validarAmbiente(
  ambiente: Record<string, unknown>,
): Record<string, unknown> {
  // Variável vazia no .env (ex.: SMTP_HOST=) vale como ausente.
  const preenchidas = Object.fromEntries(
    Object.entries(ambiente).filter(([, v]) => v !== ''),
  );
  const r = esquema.safeParse(preenchidas);
  if (!r.success) {
    const linhas = r.error.issues.map(
      (i) => `  ${i.path.join('.')}: ${i.message}`,
    );
    throw new Error(`Variáveis de ambiente inválidas:\n${linhas.join('\n')}`);
  }
  return { ...preenchidas, ...r.data };
}
