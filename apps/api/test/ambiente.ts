// Aponta a API para o banco de teste antes de qualquer módulo ser carregado.
// Variáveis do processo têm precedência sobre o .env no ConfigModule.
const url =
  process.env['DATABASE_URL_TEST'] ??
  'postgresql://crista:crista@localhost:5432/crista_test';
if (!url.includes('test'))
  throw new Error('DATABASE_URL_TEST precisa apontar para um banco de teste');

process.env['DATABASE_URL'] = url;
process.env['JWT_SECRET'] ??= 'segredo-dos-testes';
process.env['WEB_URL'] = 'http://web.teste';
process.env['SMTP_HOST'] = '';
