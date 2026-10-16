import { z } from 'zod';
import { cpfOuCnpjValido, cpfValido, somenteDigitos } from './documentos';
import { PERFIS } from './permissoes';

/** Data de hoje (AAAA-MM-DD) no fuso das fazendas. */
export function hojeISO(
  fuso = 'America/Sao_Paulo',
  agora = new Date(),
): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(agora);
}

const dataISO = z.iso.date({ error: 'Data inválida (use AAAA-MM-DD)' });
const texto = (min: number, max: number) => z.string().trim().min(min).max(max);
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'E-mail inválido' }));

// UC01: senha com 8 ou mais caracteres, com letra e número
const senha = z
  .string()
  .min(8, 'A senha precisa de pelo menos 8 caracteres')
  .max(128)
  .regex(/[A-Za-z]/, 'A senha precisa ter uma letra')
  .regex(/\d/, 'A senha precisa ter um número');

// ---------- Conta (UC01) ----------

export const cadastroUsuarioSchema = z.object({
  nome: texto(3, 120),
  email,
  telefone: textoOpcional(20),
  cpf: z
    .string()
    .optional()
    .transform((v) => (v ? somenteDigitos(v) : undefined))
    .refine((v) => v === undefined || cpfValido(v), 'CPF inválido'),
  senha,
  aceiteTermos: z.literal(true, {
    error: 'É preciso aceitar os termos de uso',
  }),
});
export type CadastroUsuario = z.infer<typeof cadastroUsuarioSchema>;

export const loginSchema = z.object({ email, senha: z.string().min(1) });
export type Login = z.infer<typeof loginSchema>;

export const tokenSchema = z.object({ token: z.string().min(20).max(200) });

// ---------- Fazenda (UC02) ----------

export const TIPOS_CRIACAO = ['corte'] as const;

export const fazendaSchema = z.object({
  nome: texto(2, 120),
  documento: z
    .string()
    .transform(somenteDigitos)
    .refine(cpfOuCnpjValido, 'CPF ou CNPJ inválido'),
  logradouro: textoOpcional(200),
  municipio: texto(2, 120),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'UF inválida'),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  integradora: textoOpcional(120),
  tipoCriacao: z.enum(TIPOS_CRIACAO).default('corte'),
});
export type NovaFazenda = z.input<typeof fazendaSchema>;

// O documento identifica a fazenda e não muda depois do cadastro.
export const edicaoFazendaSchema = fazendaSchema
  .omit({ documento: true })
  .partial();

// ---------- Galpão (UC03) ----------

export const TIPOS_GALPAO = [
  'convencional',
  'climatizado',
  'dark_house',
] as const;
export const SITUACOES_GALPAO = ['disponivel', 'ocupado', 'inativo'] as const;

export const galpaoSchema = z.object({
  identificacao: texto(1, 40),
  areaUtilM2: z
    .number()
    .positive('A área precisa ser maior que zero')
    .max(100_000),
  capacidadeAves: z
    .number()
    .int()
    .positive('A capacidade precisa ser maior que zero')
    .max(1_000_000),
  tipo: z.enum(TIPOS_GALPAO),
});
export type NovoGalpao = z.infer<typeof galpaoSchema>;

// "ocupado" só muda pelo lote (UC05/UC17); aqui só ativa ou inativa.
export const edicaoGalpaoSchema = galpaoSchema
  .partial()
  .extend({ situacao: z.enum(['disponivel', 'inativo']).optional() });

// ---------- Vínculo (UC04) ----------

export const conviteSchema = z
  .object({
    email,
    perfil: z.enum(PERFIS),
    crmv: textoOpcional(20),
    galpoes: z.array(z.uuid()).max(200).default([]),
    validoAte: dataISO.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.perfil === 'veterinario' && !v.crmv) {
      ctx.addIssue({
        code: 'custom',
        path: ['crmv'],
        message: 'CRMV é obrigatório para Veterinário',
      });
    }
    if (v.perfil !== 'veterinario' && v.crmv) {
      ctx.addIssue({
        code: 'custom',
        path: ['crmv'],
        message: 'CRMV só se aplica ao perfil Veterinário',
      });
    }
  });
export type Convite = z.input<typeof conviteSchema>;
