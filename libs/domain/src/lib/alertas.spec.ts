import {
  avaliarLimite,
  cargaSchema,
  limitesEfetivos,
  regraAlertaSchema,
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
