import ExcelJS from 'exceljs';
import { diasAtras, iniciarApi } from './apoio';

/** Visão geral da fazenda e relatório da fazenda (docs/08-design.md) contra um banco real. */
describe('Visão geral e relatório da fazenda', () => {
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
  const hoje = diasAtras(0);
  const url = (caminho = '') => `/api/fazendas/${fazendaId}${caminho}`;
  const lote = (id: string, caminho = '') => url(`/lotes/${id}${caminho}`);
  const visao = async (token: string, consulta = '') =>
    (
      await api()
        .get(url(`/visao-geral${consulta}`))
        .auth(token, { type: 'bearer' })
        .expect(200)
    ).body;

  async function novoGalpao(identificacao: string) {
    return (
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
  }

  async function novoLote(
    codigo: string,
    galpaoId: string,
    dataAlojamento: string,
    aves: number,
  ) {
    const r = await api()
      .post(url('/lotes'))
      .auth(gestor, { type: 'bearer' })
      .send({
        codigo,
        galpaoId,
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

  /** Baixa o arquivo do relatório como Buffer. */
  const baixar = (token: string, consulta: string) =>
    api()
      .get(url(`/visao-geral/relatorio${consulta}`))
      .auth(token, { type: 'bearer' })
      .buffer(true)
      .parse((res, cb) => {
        const partes: Buffer[] = [];
        res.on('data', (p: Buffer) => partes.push(p));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      })
      .expect(200);

  const baixa = (id: string, data: string, mortes: number) =>
    api()
      .post(lote(id, '/baixas'))
      .auth(gestor, { type: 'bearer' })
      .send({ data, mortes })
      .expect(201);

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
          nome: 'Granja Visão',
          documento: '11.222.333/0001-81',
          municipio: 'Concórdia',
          uf: 'SC',
        })
        .expect(201)
    ).body.id;
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
      { perfil: 'veterinario', crmv: 'SC-1' },
    );
    loteA = await novoLote('A-1', galpaoA, diasAtras(30), 10000);
    loteB = await novoLote('B-1', galpaoB, diasAtras(20), 20000);
    await baixa(loteA, diasAtras(10), 100);
    // 60 de 9.900 = 0,61%: acima do limite crítico padrão (0,5%) aos 30 dias.
    await baixa(loteA, hoje, 60);
    await baixa(loteB, hoje, 20);
    await t.processarFila();
  });

  afterAll(() => t.app.close());

  it('agrega os lotes com mortalidade ponderada e a série diária da fazenda', async () => {
    const v = await visao(gestor);
    expect(v.periodo.ate).toBe(hoje);
    expect(v.periodo.de).toBe(diasAtras(90));
    expect(v.financeiroVisivel).toBe(true);
    expect(v.lotes.map((l: { codigo: string }) => l.codigo)).toEqual([
      'A-1',
      'B-1',
    ]);
    expect(v.indicadores).toMatchObject({
      lotes: { total: 2, emAndamento: 2, encerrados: 0 },
      avesAlojadas: 30000,
      plantelAtual: 29820,
      baixas: 180,
      mortalidade: { disponivel: true, valor: 0.6 },
    });
    expect(v.mortalidadeDiaria).toHaveLength(2);
    expect(v.mortalidadeDiaria[1]).toMatchObject({
      data: hoje,
      baixas: 80,
      avesInicioDia: 29900,
      nivel: 'critico',
      lotes: 2,
    });
    const categorias = v.custos.porCategoria.map(
      (c: { categoria: string }) => c.categoria,
    );
    expect(categorias).toEqual(expect.arrayContaining(['racao', 'pintos']));
    expect(v.alertas.criticos).toBe(1);
    expect(v.atencao[0]).toMatchObject({
      tom: 'critico',
      link: { tipo: 'lote', id: loteA },
    });
  });

  it('a cor da mortalidade de hoje segue o limite configurado pela fazenda', async () => {
    await api()
      .put(url('/regras-alerta'))
      .auth(gestor, { type: 'bearer' })
      .send({
        indicador: 'mortalidade_dia',
        limiteAtencao: 0.5,
        limiteCritico: 1,
      })
      .expect(200);
    const detalhe = (
      await api().get(lote(loteA)).auth(gestor, { type: 'bearer' }).expect(200)
    ).body;
    expect(detalhe.resumo.mortalidadeHoje.nivel).toBe('atencao');
    const v = await visao(gestor);
    expect(v.mortalidadeDiaria[1].nivel).toBe('atencao');
    await api()
      .delete(url('/regras-alerta/mortalidade_dia'))
      .auth(gestor, { type: 'bearer' })
      .expect(200);
    const depois = (
      await api().get(lote(loteA)).auth(gestor, { type: 'bearer' }).expect(200)
    ).body;
    expect(depois.resumo.mortalidadeHoje.nivel).toBe('critico');
  });

  it('filtra por galpão, lote, situação e período', async () => {
    const soB = await visao(gestor, `?galpao=${galpaoB}`);
    expect(soB.lotes).toHaveLength(1);
    expect(soB.indicadores.mortalidade.valor).toBeCloseTo(0.1, 5);
    // Com filtro de galpão, só os alertas dos lotes que ficaram.
    expect(soB.alertas.abertos).toBe(0);

    expect((await visao(gestor, `?lote=${loteA}`)).lotes).toHaveLength(1);
    expect((await visao(gestor, '?situacao=encerrado')).lotes).toEqual([]);

    // Só os últimos 5 dias: a baixa de 10 dias atrás fica fora da série.
    const curto = await visao(gestor, `?de=${diasAtras(5)}`);
    expect(curto.mortalidadeDiaria).toHaveLength(1);

    // Lote alojado depois do fim do período não entra.
    const antigo = await visao(
      gestor,
      `?de=${diasAtras(60)}&ate=${diasAtras(25)}`,
    );
    expect(antigo.lotes.map((l: { codigo: string }) => l.codigo)).toEqual([
      'A-1',
    ]);

    await api()
      .get(url(`/visao-geral?de=${hoje}&ate=${diasAtras(3)}`))
      .auth(gestor, { type: 'bearer' })
      .expect(400);
  });

  it('respeita galpões do vínculo e o financeiro do perfil', async () => {
    const op = await visao(operador);
    expect(op.lotes.map((l: { codigo: string }) => l.codigo)).toEqual(['A-1']);
    expect(op.custos).toBeNull();
    expect((await visao(operador, `?galpao=${galpaoB}`)).lotes).toEqual([]);

    const vet = await visao(veterinario);
    expect(vet.financeiroVisivel).toBe(false);
    expect(vet.custos).toBeNull();
    expect(vet.indicadores.custoTotal).toBeNull();
    expect(vet.lotes[0].financeiro).toBeNull();
  });

  it('relatório em PDF e XLSX com as seções escolhidas', async () => {
    const pdf = await baixar(gestor, '?formato=pdf');
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toContain(
      'relatorio-Granja_Visao',
    );
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const planilha = async (token: string, consulta: string) => {
      const r = await baixar(token, `?formato=xlsx${consulta}`);
      const livro = new ExcelJS.Workbook();
      await livro.xlsx.load(r.body as Parameters<typeof livro.xlsx.load>[0]);
      return livro;
    };
    const completo = await planilha(gestor, '');
    expect(completo.worksheets.map((w) => w.name)).toEqual([
      'Resumo',
      'Pontos de atenção',
      'Mortalidade diária',
      'Lotes',
      'Custos',
    ]);
    expect(completo.getWorksheet('Lotes')?.rowCount).toBe(3);

    const soLotes = await planilha(gestor, `&secoes=lotes&galpao=${galpaoB}`);
    expect(soLotes.worksheets.map((w) => w.name)).toEqual(['Resumo', 'Lotes']);
    expect(soLotes.getWorksheet('Lotes')?.getCell('A2').value).toBe('B-1');

    // Sem financeiro, a seção de custos some mesmo pedida.
    const vet = await planilha(veterinario, '&secoes=custos,lotes');
    expect(vet.worksheets.map((w) => w.name)).toEqual(['Resumo', 'Lotes']);

    await api()
      .get(url('/visao-geral/relatorio?formato=pdf&secoes=outra'))
      .auth(gestor, { type: 'bearer' })
      .expect(400);
  });
});
