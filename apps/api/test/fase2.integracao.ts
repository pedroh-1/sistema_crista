import { diasAtras, iniciarApi } from './apoio';

/** Fluxos da Fase 2 (UC05 a UC10, ração, estorno e anexos) contra um banco PostgreSQL real. */
describe('Fase 2: ciclo produtivo', () => {
  let t: Awaited<ReturnType<typeof iniciarApi>>;
  const api = () => t.api();

  let gestor: string;
  let operador: string;
  let veterinario: string;
  let fazendaId: string;
  let galpaoA: string;
  let galpaoB: string;
  let loteA: string;
  let loteB: string;
  const alojamento = diasAtras(20);
  const url = (caminho = '') => `/api/fazendas/${fazendaId}${caminho}`;
  const lote = (id: string, caminho = '') => url(`/lotes/${id}${caminho}`);

  beforeAll(async () => {
    t = await iniciarApi();
    gestor = await t.criarUsuario('gestor@granja.com', 'Gestor');
    operador = await t.criarUsuario('operador@granja.com', 'Operador');
    veterinario = await t.criarUsuario('vet@granja.com', 'Veterinária');

    const fazenda = await api()
      .post('/api/fazendas')
      .auth(gestor, { type: 'bearer' })
      .send({
        nome: 'Granja Ciclo',
        documento: '11.222.333/0001-81',
        municipio: 'Concórdia',
        uf: 'SC',
      })
      .expect(201);
    fazendaId = fazenda.body.id;
    const novoGalpao = async (identificacao: string) =>
      (
        await api()
          .post(url('/galpoes'))
          .auth(gestor, { type: 'bearer' })
          .send({
            identificacao,
            areaUtilM2: 1500,
            capacidadeAves: 21000,
            tipo: 'climatizado',
          })
          .expect(201)
      ).body.id as string;
    galpaoA = await novoGalpao('A');
    galpaoB = await novoGalpao('B');

    await t.vincular(
      gestor,
      fazendaId,
      { token: operador, email: 'operador@granja.com' },
      { perfil: 'operador', galpoes: [galpaoA] },
    );
    await t.vincular(
      gestor,
      fazendaId,
      { token: veterinario, email: 'vet@granja.com' },
      { perfil: 'veterinario', crmv: 'SC-1234' },
    );
  });

  afterAll(() => t.app.close());

  describe('UC05: cadastrar lote', () => {
    const novoLote = (galpaoId: string, extra: object = {}) => ({
      codigo: `L-${galpaoId.slice(-4)}`,
      galpaoId,
      linhagem: 'cobb500',
      dataAlojamento: alojamento,
      pesoPintoG: 42,
      custoPinto: 3,
      quantidadePrevista: 20000,
      ...extra,
    });

    it('só o Gestor cadastra lote', () =>
      api()
        .post(url('/lotes'))
        .auth(operador, { type: 'bearer' })
        .send(novoLote(galpaoA))
        .expect(403));

    it('não aceita data de alojamento no futuro', () =>
      api()
        .post(url('/lotes'))
        .auth(gestor, { type: 'bearer' })
        .send(novoLote(galpaoA, { dataAlojamento: diasAtras(-1) }))
        .expect(400));

    it('cadastra o lote e ocupa o galpão', async () => {
      const r = await api()
        .post(url('/lotes'))
        .auth(gestor, { type: 'bearer' })
        .send(novoLote(galpaoA))
        .expect(201);
      loteA = r.body.id;
      expect(r.body).toMatchObject({
        situacao: 'em_andamento',
        idadeInicialDias: 0,
        dataAlojamento: alojamento,
      });
      const galpao = await api()
        .get(url(`/galpoes/${galpaoA}`))
        .auth(gestor, { type: 'bearer' })
        .expect(200);
      expect(galpao.body.situacao).toBe('ocupado');
    });

    it('um lote em andamento por galpão', () =>
      api()
        .post(url('/lotes'))
        .auth(gestor, { type: 'bearer' })
        .send(novoLote(galpaoA, { codigo: 'OUTRO' }))
        .expect(409));

    it('acima da capacidade pede confirmação de densidade', async () => {
      const semConfirmar = await api()
        .post(url('/lotes'))
        .auth(gestor, { type: 'bearer' })
        .send(novoLote(galpaoB, { quantidadePrevista: 25000 }))
        .expect(409);
      expect(semConfirmar.body.codigo).toBe('DENSIDADE');
      const r = await api()
        .post(url('/lotes'))
        .auth(gestor, { type: 'bearer' })
        .send(
          novoLote(galpaoB, {
            quantidadePrevista: 25000,
            confirmarDensidade: true,
          }),
        )
        .expect(201);
      loteB = r.body.id;
    });

    it('o Operador só vê os lotes dos galpões permitidos', async () => {
      const r = await api()
        .get(url('/lotes'))
        .auth(operador, { type: 'bearer' })
        .expect(200);
      expect(r.body.map((l: { id: string }) => l.id)).toEqual([loteA]);
      await api()
        .get(lote(loteB))
        .auth(operador, { type: 'bearer' })
        .expect(404);
    });
  });

  describe('UC06: alojamento', () => {
    it('baixa antes do alojamento é recusada', () =>
      api()
        .post(lote(loteA, '/baixas'))
        .auth(operador, { type: 'bearer' })
        .send({ data: alojamento, mortes: 5 })
        .expect(409));

    it('divergência da quantidade prevista exige justificativa', async () => {
      const r = await api()
        .post(lote(loteA, '/alojamento'))
        .auth(operador, { type: 'bearer' })
        .send({ data: alojamento, avesRecebidas: 20100, mortasTransporte: 100 })
        .expect(400);
      expect(r.body.erros[0].campo).toBe('justificativaDivergencia');
    });

    it('registra o alojamento uma única vez', async () => {
      const r = await api()
        .post(lote(loteA, '/alojamento'))
        .auth(operador, { type: 'bearer' })
        .send({
          data: alojamento,
          avesRecebidas: 20100,
          mortasTransporte: 100,
          justificativaDivergencia: 'Bônus do incubatório',
        })
        .expect(201);
      expect(r.body).toMatchObject({
        avesRecebidas: 20100,
        mortasTransporte: 100,
      });
      await api()
        .post(lote(loteA, '/alojamento'))
        .auth(operador, { type: 'bearer' })
        .send({ data: alojamento, avesRecebidas: 20000 })
        .expect(409);
    });

    it('acima da capacidade só o Gestor confirma', async () => {
      const dados = { data: alojamento, avesRecebidas: 25000 };
      const r = await api()
        .post(lote(loteB, '/alojamento'))
        .auth(gestor, { type: 'bearer' })
        .send(dados)
        .expect(409);
      expect(r.body.codigo).toBe('DENSIDADE');
      await api()
        .post(lote(loteB, '/alojamento'))
        .auth(gestor, { type: 'bearer' })
        .send({ ...dados, confirmarDensidade: true })
        .expect(201);
    });
  });

  describe('UC07: baixa diária', () => {
    let primeiraBaixa: string;

    it('soma várias baixas no mesmo dia e informa o nível de mortalidade', async () => {
      const dia = diasAtras(10);
      const r1 = await api()
        .post(lote(loteA, '/baixas'))
        .auth(operador, { type: 'bearer' })
        .send({ data: dia, mortes: 20, causaProvavel: 'Ascite' })
        .expect(201);
      primeiraBaixa = r1.body.id;
      const r2 = await api()
        .post(lote(loteA, '/baixas'))
        .auth(gestor, { type: 'bearer' })
        .send({ data: dia, mortes: 15, descartes: 5 })
        .expect(201);
      expect(r2.body).toMatchObject({
        totalDoDia: 40,
        saldoAves: 19960,
        nivel: 'normal',
      });
    });

    it('não deixa a baixa passar do saldo', () =>
      api()
        .post(lote(loteA, '/baixas'))
        .auth(operador, { type: 'bearer' })
        .send({ data: diasAtras(9), mortes: 30000 })
        .expect(409));

    it('não aceita data antes do alojamento nem no futuro', async () => {
      await api()
        .post(lote(loteA, '/baixas'))
        .auth(operador, { type: 'bearer' })
        .send({ data: diasAtras(21), mortes: 1 })
        .expect(400);
      await api()
        .post(lote(loteA, '/baixas'))
        .auth(operador, { type: 'bearer' })
        .send({ data: diasAtras(-1), mortes: 1 })
        .expect(400);
    });

    it('a correção é um estorno: o lançamento continua no histórico e sai do saldo', async () => {
      await api()
        .post(lote(loteA, '/estornos'))
        .auth(operador, { type: 'bearer' })
        .send({
          entidade: 'baixa',
          idEvento: primeiraBaixa,
          motivo: 'Lançado em dobro',
        })
        .expect(204);
      await api()
        .post(lote(loteA, '/estornos'))
        .auth(operador, { type: 'bearer' })
        .send({ entidade: 'baixa', idEvento: primeiraBaixa, motivo: 'De novo' })
        .expect(409);

      const baixas = await api()
        .get(lote(loteA, '/baixas'))
        .auth(operador, { type: 'bearer' })
        .expect(200);
      expect(baixas.body).toHaveLength(2);
      expect(
        baixas.body.find((b: { id: string }) => b.id === primeiraBaixa).estorno
          .motivo,
      ).toBe('Lançado em dobro');

      const resumo = await api()
        .get(lote(loteA))
        .auth(operador, { type: 'bearer' })
        .expect(200);
      expect(resumo.body.resumo).toMatchObject({
        avesAlojadas: 20000,
        baixasAcumuladas: 20,
        saldoAves: 19980,
      });
    });

    it('o banco não deixa alterar nem apagar eventos', async () => {
      await expect(
        t.prisma.eventoBaixa.update({
          where: { id: primeiraBaixa },
          data: { mortes: 1 },
        }),
      ).rejects.toThrow();
      await expect(
        t.prisma.eventoBaixa.delete({ where: { id: primeiraBaixa } }),
      ).rejects.toThrow();
    });
  });

  describe('UC10: pesagem amostral', () => {
    it('calcula peso médio e uniformidade e avisa amostra pequena', async () => {
      const r = await api()
        .post(lote(loteA, '/pesagens'))
        .auth(operador, { type: 'bearer' })
        .send({
          data: diasAtras(7),
          pesosIndividuaisG: [900, 1000, 1000, 1100, 1300],
        })
        .expect(201);
      expect(r.body).toMatchObject({
        avesPesadas: 5,
        pesoMedioG: 1060,
        amostraMinima: 50,
        baixaRepresentatividade: true,
      });
      // média 1060 g: faixa de 954 a 1166 g contém 3 das 5 aves
      expect(r.body.uniformidade).toEqual({ disponivel: true, valor: 60 });
    });

    it('pede revisão quando o peso cai em relação à pesagem anterior', async () => {
      const dados = {
        data: diasAtras(1),
        avesPesadas: 60,
        pesoTotalG: 60 * 900,
      };
      const r = await api()
        .post(lote(loteA, '/pesagens'))
        .auth(operador, { type: 'bearer' })
        .send(dados)
        .expect(409);
      expect(r.body.codigo).toBe('REVISAO_PESAGEM');
      await api()
        .post(lote(loteA, '/pesagens'))
        .auth(operador, { type: 'bearer' })
        .send({ ...dados, confirmarRevisao: true })
        .expect(201);
    });
  });

  describe('Ração e indicadores do lote', () => {
    it('com ração e pesagem, a conversão alimentar fica disponível', async () => {
      await api()
        .post(lote(loteA, '/racao'))
        .auth(operador, { type: 'bearer' })
        .send({
          data: alojamento,
          tipo: 'entrada',
          quantidadeKg: 30000,
          notaFiscal: '123',
        })
        .expect(201);
      await api()
        .post(lote(loteA, '/racao'))
        .auth(operador, { type: 'bearer' })
        .send({
          data: diasAtras(1),
          tipo: 'estoque_restante',
          quantidadeKg: 5000,
        })
        .expect(201);

      const r = await api()
        .get(lote(loteA))
        .auth(gestor, { type: 'bearer' })
        .expect(200);
      expect(r.body.resumo.racaoConsumidaKg).toEqual({
        disponivel: true,
        valor: 25000,
      });
      expect(r.body.resumo.conversaoAlimentar.disponivel).toBe(true);
      expect(r.body.resumo.iep.disponivel).toBe(true);
    });
  });

  describe('UC08 e UC09: sanidade e anexos', () => {
    let vacina: string;

    it('só o Veterinário registra ocorrência', () =>
      api()
        .post(lote(loteA, '/ocorrencias'))
        .auth(operador, { type: 'bearer' })
        .send({ data: diasAtras(2), tipo: 'inspecao', descricao: 'Visita' })
        .expect(403));

    it('vacinação exige os dados do produto e calcula o fim da carência', async () => {
      await api()
        .post(lote(loteA, '/ocorrencias'))
        .auth(veterinario, { type: 'bearer' })
        .send({ data: diasAtras(2), tipo: 'vacinacao', descricao: 'Newcastle' })
        .expect(400);
      const r = await api()
        .post(lote(loteA, '/ocorrencias'))
        .auth(veterinario, { type: 'bearer' })
        .send({
          data: diasAtras(2),
          tipo: 'medicacao',
          descricao: 'Tratamento respiratório',
          produto: 'Enrofloxacina',
          dose: '10 mg/kg',
          via: 'agua',
          loteProduto: 'ENR-77',
          carenciaDias: 7,
        })
        .expect(201);
      vacina = r.body.id;
      expect(r.body).toMatchObject({
        dataFimCarencia: diasAtras(-5),
        carenciaVigente: true,
      });
    });

    it('anexa PDF, recusa outros formatos e devolve o arquivo', async () => {
      const pdf = Buffer.from('%PDF-1.4\nlaudo de teste\n%%EOF');
      const r = await api()
        .post(url('/anexos'))
        .auth(veterinario, { type: 'bearer' })
        .field('entidade', 'ocorrencia')
        .field('idEntidade', vacina)
        .attach('arquivo', pdf, 'laudo.pdf')
        .expect(201);
      expect(r.body).toMatchObject({
        nome: 'laudo.pdf',
        mime: 'application/pdf',
      });

      await api()
        .post(url('/anexos'))
        .auth(veterinario, { type: 'bearer' })
        .field('entidade', 'ocorrencia')
        .field('idEntidade', vacina)
        .attach('arquivo', Buffer.from('texto qualquer'), 'falso.pdf')
        .expect(400);

      const arquivo = await api()
        .get(url(`/anexos/${r.body.id}`))
        .auth(operador, { type: 'bearer' })
        .expect(200);
      expect(arquivo.headers['content-type']).toBe('application/pdf');
      expect(Buffer.from(arquivo.body).equals(pdf)).toBe(true);
    });

    it('UC09: histórico com filtro de carência vigente', async () => {
      await api()
        .post(lote(loteA, '/ocorrencias'))
        .auth(veterinario, { type: 'bearer' })
        .send({
          data: diasAtras(1),
          tipo: 'inspecao',
          descricao: 'Cama úmida no fundo do galpão',
        })
        .expect(201);

      const todas = await api()
        .get(lote(loteA, '/ocorrencias'))
        .auth(operador, { type: 'bearer' })
        .expect(200);
      expect(todas.body.ocorrencias).toHaveLength(2);
      expect(todas.body.emCarencia).toEqual([
        {
          produto: 'Enrofloxacina',
          dataFimCarencia: diasAtras(-5),
          idOcorrencia: vacina,
        },
      ]);

      const vigentes = await api()
        .get(lote(loteA, '/ocorrencias?carenciaVigente=true'))
        .auth(operador, { type: 'bearer' })
        .expect(200);
      expect(
        vigentes.body.ocorrencias.map((o: { id: string }) => o.id),
      ).toEqual([vacina]);
      expect(vigentes.body.ocorrencias[0].anexos).toHaveLength(1);

      const resumo = await api()
        .get(lote(loteA))
        .auth(gestor, { type: 'bearer' })
        .expect(200);
      expect(resumo.body.resumo.carenciaAte).toBe(diasAtras(-5));
    });
  });

  describe('Cancelamento de lote', () => {
    it('lote com lançamentos não pode ser cancelado', () =>
      api()
        .post(lote(loteA, '/cancelar'))
        .auth(gestor, { type: 'bearer' })
        .send({ motivo: 'Teste' })
        .expect(409));

    it('lote sem lançamentos é cancelado e libera o galpão', async () => {
      await t.prisma.$executeRawUnsafe('TRUNCATE producao.alojamento');
      await api()
        .post(lote(loteB, '/cancelar'))
        .auth(gestor, { type: 'bearer' })
        .send({ motivo: 'Cadastrado no galpão errado' })
        .expect(204);
      const galpao = await api()
        .get(url(`/galpoes/${galpaoB}`))
        .auth(gestor, { type: 'bearer' })
        .expect(200);
      expect(galpao.body.situacao).toBe('disponivel');
    });
  });
});
