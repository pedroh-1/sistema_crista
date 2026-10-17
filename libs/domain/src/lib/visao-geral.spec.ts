import { PontoMortalidadeDia } from './alertas';
import {
  filtroVisaoGeralSchema,
  indicadoresDaFazenda,
  LoteParaAgregar,
  mortalidadeDiariaDaFazenda,
  piorNivel,
  relatorioFazendaSchema,
  tomDaMeta,
  tomDoDesvioPeso,
  tomDoNivel,
} from './visao-geral';

const lote = (dados: Partial<LoteParaAgregar>): LoteParaAgregar => ({
  situacao: 'em_andamento',
  avesAlojadas: null,
  baixasAcumuladas: 0,
  saldoAves: null,
  racaoConsumidaKg: null,
  pesoVivoProduzidoKg: null,
  iep: null,
  situacaoMeta: null,
  custoTotal: null,
  margem: null,
  ...dados,
});

describe('tom dos indicadores', () => {
  it('só pinta de verde o que está dentro do limite', () => {
    expect(tomDoNivel('normal')).toBe('sucesso');
    expect(tomDoNivel('atencao')).toBe('atencao');
    expect(tomDoNivel('critico')).toBe('critico');
    expect(tomDoNivel(null)).toBe('neutro');
  });

  it('peso: o limite configurado manda; fora da faixa sem passar dele pede atenção', () => {
    const limites = { atencao: -5, critico: -10 };
    expect(tomDoDesvioPeso(-2, limites)).toBe('sucesso');
    expect(tomDoDesvioPeso(-7, limites)).toBe('atencao');
    expect(tomDoDesvioPeso(-12, limites)).toBe('critico');
    expect(tomDoDesvioPeso(8, limites)).toBe('atencao');
    // Limite afrouxado pela fazenda: -7% já não é alerta, mas segue fora da meta.
    expect(tomDoDesvioPeso(-7, { atencao: -8, critico: -15 })).toBe('atencao');
    expect(tomDaMeta(null, null)).toBe('neutro');
  });

  it('pior nível de vários lotes', () => {
    expect(piorNivel([])).toBe('normal');
    expect(piorNivel(['normal', 'critico', 'atencao'])).toBe('critico');
  });
});

describe('indicadores da fazenda', () => {
  it('pondera mortalidade e conversão pelos lotes, sem média de porcentagens', () => {
    const r = indicadoresDaFazenda([
      lote({
        avesAlojadas: 10000,
        baixasAcumuladas: 500,
        saldoAves: 9500,
        racaoConsumidaKg: 30000,
        pesoVivoProduzidoKg: 20000,
        iep: 350,
        situacaoMeta: 'dentro',
        custoTotal: 50000,
        margem: 10000,
      }),
      lote({
        situacao: 'encerrado',
        avesAlojadas: 30000,
        baixasAcumuladas: 600,
        saldoAves: 0,
        racaoConsumidaKg: 90000,
        pesoVivoProduzidoKg: 55000,
        iep: 400,
        situacaoMeta: 'abaixo',
        custoTotal: 150000,
      }),
    ]);
    // 1.100 baixas ÷ 40.000 aves = 2,75% (a média das porcentagens daria 3,5%).
    expect(r.mortalidade).toEqual({ disponivel: true, valor: 2.75 });
    expect(r.viabilidade).toEqual({ disponivel: true, valor: 97.25 });
    expect(r.conversaoAlimentar).toEqual({ disponivel: true, valor: 1.6 });
    expect(r.iepMedio).toEqual({ disponivel: true, valor: 375 });
    expect(r.plantelAtual).toBe(9500);
    expect(r.lotes).toEqual({ total: 2, emAndamento: 1, encerrados: 1 });
    expect(r.meta).toEqual({ dentro: 1, abaixo: 1, acima: 0, semPesagem: 0 });
    expect(r.custoTotal).toBe(200000);
    expect(r.margem).toBe(10000);
  });

  it('sem lote alojado, os indicadores ficam indisponíveis com o motivo', () => {
    const r = indicadoresDaFazenda([lote({})]);
    expect(r.avesAlojadas).toBeNull();
    expect(r.mortalidade.disponivel).toBe(false);
    expect(r.conversaoAlimentar.disponivel).toBe(false);
    expect(r.custoTotal).toBeNull();
  });
});

describe('mortalidade diária da fazenda', () => {
  const ponto = (
    data: string,
    baixas: number,
    avesInicioDia: number,
    nivel: PontoMortalidadeDia['nivel'],
  ): PontoMortalidadeDia => ({
    data,
    idadeDias: 10,
    baixas,
    avesInicioDia,
    percentual: (baixas / avesInicioDia) * 100,
    limites: { atencao: 0.3, critico: 0.5 },
    nivel,
  });

  it('soma baixas e saldo dos lotes no mesmo dia e corta no período', () => {
    const serie = mortalidadeDiariaDaFazenda(
      [
        [
          ponto('2026-10-01', 10, 10000, 'normal'),
          ponto('2026-10-02', 60, 9990, 'critico'),
        ],
        [
          ponto('2026-10-02', 20, 20000, 'normal'),
          ponto('2026-10-09', 5, 19980, 'normal'),
        ],
      ],
      '2026-10-02',
      '2026-10-08',
    );
    expect(serie).toHaveLength(1);
    expect(serie[0]).toMatchObject({
      data: '2026-10-02',
      baixas: 80,
      avesInicioDia: 29990,
      nivel: 'critico',
      lotes: 2,
    });
    expect(serie[0].percentual).toBeCloseTo(0.267, 3);
  });
});

describe('filtros', () => {
  it('recusa período invertido e aplica a situação padrão', () => {
    expect(
      filtroVisaoGeralSchema.safeParse({ de: '2026-10-10', ate: '2026-10-01' })
        .success,
    ).toBe(false);
    expect(filtroVisaoGeralSchema.parse({}).situacao).toBe('todos');
  });

  it('relatório: todas as seções quando não informa, e só as válidas', () => {
    expect(relatorioFazendaSchema.parse({ formato: 'pdf' }).secoes).toEqual([
      'atencao',
      'mortalidade',
      'lotes',
      'custos',
    ]);
    expect(
      relatorioFazendaSchema.parse({ formato: 'xlsx', secoes: 'lotes' }).secoes,
    ).toEqual(['lotes']);
    expect(
      relatorioFazendaSchema.safeParse({ formato: 'pdf', secoes: 'outra' })
        .success,
    ).toBe(false);
  });
});
