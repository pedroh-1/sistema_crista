import {
  antesDaAquisicao,
  custoManutencao,
  edicaoEquipamentoSchema,
  equipamentoSchema,
  horasParado,
  manutencaoSchema,
  proximaPreventiva,
  situacaoPreventiva,
} from './equipamentos';

describe('equipamento (UC18)', () => {
  it('aceita equipamento sem galpão, série e data de aquisição', () => {
    const r = equipamentoSchema.safeParse({
      nome: 'Gerador 150 kVA',
      tipo: 'gerador',
    });
    expect(r.success).toBe(true);
    expect(r.data?.critico).toBe(false);
    expect(r.data?.numeroSerie).toBeUndefined();
  });

  it('recusa periodicidade zero ou fracionada', () => {
    const base = { nome: 'Exaustor 1', tipo: 'ventilacao' };
    expect(
      equipamentoSchema.safeParse({ ...base, periodicidadeDias: 0 }).success,
    ).toBe(false);
    expect(
      equipamentoSchema.safeParse({ ...base, periodicidadeDias: 7.5 }).success,
    ).toBe(false);
  });

  it('a edição nasce ativa quando a situação não vem', () => {
    const r = edicaoEquipamentoSchema.parse({
      nome: 'Fornalha',
      tipo: 'outro',
    });
    expect(r.situacao).toBe('ativo');
  });
});

describe('manutenção (UC19)', () => {
  const base = {
    tipo: 'corretiva',
    data: '2026-10-10',
    descricao: 'Troca do motor',
  };

  it('custos ausentes valem zero', () => {
    const r = manutencaoSchema.parse(base);
    expect(r.custoPecas).toBe(0);
    expect(r.custoMaoObra).toBe(0);
  });

  it('retorno exige parada e não pode ser antes dela', () => {
    const semParada = manutencaoSchema.safeParse({
      ...base,
      retornoOperacao: '2026-10-10T12:00:00.000Z',
    });
    expect(semParada.error?.issues[0].path).toEqual(['paradaInicio']);

    const invertido = manutencaoSchema.safeParse({
      ...base,
      paradaInicio: '2026-10-10T12:00:00.000Z',
      retornoOperacao: '2026-10-10T08:00:00.000Z',
    });
    expect(invertido.error?.issues[0].message).toBe(
      'O retorno não pode ser antes da parada',
    );

    expect(
      manutencaoSchema.safeParse({
        ...base,
        paradaInicio: '2026-10-10T08:00:00-03:00',
        retornoOperacao: '2026-10-10T12:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('soma o custo em centavos', () => {
    expect(custoManutencao(0.1, 0.2)).toBe(0.3);
    expect(custoManutencao(350, 0)).toBe(350);
  });

  it('data antes da aquisição só é barrada quando a aquisição existe', () => {
    expect(antesDaAquisicao('2026-01-01', '2026-02-01')).toBe(true);
    expect(antesDaAquisicao('2026-02-01', '2026-02-01')).toBe(false);
    expect(antesDaAquisicao('2026-01-01', null)).toBe(false);
  });

  it('conta as horas paradas', () => {
    const inicio = new Date('2026-10-10T08:00:00Z');
    expect(horasParado(inicio, new Date('2026-10-10T14:20:00Z'))).toBe(6);
    expect(horasParado(inicio, new Date('2026-10-10T07:00:00Z'))).toBe(0);
  });
});

describe('preventiva', () => {
  it('conta da última preventiva, senão da aquisição', () => {
    expect(proximaPreventiva(30, '2026-09-01', '2025-01-01')).toBe(
      '2026-10-01',
    );
    expect(proximaPreventiva(90, null, '2026-08-01')).toBe('2026-10-30');
  });

  it('sem periodicidade ou sem data de referência, não há previsão', () => {
    expect(proximaPreventiva(null, '2026-09-01', null)).toBeNull();
    expect(proximaPreventiva(30, null, null)).toBeNull();
  });

  it('classifica a situação pela data prevista', () => {
    const hoje = '2026-10-17';
    expect(situacaoPreventiva(null, hoje)).toBe('sem_previsao');
    expect(situacaoPreventiva('2026-10-16', hoje)).toBe('vencida');
    expect(situacaoPreventiva('2026-10-17', hoje)).toBe('vence_logo');
    expect(situacaoPreventiva('2026-10-24', hoje)).toBe('vence_logo');
    expect(situacaoPreventiva('2026-10-25', hoje)).toBe('em_dia');
  });
});
