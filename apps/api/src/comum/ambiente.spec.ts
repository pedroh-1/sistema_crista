import { validarAmbiente } from './ambiente';

const base = {
  DATABASE_URL: 'postgresql://crista:crista@localhost:5432/crista',
  JWT_SECRET: 'troque-este-segredo',
  WEB_URL: 'http://localhost:4200',
};

const producao = {
  ...base,
  NODE_ENV: 'production',
  JWT_SECRET: 'x'.repeat(48),
  WEB_URL: 'https://crista.exemplo.com.br',
  SMTP_HOST: 'smtp.exemplo.com.br',
};

describe('validarAmbiente', () => {
  it('em desenvolvimento aceita os valores do .env.example', () => {
    const r = validarAmbiente(base);
    expect(r['ARMAZENAMENTO']).toBe('disco');
    expect(r['API_PORT']).toBe(3000);
  });

  it('em produção recusa o segredo de exemplo, http e falta de SMTP', () => {
    expect(() => validarAmbiente({ ...base, NODE_ENV: 'production' })).toThrow(
      /JWT_SECRET[\s\S]*WEB_URL[\s\S]*SMTP_HOST/,
    );
    expect(() => validarAmbiente(producao)).not.toThrow();
  });

  it('variável vazia vale como ausente', () => {
    const r = validarAmbiente({
      ...base,
      SMTP_HOST: '',
      SMTP_PORT: '',
      SMTP_SEGURO: '',
      ARMAZENAMENTO: '',
    });
    expect(r['ARMAZENAMENTO']).toBe('disco');
    expect(r['SMTP_HOST']).toBeUndefined();
  });

  it('S3 exige o bucket; usuário e senha do SMTP andam juntos', () => {
    expect(() => validarAmbiente({ ...base, ARMAZENAMENTO: 's3' })).toThrow(
      /S3_BUCKET/,
    );
    expect(() => validarAmbiente({ ...base, SMTP_USUARIO: 'crista' })).toThrow(
      /SMTP_SENHA/,
    );
  });
});
