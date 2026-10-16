import { diasAtras, iniciarApi } from './apoio';

/** Fluxos da Fase 5 (UC16 alertas e UC17 encerramento) contra um banco real. */
describe('Fase 5: alertas e encerramento', () => {
  let t: Awaited<ReturnType<typeof iniciarApi>>;
  const api = () => t.api();

  let gestor: string;
  let operador: string;
  let veterinario: string;
  let fazendaId: string;
  let galpao: string;
  let loteA: string;
  const hoje = diasAtras(0);
  const url = (caminho = '') => `/api/fazendas/${fazendaId}${caminho}`;
  const lote = (id: string, caminho = '') => url(`/lotes/${id}${caminho}`);
  const alertasAbertos = async () =>
    (
      await api()
        .get(url('/alertas?status=aberto'))
        .auth(gestor, { type: 'bearer' })
        .expect(200)
    ).body as {
      id: string;
      indicador: string;
      criticidade: string;
      limitePadrao: boolean;
      valor: number;
    }[];
  const emailsDeAlerta = () =>
    t.emails.filter((e) => e.assunto.includes('Alerta crítico'));

  async function novoLote(
    codigo: string,
    dataAlojamento: string,
    aves: number,
  ) {
    const r = await api()
      .post(url('/lotes'))
      .auth(gestor, { type: 'bearer' })
      .send({
        codigo,
        galpaoId: galpao,
        linhagem: 'cobb500',
        dataAlojamento,
        custoPinto: 3,
        pesoPintoG: 42,
        quantidadePrevista: aves,
      })
      .expect(201);
    await api()
      .post(lote(r.body.id, '/alojamento'))
      .auth(gestor, { type: 'bearer' })
      .send({ data: dataAlojamento, avesRecebidas: aves })
      .expect(201);
    await api()
      .post(lote(r.body.id, '/racao'))
      .auth(gestor, { type: 'bearer' })
      .send({
        data: dataAlojamento,
        tipo: 'entrada',
        quantidadeKg: aves * 2,
        valorTotal: aves * 3.6,
      })
      .expect(201);
    return r.body.id as string;
  }

  beforeAll(async () => {
    t = await iniciarApi();
    gestor = await t.criarUsuario('gestor@granja.com', 'Gestor');
    operador = await t.criarUsuario('operador@granja.com', 'Operador');
    veterinario = await t.criarUsuario('vet@granja.com', 'Veterinária');
    fazendaId = (
      await api()
        .post('/api/fazendas')
        .auth(gestor, { type: 'bearer' })
        .send({
          nome: 'Granja Alertas',
          documento: '11.222.333/0001-81',
          municipio: 'Concórdia',
          uf: 'SC',
        })
        .expect(201)
    ).body.id;
    galpao = (
      await api()
        .post(url('/galpoes'))
        .auth(gestor, { type: 'bearer' })
        .send({
          identificacao: 'A',
          areaUtilM2: 1500,
          capacidadeAves: 21000,
          tipo: 'climatizado',
        })
        .expect(201)
    ).body.id;
    await t.vincular(
      gestor,
      fazendaId,
      { token: operador, email: 'operador@granja.com' },
      { perfil: 'operador' },
    );
    await t.vincular(
      gestor,
      fazendaId,
      { token: veterinario, email: 'vet@granja.com' },
      { perfil: 'veterinario', crmv: 'SC-1' },
    );
    loteA = await novoLote('A-1', diasAtras(20), 10000);
  });

  afterAll(() => t.app.close());

  describe('UC16: alertas de desvio', () => {
    it('a baixa só grava a tarefa; o alerta nasce quando a fila roda', async () => {
      // 60 de 10.000 = 0,6%: acima do limite crítico padrão (0,5%) aos 20 dias
      await api()
        .post(lote(loteA, '/baixas'))
        .auth(operador, { type: 'bearer' })
        .send({ data: hoje, mortes: 60 })
        .expect(201);
      expect(await alertasAbertos()).toEqual([]);

      await t.processarFila();
      const alertas = await alertasAbertos();
      expect(alertas).toHaveLength(1);
      expect(alertas[0]).toMatchObject({
        indicador: 'mortalidade_dia',
        criticidade: 'critico',
        limitePadrao: true,
      });
    });

    it('alerta crítico notifica Gestor e Veterinário por e-mail, não o Operador', () => {
      expect(
        emailsDeAlerta()
          .map((e) => e.para)
          .sort(),
      ).toEqual(['gestor@granja.com', 'vet@granja.com']);
    });

    it('novo desvio atualiza o alerta aberto e não notifica de novo', async () => {
      await api()
        .post(lote(loteA, '/baixas'))
        .auth(operador, { type: 'bearer' })
        .send({ data: hoje, mortes: 10 })
        .expect(201);
      await t.processarFila();
      const alertas = await alertasAbertos();
      expect(alertas).toHaveLength(1);
      expect(alertas[0].valor).toBeCloseTo(0.7, 4);
      expect(emailsDeAlerta()).toHaveLength(2);
    });

    it('fechar exige a providência e a permissão', async () => {
      const [alerta] = await alertasAbertos();
      await api()
        .post(url(`/alertas/${alerta.id}/fechar`))
        .auth(operador, { type: 'bearer' })
        .send({ providencia: 'Vi' })
        .expect(403);
      await api()
        .post(url(`/alertas/${alerta.id}/fechar`))
        .auth(veterinario, { type: 'bearer' })
        .send({})
        .expect(400);
      await api()
        .post(url(`/alertas/${alerta.id}/fechar`))
        .auth(veterinario, { type: 'bearer' })
        .send({ providencia: 'Necropsia feita; ajustada a ventilação mínima' })
        .expect(204);
      expect(await alertasAbertos()).toEqual([]);
      const fechados = await api()
        .get(url('/alertas?status=fechado'))
        .auth(operador, { type: 'bearer' })
        .expect(200);
      expect(fechados.body[0]).toMatchObject({
        providencia: 'Necropsia feita; ajustada a ventilação mínima',
        fechadoPor: 'Veterinária',
      });
    });

    it('limites configurados valem no lugar do padrão; atenção não notifica', async () => {
      await api()
        .put(url('/regras-alerta'))
        .auth(operador, { type: 'bearer' })
        .send({
          indicador: 'mortalidade_dia',
          limiteAtencao: 0.5,
          limiteCritico: 1,
        })
        .expect(403);
      await api()
        .put(url('/regras-alerta'))
        .auth(gestor, { type: 'bearer' })
        .send({
          indicador: 'mortalidade_dia',
          limiteAtencao: 1,
          limiteCritico: 0.5,
        })
        .expect(400);
      const regras = await api()
        .put(url('/regras-alerta'))
        .auth(gestor, { type: 'bearer' })
        .send({
          indicador: 'mortalidade_dia',
          limiteAtencao: 0.5,
          limiteCritico: 1,
        })
        .expect(200);
      expect(
        regras.body.find(
          (r: { indicador: string }) => r.indicador === 'mortalidade_dia',
        ).configurado,
      ).toEqual({ atencao: 0.5, critico: 1 });

      // Mais 8 descartes hoje: 78 de 10.000 = 0,78%. Crítico pelo padrão (0,5%),
      // mas só atenção pelo limite configurado (crítico em 1%).
      await api()
        .post(lote(loteA, '/baixas'))
        .auth(operador, { type: 'bearer' })
        .send({ data: hoje, mortes: 0, descartes: 8 })
        .expect(201);
      await t.processarFila();
      const [alerta] = await alertasAbertos();
      expect(alerta).toMatchObject({
        indicador: 'mortalidade_dia',
        criticidade: 'atencao',
        limitePadrao: false,
      });
      expect(emailsDeAlerta()).toHaveLength(2);

      await api()
        .delete(url('/regras-alerta/mortalidade_dia'))
        .auth(gestor, { type: 'bearer' })
        .expect(200);
    });

    it('pesagem muito abaixo da curva abre alerta de peso', async () => {
      // Curva de teste cobb500 aos 20 dias ≈ 837 g; 600 g fica ~28% abaixo
      await api()
        .post(lote(loteA, '/pesagens'))
        .auth(operador, { type: 'bearer' })
        .send({
          data: hoje,
          pesosIndividuaisG: Array.from({ length: 50 }, () => 600),
        })
        .expect(201);
      await t.processarFila();
      const peso = (await alertasAbertos()).find(
        (a) => a.indicador === 'desvio_peso',
      );
      expect(peso).toMatchObject({ criticidade: 'critico' });
      expect(peso?.valor).toBeLessThan(-25);
    });
  });

  describe('UC17: saída e encerramento', () => {
    let carencia: string;

    it('carência vigente bloqueia a saída para abate', async () => {
      carencia = (
        await api()
          .post(lote(loteA, '/ocorrencias'))
          .auth(veterinario, { type: 'bearer' })
          .send({
            data: hoje,
            tipo: 'medicacao',
            descricao: 'Antibiótico',
            produto: 'Enrofloxacina',
            dose: '10 mg/kg',
            via: 'agua',
            loteProduto: 'X1',
            carenciaDias: 5,
          })
          .expect(201)
      ).body.id;
      const r = await api()
        .post(lote(loteA, '/cargas'))
        .auth(gestor, { type: 'bearer' })
        .send({ data: hoje, aves: 5000, pesoTotalKg: 4500, precoKg: 6 })
        .expect(409);
      expect(r.body.message).toContain('carência');

      // Lançada por engano: estornada, a carência deixa de valer
      await api()
        .post(lote(loteA, '/estornos'))
        .auth(veterinario, { type: 'bearer' })
        .send({
          entidade: 'ocorrencia',
          idEvento: carencia,
          motivo: 'Lançada no lote errado',
        })
        .expect(204);
    });

    it('a carga não passa do saldo; o Operador não registra carga', async () => {
      await api()
        .post(lote(loteA, '/cargas'))
        .auth(gestor, { type: 'bearer' })
        .send({ data: hoje, aves: 50000, pesoTotalKg: 4500 })
        .expect(409);
      await api()
        .post(lote(loteA, '/cargas'))
        .auth(operador, { type: 'bearer' })
        .send({ data: hoje, aves: 10, pesoTotalKg: 9 })
        .expect(403);
      const r = await api()
        .post(lote(loteA, '/cargas'))
        .auth(gestor, { type: 'bearer' })
        .send({
          data: hoje,
          aves: 5000,
          pesoTotalKg: 4500,
          precoKg: 6,
          destino: 'Frigorífico Oeste',
          numeroGta: 'GTA-1',
        })
        .expect(201);
      expect(r.body.saldoAves).toBe(10000 - 78 - 5000);
    });

    it('com pendências, o encerramento pede confirmação e sai parcial', async () => {
      const r = await api()
        .post(lote(loteA, '/encerrar'))
        .auth(gestor, { type: 'bearer' })
        .send({ data: hoje })
        .expect(409);
      expect(r.body.codigo).toBe('PENDENCIAS');
      expect(r.body.pendencias).toEqual(
        expect.arrayContaining([
          expect.stringContaining('aves ainda no lote'),
          expect.stringContaining('alerta'),
        ]),
      );

      const encerrado = await api()
        .post(lote(loteA, '/encerrar'))
        .auth(gestor, { type: 'bearer' })
        .send({ data: hoje, confirmarParcial: true })
        .expect(200);
      expect(encerrado.body).toMatchObject({ parcial: true, data: hoje });
      expect(encerrado.body.resultado.zootecnico).toMatchObject({
        avesEntregues: 5000,
        pesoEntregueKg: 4500,
        pesoMedioFinalKg: 0.9,
      });
      expect(encerrado.body.resultado.financeiro.receitaRealizada).toBe(27000);
    });

    it('lote encerrado é só consulta e libera o galpão', async () => {
      await api()
        .post(lote(loteA, '/baixas'))
        .auth(operador, { type: 'bearer' })
        .send({ data: hoje, mortes: 1 })
        .expect(409);
      const detalhe = await api()
        .get(lote(loteA))
        .auth(operador, { type: 'bearer' })
        .expect(200);
      expect(detalhe.body.situacao).toBe('encerrado');
      expect(detalhe.body.encerramento.parcial).toBe(true);
      const g = await api()
        .get(url(`/galpoes/${galpao}`))
        .auth(gestor, { type: 'bearer' })
        .expect(200);
      expect(g.body.situacao).toBe('disponivel');
    });

    it('relatório em PDF e XLSX', async () => {
      const pdf = await api()
        .get(lote(loteA, '/relatorio?formato=pdf'))
        .auth(gestor, { type: 'bearer' })
        .buffer(true)
        .parse((res, cb) => {
          const partes: Buffer[] = [];
          res.on('data', (p: Buffer) => partes.push(p));
          res.on('end', () => cb(null, Buffer.concat(partes)));
        })
        .expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

      const xlsx = await api()
        .get(lote(loteA, '/relatorio?formato=xlsx'))
        .auth(operador, { type: 'bearer' })
        .buffer(true)
        .parse((res, cb) => {
          const partes: Buffer[] = [];
          res.on('data', (p: Buffer) => partes.push(p));
          res.on('end', () => cb(null, Buffer.concat(partes)));
        })
        .expect(200);
      expect(xlsx.headers['content-type']).toContain('spreadsheetml');
      expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    });

    it('lote sem pendências encerra completo; lote em andamento não tem relatório', async () => {
      const loteB = await novoLote('B-1', diasAtras(35), 1000);
      await api()
        .get(lote(loteB, '/relatorio'))
        .auth(gestor, { type: 'bearer' })
        .expect(409);
      await api()
        .post(lote(loteB, '/cargas'))
        .auth(gestor, { type: 'bearer' })
        .send({ data: hoje, aves: 1000, pesoTotalKg: 2500, precoKg: 6 })
        .expect(201);
      const r = await api()
        .post(lote(loteB, '/encerrar'))
        .auth(gestor, { type: 'bearer' })
        .send({ data: hoje })
        .expect(200);
      expect(r.body.parcial).toBe(false);
      expect(r.body.resultado.zootecnico).toMatchObject({
        idadeAbateDias: 35,
        avesEntregues: 1000,
        pesoMedioFinalKg: 2.5,
        conversaoAlimentar: 0.8,
      });
      // 1000 pintos × 3 + ração 3600 = 6600; receita 2500 × 6 = 15000
      expect(r.body.resultado.financeiro).toMatchObject({
        custoTotal: 6600,
        receitaRealizada: 15000,
        margem: 8400,
      });
    });
  });
});
