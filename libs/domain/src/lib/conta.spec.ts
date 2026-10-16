import { cnpjValido, cpfValido } from './documentos';
import { pode } from './permissoes';
import {
  cadastroUsuarioSchema,
  conviteSchema,
  fazendaSchema,
  hojeISO,
} from './schemas';

describe('documentos', () => {
  it('valida CPF', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
  });

  it('valida CNPJ', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-80')).toBe(false);
  });
});

describe('permissões', () => {
  it('segue a matriz do doc 02', () => {
    expect(pode('gestor', 'vinculo.gerenciar')).toBe(true);
    expect(pode('operador', 'vinculo.gerenciar')).toBe(false);
    expect(pode('veterinario', 'sanidade.registrar')).toBe(true);
    expect(pode('gestor', 'sanidade.registrar')).toBe(false);
    expect(pode('operador', 'financeiro.ver')).toBe(false);
  });
});

describe('cadastro de usuário (UC01)', () => {
  const valido = {
    nome: 'Maria Souza',
    email: ' Maria@Exemplo.com ',
    senha: 'galinha123',
    aceiteTermos: true,
  };

  it('normaliza o e-mail', () => {
    expect(cadastroUsuarioSchema.parse(valido).email).toBe('maria@exemplo.com');
  });

  it('exige letra e número na senha', () => {
    expect(
      cadastroUsuarioSchema.safeParse({ ...valido, senha: '12345678' }).success,
    ).toBe(false);
    expect(
      cadastroUsuarioSchema.safeParse({ ...valido, senha: 'abcdefgh' }).success,
    ).toBe(false);
  });

  it('exige aceite dos termos', () => {
    expect(
      cadastroUsuarioSchema.safeParse({ ...valido, aceiteTermos: false })
        .success,
    ).toBe(false);
  });
});

describe('fazenda (UC02)', () => {
  it('guarda o documento só com dígitos', () => {
    const fazenda = fazendaSchema.parse({
      nome: 'Granja Boa Vista',
      documento: '11.222.333/0001-81',
      municipio: 'Chapecó',
      uf: 'sc',
    });
    expect(fazenda.documento).toBe('11222333000181');
    expect(fazenda.uf).toBe('SC');
    expect(fazenda.tipoCriacao).toBe('corte');
  });
});

describe('convite (UC04)', () => {
  it('exige CRMV só para Veterinário', () => {
    expect(
      conviteSchema.safeParse({ email: 'v@x.com', perfil: 'veterinario' })
        .success,
    ).toBe(false);
    expect(
      conviteSchema.safeParse({
        email: 'v@x.com',
        perfil: 'veterinario',
        crmv: 'SC-1234',
      }).success,
    ).toBe(true);
    expect(
      conviteSchema.safeParse({
        email: 'o@x.com',
        perfil: 'operador',
        crmv: 'SC-1234',
      }).success,
    ).toBe(false);
  });
});

describe('hojeISO', () => {
  it('usa o fuso de São Paulo', () => {
    // 02:00 UTC de 10/03 ainda é 09/03 em São Paulo
    expect(hojeISO('America/Sao_Paulo', new Date('2026-03-10T02:00:00Z'))).toBe(
      '2026-03-09',
    );
  });
});
