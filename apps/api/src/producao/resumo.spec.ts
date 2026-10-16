import { carenciaVigenteAte, EntradaResumo, resumoDoLote } from './resumo';

const base: EntradaResumo = {
  hoje: '2026-04-12',
  dataAlojamento: '2026-03-01',
  idadeInicialDias: 0,
  pesoPintoG: 42,
  areaUtilM2: 1500,
  alojamento: { avesRecebidas: 20000, mortasTransporte: 100 },
  baixas: [{ data: '2026-03-10', mortes: 796, descartes: 0 }],
  pesagens: [
    {
      data: '2026-04-12',
      avesPesadas: 2,
      pesoTotalG: 5800,
      pesos: [2900, 2900],
    },
  ],
  movimentosRacao: [
    { data: '2026-03-01', tipo: 'entrada', quantidadeKg: 94182.72 },
  ],
  ocorrencias: [],
};

describe('resumoDoLote', () => {
  it('reproduz o exemplo de referência do doc 03', () => {
    const r = resumoDoLote(base);
    expect(r.idadeDias).toBe(42);
    expect(r.saldoAves).toBe(19104);
    expect(r.mortalidade).toEqual({ disponivel: true, valor: 4 });
    expect(
      r.conversaoAlimentar.disponivel && r.conversaoAlimentar.valor,
    ).toBeCloseTo(1.7, 3);
    expect(r.iep.disponivel && r.iep.valor).toBeCloseTo(389.92, 2);
    expect(r.uniformidade).toEqual({ disponivel: true, valor: 100 });
  });

  it('sem alojamento, os indicadores ficam indisponíveis com o motivo', () => {
    const r = resumoDoLote({ ...base, alojamento: null, baixas: [] });
    expect(r.saldoAves).toBeNull();
    expect(r.mortalidade).toEqual({
      disponivel: false,
      motivo: 'Alojamento não registrado',
    });
    expect(r.iep.disponivel).toBe(false);
  });

  it('avalia a mortalidade de hoje sobre o saldo do início do dia', () => {
    const r = resumoDoLote({
      ...base,
      baixas: [
        ...base.baixas,
        { data: '2026-04-12', mortes: 100, descartes: 0 },
      ],
    });
    expect(
      r.mortalidadeHoje.percentual.disponivel &&
        r.mortalidadeHoje.percentual.valor,
    ).toBeCloseTo(0.523, 3);
    expect(r.mortalidadeHoje.nivel).toBe('critico');
  });
});

describe('carenciaVigenteAte', () => {
  it('devolve a maior carência que ainda não terminou', () => {
    const ocorrencias = [
      { data: '2026-04-01', carenciaDias: 5 },
      { data: '2026-04-10', carenciaDias: 7 },
      { data: '2026-04-11', carenciaDias: null },
    ];
    expect(carenciaVigenteAte(ocorrencias, '2026-04-12')).toBe('2026-04-17');
    expect(carenciaVigenteAte(ocorrencias, '2026-04-18')).toBeNull();
  });
});
