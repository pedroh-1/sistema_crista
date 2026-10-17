import { diasAtras, iniciarApi } from './apoio';

/** Fluxos da Fase 6 (UC18 equipamentos e UC19 manutenção) contra um banco real. */
describe('Fase 6: equipamentos e manutenção', () => {
  let t: Awaited<ReturnType<typeof iniciarApi>>;
  const api = () => t.api();

  let gestor: string;
  let produtor: string;
  let operador: string;
  let fazendaId: string;
  let galpaoA: string;
  let galpaoB: string;
  let galpaoVazio: string;
  let loteA: string;
  let loteB: string;
  let exaustor: string;
  let gerador: string;
  const hoje = diasAtras(0);
  const url = (caminho = '') => `/api/fazendas/${fazendaId}${caminho}`;
  const equip = (id: string, caminho = '') =>
    url(`/equipamentos/${id}${caminho}`);
  const horasAtras = (h: number) =>
    new Date(Date.now() - h * 36e5).toISOString();
  const despesasDaManutencao = async () =>
    (
      await api().get(url('/despesas')).auth(gestor, { type: 'bearer' })
    ).body.filter((d: { origem: string }) => d.origem === 'manutencao') as {
      id: string;
      valor: number;
      descricao: string;
      estorno: object | null;
      rateios: { loteId: string; valor: number }[];
    }[];

  async function novoGalpao(identificacao: string) {
    return (
      await api()
        .post(url('/galpoes'))
        .auth(gestor, { type: 'bearer' })
        .send({
          identificacao,
          areaUtilM2: 1000,
          capacidadeAves: 14000,
          tipo: 'climatizado',
        })
        .expect(201)
    ).body.id as string;
  }

  async function novoLote(codigo: string, galpaoId: string, aves: number) {
    const dataAlojamento = diasAtras(10);
    const r = await api()
      .post(url('/lotes'))
      .auth(gestor, { type: 'bearer' })
      .send({
        codigo,
        galpaoId,
        linhagem: 'cobb500',
        dataAlojamento,
        quantidadePrevista: aves,
      })
      .expect(201);
    await api()
      .post(url(`/lotes/${r.body.id}/alojamento`))
      .auth(gestor, { type: 'bearer' })
      .send({ data: dataAlojamento, avesRecebidas: aves })
      .expect(201);
    return r.body.id as string;
  }

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
          nome: 'Granja Equipamentos',
          documento: '11.222.333/0001-81',
          municipio: 'Chapecó',
          uf: 'SC',
        })
        .expect(201)
    ).body.id;
    galpaoA = await novoGalpao('A');
    galpaoB = await novoGalpao('B');
    galpaoVazio = await novoGalpao('C');
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
      { perfil: 'operador', galpoes: [galpaoA] },
    );
    loteA = await novoLote('A-1', galpaoA, 10000);
    loteB = await novoLote('B-1', galpaoB, 5000);
  });

  afterAll(() => t.app.close());

  describe('UC18: cadastro de equipamento', () => {
    it('Gestor e Produtor cadastram; o Operador não', async () => {
      const dados = {
        nome: 'Exaustor 1',
        tipo: 'ventilacao',
        galpaoId: galpaoA,
        numeroSerie: 'EX-001',
        periodicidadeDias: 30,
        dataAquisicao: diasAtras(100),
      };
      await api()
        .post(url('/equipamentos'))
        .auth(operador, { type: 'bearer' })
        .send(dados)
        .expect(403);
      const r = await api()
        .post(url('/equipamentos'))
        .auth(produtor, { type: 'bearer' })
        .send(dados)
        .expect(201);
      exaustor = r.body.id;
      // 100 dias desde a aquisição e periodicidade de 30: a preventiva venceu.
      expect(r.body).toMatchObject({
        galpao: 'A',
        critico: false,
        proximaPreventiva: diasAtras(70),
        situacaoPreventiva: 'vencida',
      });
    });

    it('número de série é único na fazenda; data futura e galpão alheio são recusados', async () => {
      await api()
        .post(url('/equipamentos'))
        .auth(gestor, { type: 'bearer' })
        .send({ nome: 'Exaustor 2', tipo: 'ventilacao', numeroSerie: 'ex-001' })
        .expect(409);
      await api()
        .post(url('/equipamentos'))
        .auth(gestor, { type: 'bearer' })
        .send({
          nome: 'Exaustor 2',
          tipo: 'ventilacao',
          dataAquisicao: diasAtras(-3),
        })
        .expect(400);
      await api()
        .post(url('/equipamentos'))
        .auth(gestor, { type: 'bearer' })
        .send({
          nome: 'Exaustor 2',
          tipo: 'ventilacao',
          galpaoId: '01990000-0000-7000-8000-000000000000',
        })
        .expect(400);
    });

    it('equipamento sem galpão e sem data de aquisição não tem previsão de preventiva', async () => {
      const r = await api()
        .post(url('/equipamentos'))
        .auth(gestor, { type: 'bearer' })
        .send({
          nome: 'Gerador 150 kVA',
          tipo: 'gerador',
          critico: true,
          periodicidadeDias: 90,
        })
        .expect(201);
      gerador = r.body.id;
      expect(r.body).toMatchObject({
        galpaoId: null,
        situacaoPreventiva: 'sem_previsao',
      });
    });

    it('quem vê só alguns galpões vê os equipamentos deles e os da fazenda', async () => {
      await api()
        .post(url('/equipamentos'))
        .auth(gestor, { type: 'bearer' })
        .send({ nome: 'Aquecedor B', tipo: 'aquecimento', galpaoId: galpaoB })
        .expect(201);
      const lista = await api()
        .get(url('/equipamentos'))
        .auth(operador, { type: 'bearer' })
        .expect(200);
      expect(lista.body.map((e: { nome: string }) => e.nome).sort()).toEqual([
        'Exaustor 1',
        'Gerador 150 kVA',
      ]);
    });
  });

  describe('UC19: manutenção', () => {
    it('custo de equipamento do galpão vai para o lote do galpão', async () => {
      await api()
        .post(equip(exaustor, '/manutencoes'))
        .auth(operador, { type: 'bearer' })
        .send({
          tipo: 'corretiva',
          data: hoje,
          descricao: 'Troca da correia',
          custoPecas: 300,
          custoMaoObra: 200.1,
        })
        .expect(201);
      const [despesa] = await despesasDaManutencao();
      expect(despesa).toMatchObject({
        valor: 500.1,
        descricao: 'Manutenção corretiva: Exaustor 1',
        rateios: [{ loteId: loteA, valor: 500.1 }],
      });
    });

    it('a despesa da manutenção não é estornada sozinha', async () => {
      const [despesa] = await despesasDaManutencao();
      await api()
        .post(url(`/despesas/${despesa.id}/estornar`))
        .auth(gestor, { type: 'bearer' })
        .send({ motivo: 'Errado' })
        .expect(409);
    });

    it('equipamento da fazenda: custo rateado entre os lotes ativos pelas aves alojadas', async () => {
      // O Operador só vê o galpão A, mas o rateio é feito pelo sistema.
      await api()
        .post(equip(gerador, '/manutencoes'))
        .auth(operador, { type: 'bearer' })
        .send({
          tipo: 'preventiva',
          data: hoje,
          descricao: 'Troca de óleo e filtros',
          custoPecas: 900,
          custoMaoObra: 600,
        })
        .expect(201);
      const despesa = (await despesasDaManutencao()).find(
        (d) => d.valor === 1500,
      );
      expect(
        Object.fromEntries(despesa!.rateios.map((r) => [r.loteId, r.valor])),
      ).toEqual({ [loteA]: 1000, [loteB]: 500 });
    });

    it('sem lote ativo no galpão, a despesa fica com a fazenda', async () => {
      const silo = (
        await api()
          .post(url('/equipamentos'))
          .auth(gestor, { type: 'bearer' })
          .send({
            nome: 'Rosca do silo',
            tipo: 'comedouro',
            galpaoId: galpaoVazio,
          })
          .expect(201)
      ).body.id;
      await api()
        .post(equip(silo, '/manutencoes'))
        .auth(gestor, { type: 'bearer' })
        .send({
          tipo: 'corretiva',
          data: hoje,
          descricao: 'Motor',
          custoPecas: 80,
        })
        .expect(201);
      const despesa = (await despesasDaManutencao()).find(
        (d) => d.valor === 80,
      );
      expect(despesa?.rateios).toEqual([]);
    });

    it('a data não pode ser antes da aquisição, quando ela existe', async () => {
      await api()
        .post(equip(exaustor, '/manutencoes'))
        .auth(gestor, { type: 'bearer' })
        .send({
          tipo: 'preventiva',
          data: diasAtras(101),
          descricao: 'Revisão',
        })
        .expect(400);
      // O gerador não tem data de aquisição: a regra não se aplica.
      await api()
        .post(equip(gerador, '/manutencoes'))
        .auth(gestor, { type: 'bearer' })
        .send({ tipo: 'corretiva', data: diasAtras(400), descricao: 'Bateria' })
        .expect(201);
    });

    it('a preventiva renova a previsão; o Operador não vê custos', async () => {
      await api()
        .post(equip(exaustor, '/manutencoes'))
        .auth(gestor, { type: 'bearer' })
        .send({ tipo: 'preventiva', data: hoje, descricao: 'Lubrificação' })
        .expect(201);
      const r = await api()
        .get(equip(exaustor))
        .auth(operador, { type: 'bearer' })
        .expect(200);
      expect(r.body).toMatchObject({
        proximaPreventiva: diasAtras(-30),
        situacaoPreventiva: 'em_dia',
        custoTotal: null,
      });
      const doGestor = await api()
        .get(equip(exaustor))
        .auth(gestor, { type: 'bearer' })
        .expect(200);
      expect(doGestor.body.custoTotal).toBe(500.1);
    });
  });

  describe('Equipamento crítico parado (UC16 + UC19)', () => {
    let parada: string;
    const alertasDeEquipamento = async (status = 'aberto', token = gestor) =>
      (
        await api()
          .get(url(`/alertas?status=${status}`))
          .auth(token, { type: 'bearer' })
          .expect(200)
      ).body.filter(
        (a: { indicador: string }) => a.indicador === 'equipamento_parado',
      );

    it('parada sem retorno abre alerta crítico, notificado ao Gestor e ao Produtor', async () => {
      const r = await api()
        .post(equip(gerador, '/manutencoes'))
        .auth(operador, { type: 'bearer' })
        .send({
          tipo: 'corretiva',
          data: hoje,
          descricao: 'Não parte',
          paradaInicio: horasAtras(3),
        })
        .expect(201);
      parada = r.body.id;
      expect(await alertasDeEquipamento()).toEqual([]);

      await t.processarFila();
      const [alerta] = await alertasDeEquipamento('aberto', operador);
      expect(alerta).toMatchObject({
        criticidade: 'critico',
        equipamentoId: gerador,
        valor: 3,
      });
      expect(
        t.emails
          .filter((e) => e.assunto.includes('Alerta crítico'))
          .map((e) => e.para)
          .sort(),
      ).toEqual(['gestor@granja.com', 'produtor@granja.com']);
      const equipamento = await api()
        .get(equip(gerador))
        .auth(gestor, { type: 'bearer' })
        .expect(200);
      expect(equipamento.body.paradoDesde).not.toBeNull();
    });

    it('o resumo da fazenda mostra a parada e só os lotes dos galpões do vínculo', async () => {
      const doGestor = await api()
        .get(url('/resumo'))
        .auth(gestor, { type: 'bearer' })
        .expect(200);
      expect(doGestor.body).toMatchObject({
        saldoAves: 15000,
        galpoes: { total: 3, ocupados: 2 },
        alertas: { abertos: 1, criticos: 1 },
        equipamentosParados: { total: 1, criticos: 1 },
      });
      expect(
        doGestor.body.lotes.map((l: { codigo: string }) => l.codigo).sort(),
      ).toEqual(['A-1', 'B-1']);
      expect(doGestor.body.lotes[0]).toMatchObject({
        idadeDias: 10,
        situacaoMeta: null,
        alertas: { abertos: 0, criticos: 0 },
      });

      const doOperador = await api()
        .get(url('/resumo'))
        .auth(operador, { type: 'bearer' })
        .expect(200);
      expect(doOperador.body).toMatchObject({
        lotes: [{ codigo: 'A-1', galpao: 'A', saldoAves: 10000 }],
        saldoAves: 10000,
        galpoes: { total: 1, ocupados: 1 },
        // O gerador é da fazenda: quem vê só o galpão A também vê a parada.
        equipamentosParados: { total: 1, criticos: 1 },
      });
    });

    it('não abre outra parada enquanto a anterior não tiver retorno', () =>
      api()
        .post(equip(gerador, '/manutencoes'))
        .auth(gestor, { type: 'bearer' })
        .send({
          tipo: 'corretiva',
          data: hoje,
          descricao: 'Outra',
          paradaInicio: horasAtras(1),
        })
        .expect(409));

    it('a manutenção só aceita, uma vez, o registro do retorno', async () => {
      await expect(
        t.prisma.manutencao.update({
          where: { id: parada },
          data: { descricao: 'Alterada' },
        }),
      ).rejects.toThrow();
      await api()
        .post(equip(gerador, `/manutencoes/${parada}/retorno`))
        .auth(operador, { type: 'bearer' })
        .send({ retornoOperacao: horasAtras(4) })
        .expect(400);
      await api()
        .post(equip(gerador, `/manutencoes/${parada}/retorno`))
        .auth(operador, { type: 'bearer' })
        .send({ retornoOperacao: horasAtras(0) })
        .expect(204);
      await api()
        .post(equip(gerador, `/manutencoes/${parada}/retorno`))
        .auth(operador, { type: 'bearer' })
        .send({ retornoOperacao: horasAtras(0) })
        .expect(409);
    });

    it('o retorno fecha o alerta pelo sistema', async () => {
      await t.processarFila();
      expect(await alertasDeEquipamento()).toEqual([]);
      const [fechado] = await alertasDeEquipamento('fechado');
      expect(fechado.providencia).toBe(
        'Retorno à operação registrado na manutenção',
      );
    });

    it('equipamento não crítico parado não gera alerta', async () => {
      await api()
        .post(equip(exaustor, '/manutencoes'))
        .auth(gestor, { type: 'bearer' })
        .send({
          tipo: 'corretiva',
          data: hoje,
          descricao: 'Motor queimado',
          paradaInicio: horasAtras(2),
        })
        .expect(201);
      await t.processarFila();
      expect(await alertasDeEquipamento()).toEqual([]);
    });
  });

  describe('Estorno da manutenção', () => {
    it('estorna a despesa junto e some do custo do equipamento', async () => {
      const lista = await api()
        .get(equip(exaustor, '/manutencoes'))
        .auth(gestor, { type: 'bearer' })
        .expect(200);
      const comCusto = lista.body.find(
        (m: { custoTotal: number }) => m.custoTotal === 500.1,
      );
      await api()
        .post(equip(exaustor, `/manutencoes/${comCusto.id}/estornar`))
        .auth(operador, { type: 'bearer' })
        .send({ motivo: 'Lançada no equipamento errado' })
        .expect(204);
      await api()
        .post(equip(exaustor, `/manutencoes/${comCusto.id}/estornar`))
        .auth(operador, { type: 'bearer' })
        .send({ motivo: 'De novo' })
        .expect(409);

      const despesa = (await despesasDaManutencao()).find(
        (d) => d.valor === 500.1,
      );
      expect(despesa?.estorno).not.toBeNull();
      const equipamento = await api()
        .get(equip(exaustor))
        .auth(gestor, { type: 'bearer' })
        .expect(200);
      expect(equipamento.body.custoTotal).toBe(0);
      const auditoria = await t.prisma.eventoAuditoria.findMany({
        where: { entidade: 'manutencao', acao: 'estornar' },
      });
      expect(auditoria).toHaveLength(1);
    });
  });

  describe('Edição do cadastro', () => {
    it('não aceita data de aquisição depois de uma manutenção já registrada', async () => {
      await api()
        .put(equip(gerador))
        .auth(gestor, { type: 'bearer' })
        .send({
          nome: 'Gerador 150 kVA',
          tipo: 'gerador',
          dataAquisicao: diasAtras(30),
        })
        .expect(400);
    });

    it('deixar de ser crítico fecha o alerta aberto', async () => {
      await api()
        .post(equip(gerador, '/manutencoes'))
        .auth(gestor, { type: 'bearer' })
        .send({
          tipo: 'corretiva',
          data: hoje,
          descricao: 'Parou de novo',
          paradaInicio: horasAtras(1),
        })
        .expect(201);
      await t.processarFila();
      expect(await alertasDeEquipamento()).toHaveLength(1);

      await api()
        .put(equip(gerador))
        .auth(produtor, { type: 'bearer' })
        .send({ nome: 'Gerador 150 kVA', tipo: 'gerador', critico: false })
        .expect(200);
      await t.processarFila();
      expect(await alertasDeEquipamento()).toEqual([]);
    });

    async function alertasDeEquipamento() {
      return (
        await api()
          .get(url('/alertas?status=aberto'))
          .auth(gestor, { type: 'bearer' })
          .expect(200)
      ).body.filter(
        (a: { indicador: string }) => a.indicador === 'equipamento_parado',
      );
    }
  });
});
