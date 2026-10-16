import { diasAtras, iniciarApi } from './apoio';

/** Fluxos da Fase 4 (UC11 a UC15: curva, despesas, indicadores e painel) contra um banco real. */
describe('Fase 4: curva, custos e painel', () => {
  let t: Awaited<ReturnType<typeof iniciarApi>>;
  const api = () => t.api();

  let gestor: string;
  let produtor: string;
  let operador: string;
  let fazendaId: string;
  let loteA: string;
  let loteB: string;
  const alojamento = diasAtras(21);
  const url = (caminho = '') => `/api/fazendas/${fazendaId}${caminho}`;
  const lote = (id: string, caminho = '') => url(`/lotes/${id}${caminho}`);
  const despesa = (extra: object = {}) => ({
    data: diasAtras(1),
    categoria: 'energia',
    descricao: 'Conta de luz',
    valor: 1000,
    ...extra,
  });

  beforeAll(async () => {
    t = await iniciarApi();
    gestor = await t.criarUsuario('gestor@granja.com', 'Gestor');
    produtor = await t.criarUsuario('produtor@granja.com', 'Produtor');
    operador = await t.criarUsuario('operador@granja.com', 'Operador');

    fazendaId = (
      await api()
        .post('/api/fazendas')
        .auth(gestor, { type: 'bearer' })
        .send({
          nome: 'Granja Custos',
          documento: '11.222.333/0001-81',
          municipio: 'Concórdia',
          uf: 'SC',
        })
        .expect(201)
    ).body.id;

    const novoLote = async (
      identificacao: string,
      linhagem: string,
      aves: number,
    ) => {
      const galpao = await api()
        .post(url('/galpoes'))
        .auth(gestor, { type: 'bearer' })
        .send({
          identificacao,
          areaUtilM2: 1500,
          capacidadeAves: 21000,
          tipo: 'climatizado',
        })
        .expect(201);
      const criado = await api()
        .post(url('/lotes'))
        .auth(gestor, { type: 'bearer' })
        .send({
          codigo: `L-${identificacao}`,
          galpaoId: galpao.body.id,
          linhagem,
          dataAlojamento: alojamento,
          custoPinto: 3,
          pesoPintoG: 42,
          quantidadePrevista: aves,
        })
        .expect(201);
      await api()
        .post(lote(criado.body.id, '/alojamento'))
        .auth(gestor, { type: 'bearer' })
        .send({ data: alojamento, avesRecebidas: aves })
        .expect(201);
      return {
        lote: criado.body.id as string,
        galpao: galpao.body.id as string,
      };
    };
    const a = await novoLote('A', 'cobb500', 20000);
    loteA = a.lote;
    loteB = (await novoLote('B', 'ross308', 10000)).lote;

    await t.vincular(
      gestor,
      fazendaId,
      { token: produtor, email: 'produtor@granja.com' },
      { perfil: 'produtor' },
    );
    await t.vincular(
      gestor,
      fazendaId,
      { token: operador, email: 'operador@granja.com' },
      { perfil: 'operador', galpoes: [a.galpao] },
    );
  });

  afterAll(() => t.app.close());

  describe('UC11 e UC13: curva de peso e meta', () => {
    it('compara a pesagem com a curva da linhagem na mesma idade', async () => {
      // A curva de teste (cobb500) tem 460 g aos 14 dias
      await api()
        .post(lote(loteA, '/pesagens'))
        .auth(operador, { type: 'bearer' })
        .send({ data: diasAtras(7), avesPesadas: 50, pesoTotalG: 50 * 460 })
        .expect(201);

      const curva = await api()
        .get(lote(loteA, '/curva'))
        .auth(operador, { type: 'bearer' })
        .expect(200);
      expect(curva.body.fonteCurva).toBe('sintetico');
      expect(curva.body.pesagens[0]).toMatchObject({
        idadeDias: 14,
        pesoMedioG: 460,
        pesoPadraoG: 460,
        desvioPct: 0,
        situacao: 'dentro',
      });
      expect(curva.body.curvaPadrao).toHaveLength(29); // 0 a 28 dias (idade de hoje + 7)

      const detalhe = await api()
        .get(lote(loteA))
        .auth(operador, { type: 'bearer' })
        .expect(200);
      expect(detalhe.body.meta).toMatchObject({
        idadeDias: 14,
        pesoPadraoG: 460,
        situacao: 'dentro',
      });
    });
  });

  describe('UC12: despesas e rateio', () => {
    it('o Operador não lança despesa', () =>
      api()
        .post(url('/despesas'))
        .auth(operador, { type: 'bearer' })
        .send(despesa())
        .expect(403));

    it('rateia por aves alojadas e fecha o valor exato', async () => {
      const r = await api()
        .post(url('/despesas'))
        .auth(produtor, { type: 'bearer' })
        .send(
          despesa({
            lotes: [loteA, loteB],
            fornecedor: 'Celesc',
            numeroNota: '555',
          }),
        )
        .expect(201);
      expect(r.body.rateios.map((p: { valor: number }) => p.valor)).toEqual([
        666.67, 333.33,
      ]);
    });

    it('avisa nota repetida do mesmo fornecedor e aceita com confirmação', async () => {
      const dados = despesa({
        lotes: [loteA],
        fornecedor: 'celesc',
        numeroNota: '555',
      });
      const r = await api()
        .post(url('/despesas'))
        .auth(produtor, { type: 'bearer' })
        .send(dados)
        .expect(409);
      expect(r.body.codigo).toBe('DUPLICIDADE');
      await api()
        .post(url('/despesas'))
        .auth(produtor, { type: 'bearer' })
        .send({ ...dados, confirmarDuplicidade: true })
        .expect(201);
    });

    it('rateio percentual e por consumo de ração', async () => {
      const r = await api()
        .post(url('/despesas'))
        .auth(gestor, { type: 'bearer' })
        .send(
          despesa({
            categoria: 'cama',
            lotes: [loteA, loteB],
            criterioRateio: 'percentual',
            percentuais: [70, 30],
          }),
        )
        .expect(201);
      expect(r.body.rateios.map((p: { valor: number }) => p.valor)).toEqual([
        700, 300,
      ]);

      const semRacao = await api()
        .post(url('/despesas'))
        .auth(gestor, { type: 'bearer' })
        .send(
          despesa({ lotes: [loteA, loteB], criterioRateio: 'consumo_racao' }),
        )
        .expect(400);
      expect(semRacao.body.erros[0].campo).toBe('lotes');
    });

    it('despesa sem lote fica na fazenda', async () => {
      const r = await api()
        .post(url('/despesas'))
        .auth(gestor, { type: 'bearer' })
        .send(despesa({ categoria: 'outros', descricao: 'Contador' }))
        .expect(201);
      expect(r.body.rateios).toEqual([]);
    });

    it('entrega de ração com valor gera a despesa, e o estorno da entrega estorna as duas', async () => {
      const entrega = await api()
        .post(lote(loteA, '/racao'))
        .auth(gestor, { type: 'bearer' })
        .send({
          data: diasAtras(2),
          tipo: 'entrada',
          quantidadeKg: 1000,
          valorTotal: 1800,
          fornecedor: 'Rações Vale',
          notaFiscal: 'R-1',
        })
        .expect(201);

      const despesas = await api()
        .get(url(`/despesas?lote=${loteA}`))
        .auth(produtor, { type: 'bearer' })
        .expect(200);
      const daRacao = despesas.body.find(
        (d: { origem: string }) => d.origem === 'racao',
      );
      expect(daRacao).toMatchObject({ categoria: 'racao', valor: 1800 });
      await api()
        .post(url(`/despesas/${daRacao.id}/estornar`))
        .auth(gestor, { type: 'bearer' })
        .send({ motivo: 'Teste' })
        .expect(409);

      await api()
        .post(lote(loteA, '/estornos'))
        .auth(gestor, { type: 'bearer' })
        .send({
          entidade: 'racao',
          idEvento: entrega.body.id,
          motivo: 'Nota errada',
        })
        .expect(204);
      const depois = await api()
        .get(url(`/despesas?lote=${loteA}`))
        .auth(produtor, { type: 'bearer' })
        .expect(200);
      expect(
        depois.body.find((d: { id: string }) => d.id === daRacao.id).estorno,
      ).not.toBeNull();
    });

    it('o Operador não vê as despesas', () =>
      api()
        .get(url('/despesas'))
        .auth(operador, { type: 'bearer' })
        .expect(403));
  });

  describe('UC14: indicadores financeiros', () => {
    it('soma pintos e parcelas; receita só com preço de referência', async () => {
      const antes = await api()
        .get(lote(loteA, '/financeiro'))
        .auth(produtor, { type: 'bearer' })
        .expect(200);
      // pintos 60.000 + energia 666,67 + energia duplicada confirmada 1.000 + cama 700 (ração estornada)
      expect(antes.body.custoPintos).toBe(60000);
      expect(antes.body.custoTotal).toBeCloseTo(62366.67, 2);
      expect(antes.body.custoPorAveAlojada).toEqual({
        disponivel: true,
        valor: expect.closeTo(3.1183, 4),
      });
      expect(antes.body.receitaPrevista).toEqual({
        disponivel: false,
        motivo: 'Preço de venda não informado',
      });
      expect(antes.body.porCategoria[0]).toMatchObject({
        categoria: 'pintos',
        valor: 60000,
      });

      await api()
        .put(lote(loteA, '/preco'))
        .auth(produtor, { type: 'bearer' })
        .send({ precoReferenciaKg: 6.5 })
        .expect(204);
      const depois = await api()
        .get(lote(loteA, '/financeiro'))
        .auth(produtor, { type: 'bearer' })
        .expect(200);
      expect(depois.body.precoReferenciaKg).toBe(6.5);
      expect(depois.body.receitaPrevista.disponivel).toBe(true);
      expect(depois.body.margem.disponivel).toBe(true);
    });

    it('o Operador não vê o financeiro', () =>
      api()
        .get(lote(loteA, '/financeiro'))
        .auth(operador, { type: 'bearer' })
        .expect(403));
  });

  describe('UC15: painel comparativo', () => {
    it('compara lotes e avisa linhagens diferentes e curva de teste', async () => {
      const r = await api()
        .get(url(`/painel?lotes=${loteA},${loteB}`))
        .auth(produtor, { type: 'bearer' })
        .expect(200);
      expect(r.body.lotes.map((l: { codigo: string }) => l.codigo)).toEqual([
        'L-A',
        'L-B',
      ]);
      expect(r.body.avisos).toHaveLength(2);
      expect(r.body.financeiroVisivel).toBe(true);
      expect(r.body.lotes[0].financeiro.custoPintos).toBe(60000);
    });

    it('o período por idade corta os dados', async () => {
      const r = await api()
        .get(url(`/painel?lotes=${loteA}&idadeAte=10`))
        .auth(gestor, { type: 'bearer' })
        .expect(200);
      const a = r.body.lotes[0];
      expect(a.periodo.fim).toBe(diasAtras(11));
      expect(a.resumo.idadeDias).toBe(10);
      expect(a.series.peso).toEqual([]);
    });

    it('recusa mais de 4 lotes e filtro por idade e data juntos', async () => {
      const cinco = [loteA, loteB, loteA, loteB, loteA].join(',');
      await api()
        .get(url(`/painel?lotes=${cinco}`))
        .auth(gestor, { type: 'bearer' })
        .expect(400);
      await api()
        .get(url(`/painel?lotes=${loteA}&idadeAte=10&de=${alojamento}`))
        .auth(gestor, { type: 'bearer' })
        .expect(400);
    });

    it('o Operador não usa o painel', () =>
      api()
        .get(url(`/painel?lotes=${loteA}`))
        .auth(operador, { type: 'bearer' })
        .expect(403));
  });
});
