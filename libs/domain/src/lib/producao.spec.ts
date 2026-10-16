import {
  alojamentoSchema,
  avaliarMortalidadeDia,
  baixaSchema,
  dataFimCarencia,
  motivoRevisaoPesagem,
  ocorrenciaSchema,
  pesagemSchema,
  racaoConsumidaKg,
} from './producao';

describe('schemas do ciclo produtivo', () => {
  it('alojamento: mortas no transporte não passam das recebidas', () => {
    expect(
      alojamentoSchema.safeParse({
        data: '2026-03-01',
        avesRecebidas: 10,
        mortasTransporte: 11,
      }).success,
    ).toBe(false);
  });

  it('baixa precisa de mortes ou descartes', () => {
    expect(
      baixaSchema.safeParse({ data: '2026-03-02', mortes: 0 }).success,
    ).toBe(false);
    expect(
      baixaSchema.safeParse({ data: '2026-03-02', mortes: 0, descartes: 2 })
        .success,
    ).toBe(true);
  });

  it('pesagem aceita pesos individuais ou totais', () => {
    expect(
      pesagemSchema.safeParse({
        data: '2026-03-08',
        pesosIndividuaisG: [180, 190],
      }).success,
    ).toBe(true);
    expect(
      pesagemSchema.safeParse({
        data: '2026-03-08',
        avesPesadas: 50,
        pesoTotalG: 9000,
      }).success,
    ).toBe(true);
    expect(pesagemSchema.safeParse({ data: '2026-03-08' }).success).toBe(false);
  });

  it('vacinação exige produto, dose, via, lote e carência', () => {
    const r = ocorrenciaSchema.safeParse({
      data: '2026-03-05',
      tipo: 'vacinacao',
      descricao: 'Gumboro',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path[0])).toEqual([
        'produto',
        'dose',
        'via',
        'loteProduto',
        'carenciaDias',
      ]);
    }
    expect(
      ocorrenciaSchema.safeParse({
        data: '2026-03-05',
        tipo: 'inspecao',
        descricao: 'Visita',
      }).success,
    ).toBe(true);
  });
});

describe('regras do ciclo produtivo', () => {
  it('fim da carência soma os dias', () => {
    expect(dataFimCarencia('2026-03-25', 10)).toBe('2026-04-04');
  });

  it('mortalidade do dia usa limites em dobro na primeira semana', () => {
    expect(avaliarMortalidadeDia(0.4, 3)).toBe('normal');
    expect(avaliarMortalidadeDia(0.4, 20)).toBe('atencao');
    expect(avaliarMortalidadeDia(0.6, 20)).toBe('critico');
  });

  it('pede revisão de pesagem com queda de peso ou ganho implausível', () => {
    const anterior = { data: '2026-03-08', pesoMedioG: 190 };
    expect(
      motivoRevisaoPesagem(anterior, { data: '2026-03-15', pesoMedioG: 500 }),
    ).toBeNull();
    expect(
      motivoRevisaoPesagem(anterior, { data: '2026-03-15', pesoMedioG: 180 }),
    ).toContain('abaixo');
    expect(
      motivoRevisaoPesagem(anterior, { data: '2026-03-15', pesoMedioG: 1500 }),
    ).toContain('plausível');
    expect(
      motivoRevisaoPesagem(null, { data: '2026-03-15', pesoMedioG: 500 }),
    ).toBeNull();
  });

  it('ração consumida desconta o último estoque informado', () => {
    expect(racaoConsumidaKg([])).toBeNull();
    expect(
      racaoConsumidaKg([
        { data: '2026-03-01', tipo: 'entrada', quantidadeKg: 10000 },
        { data: '2026-03-20', tipo: 'entrada', quantidadeKg: 15000 },
        { data: '2026-03-10', tipo: 'estoque_restante', quantidadeKg: 4000 },
        { data: '2026-03-25', tipo: 'estoque_restante', quantidadeKg: 3000 },
      ]),
    ).toBe(22000);
  });
});
