import { diasAtras, iniciarApi } from './apoio';

/** Fase 8: visões salvas do painel (UC15) contra um banco real. */
describe('Fase 8: visões salvas do painel', () => {
  let t: Awaited<ReturnType<typeof iniciarApi>>;
  const api = () => t.api();

  let gestor: string;
  let produtor: string;
  let operador: string;
  let fazendaId: string;
  let loteA: string;
  let loteB: string;
  let loteDeFora: string;
  const url = (caminho = '') => `/api/fazendas/${fazendaId}${caminho}`;

  async function criarFazenda(nome: string, documento: string) {
    const fazenda = (
      await api()
        .post('/api/fazendas')
        .auth(gestor, { type: 'bearer' })
        .send({ nome, documento, municipio: 'Chapecó', uf: 'SC' })
        .expect(201)
    ).body.id as string;
    const galpao = (
      await api()
        .post(`/api/fazendas/${fazenda}/galpoes`)
        .auth(gestor, { type: 'bearer' })
        .send({
          identificacao: 'A',
          areaUtilM2: 1000,
          capacidadeAves: 14000,
          tipo: 'climatizado',
        })
        .expect(201)
    ).body.id as string;
    return { fazenda, galpao };
  }

  const novoLote = async (fazenda: string, galpaoId: string, codigo: string) =>
    (
      await api()
        .post(`/api/fazendas/${fazenda}/lotes`)
        .auth(gestor, { type: 'bearer' })
        .send({
          codigo,
          galpaoId,
          linhagem: 'cobb500',
          dataAlojamento: diasAtras(60),
          quantidadePrevista: 10000,
        })
        .expect(201)
    ).body.id as string;

  beforeAll(async () => {
    t = await iniciarApi();
    gestor = await t.criarUsuario('gestor@granja.com', 'Gestor');
    produtor = await t.criarUsuario('produtor@granja.com', 'Produtor');
    operador = await t.criarUsuario('operador@granja.com', 'Operador');
    const principal = await criarFazenda('Granja Painel', '11.222.333/0001-81');
    fazendaId = principal.fazenda;
    loteA = await novoLote(fazendaId, principal.galpao, 'A-1');
    // Um galpão só aceita um lote em andamento: o segundo é cancelado antes.
    await api()
      .post(url(`/lotes/${loteA}/cancelar`))
      .auth(gestor, { type: 'bearer' })
      .send({ motivo: 'Cadastro de teste' });
    loteB = await novoLote(fazendaId, principal.galpao, 'A-2');
    const outra = await criarFazenda('Granja Vizinha', '45.723.174/0001-10');
    loteDeFora = await novoLote(outra.fazenda, outra.galpao, 'V-1');
    for (const [token, email, perfil] of [
      [produtor, 'produtor@granja.com', 'produtor'],
      [operador, 'operador@granja.com', 'operador'],
    ])
      await t.vincular(gestor, fazendaId, { token, email }, { perfil });
  });

  afterAll(() => t.app.close());

  const salvar = (token: string, corpo: object, status = 201) =>
    api()
      .post(url('/visoes'))
      .auth(token, { type: 'bearer' })
      .send(corpo)
      .expect(status);
  const visoes = async (token: string) =>
    (
      await api()
        .get(url('/visoes'))
        .auth(token, { type: 'bearer' })
        .expect(200)
    ).body as { id: string; nome: string; filtros: Record<string, unknown> }[];

  it('salva os filtros e guarda só o período do modo escolhido', async () => {
    await salvar(gestor, {
      nome: 'Dois lotes, primeira semana',
      filtros: {
        lotes: [loteA, loteB],
        modo: 'idade',
        idadeDe: 0,
        idadeAte: 7,
        de: diasAtras(10),
      },
    });
    const [visao] = await visoes(gestor);
    expect(visao.filtros).toEqual({
      lotes: [loteA, loteB],
      modo: 'idade',
      idadeDe: 0,
      idadeAte: 7,
    });
  });

  it('o mesmo nome substitui a visão em vez de duplicar', async () => {
    await salvar(gestor, {
      nome: 'Dois lotes, primeira semana',
      filtros: { lotes: [loteB], modo: 'hoje' },
    });
    const lista = await visoes(gestor);
    expect(lista).toHaveLength(1);
    expect(lista[0].filtros).toEqual({ lotes: [loteB], modo: 'hoje' });
  });

  it('a visão é pessoal: outro usuário não vê nem exclui', async () => {
    expect(await visoes(produtor)).toEqual([]);
    const [visao] = await visoes(gestor);
    await api()
      .delete(url(`/visoes/${visao.id}`))
      .auth(produtor, { type: 'bearer' })
      .expect(404);
  });

  it('não aceita lote de outra fazenda', () =>
    salvar(
      gestor,
      { nome: 'Invasora', filtros: { lotes: [loteDeFora] } },
      400,
    ));

  it('quem não filtra o painel não salva visão', () =>
    salvar(operador, { nome: 'Minha', filtros: { lotes: [loteA] } }, 403));

  it('limita a 20 visões por usuário na fazenda', async () => {
    for (let i = 0; i < 19; i++)
      await salvar(produtor, {
        nome: `Visão ${i}`,
        filtros: { lotes: [loteA] },
      });
    await salvar(produtor, { nome: 'Visão 19', filtros: { lotes: [loteA] } });
    await salvar(
      produtor,
      { nome: 'Visão 20', filtros: { lotes: [loteA] } },
      409,
    );
    // Substituir uma existente continua permitido.
    await salvar(produtor, { nome: 'Visão 3', filtros: { lotes: [loteB] } });
  });

  it('exclui a própria visão', async () => {
    const [visao] = await visoes(gestor);
    await api()
      .delete(url(`/visoes/${visao.id}`))
      .auth(gestor, { type: 'bearer' })
      .expect(204);
    expect(await visoes(gestor)).toEqual([]);
  });
});
