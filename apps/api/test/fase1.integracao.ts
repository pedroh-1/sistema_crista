import { iniciarApi } from './apoio';

/** Fluxos da Fase 1 (UC01 a UC04) contra um banco PostgreSQL real. */
describe('Fase 1: conta, fazenda, galpão e vínculo', () => {
  let t: Awaited<ReturnType<typeof iniciarApi>>;
  const api = () => t.api();
  const tokenDoUltimoEmail = (para: string) => t.tokenDoUltimoEmail(para);
  const criarUsuario = (email: string, nome?: string) =>
    t.criarUsuario(email, nome);

  beforeAll(async () => {
    t = await iniciarApi();
  });

  afterAll(() => t.app.close());

  it('health-check é público', () =>
    api().get('/api/health').expect(200, { status: 'ok', banco: 'ok' }));

  it('rotas protegidas exigem login', () =>
    api().get('/api/fazendas').expect(401));

  describe('UC01: cadastro de usuário', () => {
    it('a conta nasce pendente e só entra depois de confirmar o e-mail', async () => {
      const cadastro = await api()
        .post('/api/auth/cadastro')
        .send({
          nome: 'Ana Lima',
          email: 'Ana@Granja.com',
          senha: 'galinha123',
          aceiteTermos: true,
        })
        .expect(201);
      expect(cadastro.body).toMatchObject({
        email: 'ana@granja.com',
        status: 'pendente',
      });

      await api()
        .post('/api/auth/login')
        .send({ email: 'ana@granja.com', senha: 'galinha123' })
        .expect(403);
      await api()
        .post('/api/auth/verificar-email')
        .send({ token: tokenDoUltimoEmail('ana@granja.com') })
        .expect(204);
      await api()
        .post('/api/auth/login')
        .send({ email: 'ana@granja.com', senha: 'senhaerrada1' })
        .expect(401);
      await api()
        .post('/api/auth/login')
        .send({ email: 'ana@granja.com', senha: 'galinha123' })
        .expect(200);
    });

    it('o link de confirmação só funciona uma vez', () =>
      api()
        .post('/api/auth/verificar-email')
        .send({ token: tokenDoUltimoEmail('ana@granja.com') })
        .expect(400));

    it('recusa e-mail repetido, senha fraca e cadastro sem aceite', async () => {
      const base = {
        nome: 'Ana Lima',
        email: 'ana@granja.com',
        senha: 'galinha123',
        aceiteTermos: true,
      };
      await api().post('/api/auth/cadastro').send(base).expect(409);
      const fraca = await api()
        .post('/api/auth/cadastro')
        .send({ ...base, email: 'b@granja.com', senha: '12345678' })
        .expect(400);
      expect(fraca.body.erros[0]).toMatchObject({ campo: 'senha' });
      await api()
        .post('/api/auth/cadastro')
        .send({ ...base, email: 'c@granja.com', aceiteTermos: false })
        .expect(400);
    });
  });

  describe('UC02 a UC04', () => {
    let gestor: string;
    let operador: string;
    let fazendaId: string;
    let galpaoA: string;

    beforeAll(async () => {
      gestor = await criarUsuario('gestor@granja.com', 'Gestor');
      operador = await criarUsuario('operador@granja.com', 'Operador');
    });

    it('UC02: quem cria a fazenda vira Gestor', async () => {
      const resposta = await api()
        .post('/api/fazendas')
        .auth(gestor, { type: 'bearer' })
        .send({
          nome: 'Granja Boa Vista',
          documento: '11.222.333/0001-81',
          municipio: 'Chapecó',
          uf: 'SC',
        })
        .expect(201);
      fazendaId = resposta.body.id;
      expect(resposta.body).toMatchObject({
        documento: '11222333000181',
        perfil: 'gestor',
      });

      const eu = await api()
        .get('/api/auth/eu')
        .auth(gestor, { type: 'bearer' })
        .expect(200);
      expect(eu.body.fazendas).toEqual([
        { id: fazendaId, nome: 'Granja Boa Vista', perfil: 'gestor' },
      ]);
    });

    it('UC02: documento é único', () =>
      api()
        .post('/api/fazendas')
        .auth(gestor, { type: 'bearer' })
        .send({
          nome: 'Outra',
          documento: '11222333000181',
          municipio: 'Chapecó',
          uf: 'SC',
        })
        .expect(409));

    it('UC03: cadastra galpão disponível e calcula a densidade máxima', async () => {
      const resposta = await api()
        .post(`/api/fazendas/${fazendaId}/galpoes`)
        .auth(gestor, { type: 'bearer' })
        .send({
          identificacao: 'A',
          areaUtilM2: 1500,
          capacidadeAves: 21000,
          tipo: 'climatizado',
        })
        .expect(201);
      galpaoA = resposta.body.id;
      expect(resposta.body).toMatchObject({
        situacao: 'disponivel',
        densidadeMaxima: 14,
      });

      await api()
        .post(`/api/fazendas/${fazendaId}/galpoes`)
        .auth(gestor, { type: 'bearer' })
        .send({
          identificacao: 'B',
          areaUtilM2: 1200,
          capacidadeAves: 16000,
          tipo: 'convencional',
        })
        .expect(201);
    });

    it('UC03: identificação única e área maior que zero', async () => {
      await api()
        .post(`/api/fazendas/${fazendaId}/galpoes`)
        .auth(gestor, { type: 'bearer' })
        .send({
          identificacao: 'A',
          areaUtilM2: 100,
          capacidadeAves: 100,
          tipo: 'convencional',
        })
        .expect(409);
      await api()
        .post(`/api/fazendas/${fazendaId}/galpoes`)
        .auth(gestor, { type: 'bearer' })
        .send({
          identificacao: 'C',
          areaUtilM2: 0,
          capacidadeAves: 100,
          tipo: 'convencional',
        })
        .expect(400);
    });

    it('sem vínculo, a fazenda não existe para o usuário', () =>
      api()
        .get(`/api/fazendas/${fazendaId}`)
        .auth(operador, { type: 'bearer' })
        .expect(404));

    it('UC04: Veterinário exige CRMV', () =>
      api()
        .post(`/api/fazendas/${fazendaId}/vinculos`)
        .auth(gestor, { type: 'bearer' })
        .send({ email: 'vet@granja.com', perfil: 'veterinario' })
        .expect(400));

    it('UC04: convite restrito a um galpão, aceito pelo e-mail convidado', async () => {
      await api()
        .post(`/api/fazendas/${fazendaId}/vinculos`)
        .auth(gestor, { type: 'bearer' })
        .send({
          email: 'operador@granja.com',
          perfil: 'operador',
          galpoes: [galpaoA],
        })
        .expect(201);
      await api()
        .post(`/api/fazendas/${fazendaId}/vinculos`)
        .auth(gestor, { type: 'bearer' })
        .send({ email: 'operador@granja.com', perfil: 'operador' })
        .expect(409);

      const token = tokenDoUltimoEmail('operador@granja.com');
      const consulta = await api()
        .post('/api/convites/consultar')
        .send({ token })
        .expect(200);
      expect(consulta.body).toMatchObject({
        fazenda: 'Granja Boa Vista',
        perfil: 'operador',
        expirado: false,
      });

      await api()
        .post('/api/convites/aceitar')
        .auth(gestor, { type: 'bearer' })
        .send({ token })
        .expect(403);
      await api()
        .post('/api/convites/aceitar')
        .auth(operador, { type: 'bearer' })
        .send({ token })
        .expect(200);
      await api()
        .post('/api/convites/aceitar')
        .auth(operador, { type: 'bearer' })
        .send({ token })
        .expect(404);
    });

    it('o Operador vê só os galpões permitidos e não gerencia a fazenda', async () => {
      const galpoes = await api()
        .get(`/api/fazendas/${fazendaId}/galpoes`)
        .auth(operador, { type: 'bearer' })
        .expect(200);
      expect(
        galpoes.body.map((g: { identificacao: string }) => g.identificacao),
      ).toEqual(['A']);

      await api()
        .post(`/api/fazendas/${fazendaId}/galpoes`)
        .auth(operador, { type: 'bearer' })
        .send({
          identificacao: 'D',
          areaUtilM2: 100,
          capacidadeAves: 100,
          tipo: 'convencional',
        })
        .expect(403);
      await api()
        .get(`/api/fazendas/${fazendaId}/vinculos`)
        .auth(operador, { type: 'bearer' })
        .expect(403);
      await api()
        .patch(`/api/fazendas/${fazendaId}`)
        .auth(operador, { type: 'bearer' })
        .send({ nome: 'X' })
        .expect(403);
    });

    it('não deixa a fazenda sem Gestor e revoga o acesso do Operador', async () => {
      const vinculos = await api()
        .get(`/api/fazendas/${fazendaId}/vinculos`)
        .auth(gestor, { type: 'bearer' })
        .expect(200);
      const porPerfil = (perfil: string) =>
        vinculos.body.find((v: { perfil: string }) => v.perfil === perfil);

      await api()
        .post(
          `/api/fazendas/${fazendaId}/vinculos/${porPerfil('gestor').id}/revogar`,
        )
        .auth(gestor, { type: 'bearer' })
        .expect(409);
      await api()
        .post(
          `/api/fazendas/${fazendaId}/vinculos/${porPerfil('operador').id}/revogar`,
        )
        .auth(gestor, { type: 'bearer' })
        .expect(204);
      await api()
        .get(`/api/fazendas/${fazendaId}`)
        .auth(operador, { type: 'bearer' })
        .expect(404);
    });

    it('registra auditoria e não deixa alterá-la', async () => {
      const eventos = await t.prisma.eventoAuditoria.findMany({
        where: { fazendaId },
        orderBy: { registradoEm: 'asc' },
      });
      expect(eventos.map((e) => `${e.acao} ${e.entidade}`)).toEqual(
        expect.arrayContaining([
          'criar fazenda',
          'criar galpao',
          'convidar vinculo',
          'aceitar vinculo',
          'revogar vinculo',
        ]),
      );
      await expect(
        t.prisma.eventoAuditoria.deleteMany({ where: { fazendaId } }),
      ).rejects.toThrow();
    });
  });
});
