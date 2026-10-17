import {
  despesaSchema,
  filtroPainelSchema,
  situacaoMeta,
  visaoSalvaSchema,
  valorNaCurva,
} from './custos';

const curva = [
  { idadeDias: 0, pesoG: 42, consumoAcumG: 0 },
  { idadeDias: 7, pesoG: 182, consumoAcumG: 170 },
  { idadeDias: 14, pesoG: 462, consumoAcumG: 530 },
];

describe('curva de referência', () => {
  it('usa o valor tabelado ou interpola entre os dias', () => {
    expect(valorNaCurva(curva, 7)).toBe(182);
    expect(valorNaCurva(curva, 10)).toBe(302);
    expect(valorNaCurva(curva, 10, 'consumoAcumG')).toBeCloseTo(324.29, 2);
  });

  it('fora da curva não há valor', () => {
    expect(valorNaCurva(curva, 15)).toBeNull();
    expect(valorNaCurva([], 7)).toBeNull();
  });

  it('classifica o desvio pela faixa de ±5%', () => {
    expect(situacaoMeta(-6)).toBe('abaixo');
    expect(situacaoMeta(4.9)).toBe('dentro');
    expect(situacaoMeta(5.1)).toBe('acima');
  });
});

describe('despesa (UC12)', () => {
  const base = {
    data: '2026-03-10',
    categoria: 'energia',
    descricao: 'Conta de luz',
    valor: 1500,
  };
  const lotes = [
    '01a146e6-0b90-738c-a3c8-eebb836c8dd3',
    '01a146e6-0b90-738c-a3c8-eebb836c8dd4',
  ];

  it('percentual exige um valor por lote somando 100%', () => {
    expect(
      despesaSchema.safeParse({ ...base, lotes, criterioRateio: 'percentual' })
        .success,
    ).toBe(false);
    expect(
      despesaSchema.safeParse({
        ...base,
        lotes,
        criterioRateio: 'percentual',
        percentuais: [60, 30],
      }).success,
    ).toBe(false);
    expect(
      despesaSchema.safeParse({
        ...base,
        lotes,
        criterioRateio: 'percentual',
        percentuais: [60, 40],
      }).success,
    ).toBe(true);
  });

  it('sem lote é despesa da fazenda', () => {
    expect(despesaSchema.parse(base).lotes).toEqual([]);
  });
});

describe('filtro do painel (UC15)', () => {
  const id = '01a146e6-0b90-738c-a3c8-eebb836c8dd3';

  it('aceita até 4 lotes e não mistura idade com data', () => {
    expect(
      filtroPainelSchema.safeParse({ lotes: [id, id, id, id, id].join(',') })
        .success,
    ).toBe(false);
    expect(
      filtroPainelSchema.safeParse({
        lotes: id,
        idadeAte: '21',
        de: '2026-03-01',
      }).success,
    ).toBe(false);
    expect(
      filtroPainelSchema.parse({ lotes: id, idadeAte: '21' }),
    ).toMatchObject({ lotes: [id], idadeAte: 21 });
  });
});

describe('visão salva do painel (UC15)', () => {
  const lote = '01990000-0000-7000-8000-000000000001';

  it('guarda só o período do modo escolhido', () => {
    const r = visaoSalvaSchema.parse({
      nome: 'Lotes de inverno',
      filtros: { lotes: [lote], modo: 'idade', idadeDe: 7, de: '2026-01-01' },
    });
    expect(r.filtros).toEqual({
      lotes: [lote],
      modo: 'idade',
      idadeDe: 7,
      idadeAte: undefined,
    });
  });

  it('exige de 1 a 4 lotes e um nome', () => {
    expect(
      visaoSalvaSchema.safeParse({ nome: 'X', filtros: { lotes: [lote] } })
        .success,
    ).toBe(false);
    expect(
      visaoSalvaSchema.safeParse({ nome: 'Vazia', filtros: { lotes: [] } })
        .success,
    ).toBe(false);
    expect(
      visaoSalvaSchema.safeParse({
        nome: 'Cinco',
        filtros: { lotes: Array(5).fill(lote) },
      }).success,
    ).toBe(false);
  });
});
