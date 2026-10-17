import {
  avaliarLimite,
  cargaSchema,
  limitesEfetivos,
  regraAlertaSchema,
  serieMortalidadeDia,
} from './alertas';

describe('alertas (UC16)', () => {
  it('avalia pelo sentido do indicador', () => {
    expect(avaliarLimite(0.35, { atencao: 0.3, critico: 0.5 }, 'acima')).toBe(
      'atencao',
    );
    expect(avaliarLimite(0.6, { atencao: 0.3, critico: 0.5 }, 'acima')).toBe(
      'critico',
    );
    expect(avaliarLimite(-7, { atencao: -5, critico: -10 }, 'abaixo')).toBe(
      'atencao',
    );
    expect(avaliarLimite(65, { atencao: 80, critico: 70 }, 'abaixo')).toBe(
      'critico',
    );
    expect(avaliarLimite(85, { atencao: 80, critico: 70 }, 'abaixo')).toBe(
      'normal',
    );
  });

  it('dobra o limite padrão de mortalidade na primeira semana, mas não o configurado', () => {
    expect(limitesEfetivos('mortalidade_dia', null, 5)).toEqual({
      atencao: 0.6,
      critico: 1,
    });
    expect(limitesEfetivos('mortalidade_dia', null, 20)).toEqual({
      atencao: 0.3,
      critico: 0.5,
    });
    expect(
      limitesEfetivos('mortalidade_dia', { atencao: 0.2, critico: 0.4 }, 5),
    ).toEqual({ atencao: 0.2, critico: 0.4 });
  });

  it('exige o limite crítico além do de atenção', () => {
    expect(
      regraAlertaSchema.safeParse({
        indicador: 'mortalidade_dia',
        limiteAtencao: 0.5,
        limiteCritico: 0.3,
      }).success,
    ).toBe(false);
    expect(
      regraAlertaSchema.safeParse({
        indicador: 'uniformidade',
        limiteAtencao: 80,
        limiteCritico: 70,
      }).success,
    ).toBe(true);
  });
});

describe('mortalidade por dia (E5)', () => {
  const lote = {
    dataAlojamento: '2026-03-01',
    idadeInicialDias: 0,
    avesAlojadas: 10000,
    baixas: [
      { data: '2026-03-12', mortes: 10, descartes: 0 },
      { data: '2026-03-03', mortes: 50, descartes: 5 },
      { data: '2026-03-03', mortes: 10, descartes: 0 },
      { data: '2026-03-11', mortes: 30, descartes: 5 },
    ],
    cargas: [{ data: '2026-03-11', aves: 4935 }],
  };

  it('soma os lançamentos do dia e divide pelo saldo do início do dia', () => {
    const serie = serieMortalidadeDia(lote, null);
    expect(serie.map((p) => [p.data, p.idadeDias, p.baixas])).toEqual([
      ['2026-03-03', 2, 65],
      ['2026-03-11', 10, 35],
      ['2026-03-12', 11, 10],
    ]);
    expect(serie[0].percentual).toBeCloseTo(0.65);
    expect(serie[1].percentual).toBeCloseTo((35 / 9935) * 100);
    // A carga do dia 11 só sai do saldo a partir do dia seguinte
    expect(serie[2].percentual).toBeCloseTo((10 / 4965) * 100);
  });

  it('usa o limite dobrado na primeira semana e o configurado como está', () => {
    const padrao = serieMortalidadeDia(lote, null);
    expect(padrao[0].limites).toEqual({ atencao: 0.6, critico: 1 });
    expect(padrao[0].nivel).toBe('atencao');
    expect(padrao[1].limites).toEqual({ atencao: 0.3, critico: 0.5 });
    expect(padrao[2].nivel).toBe('normal');

    const configurado = serieMortalidadeDia(lote, {
      atencao: 0.2,
      critico: 0.4,
    });
    expect(configurado[0].nivel).toBe('critico');
    expect(configurado[2].nivel).toBe('atencao');
  });

  it('pula o dia sem aves no início', () => {
    const vazio = serieMortalidadeDia(
      { ...lote, avesAlojadas: 0, cargas: [] },
      null,
    );
    expect(vazio).toEqual([]);
  });
});

describe('carga de saída (UC17)', () => {
  it('exige aves e peso', () => {
    expect(
      cargaSchema.safeParse({ data: '2026-04-12', aves: 0, pesoTotalKg: 100 })
        .success,
    ).toBe(false);
    expect(
      cargaSchema.safeParse({
        data: '2026-04-12',
        aves: 5000,
        pesoTotalKg: 14500,
        precoKg: 6.2,
      }).success,
    ).toBe(true);
  });
});
