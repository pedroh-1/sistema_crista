import { ConflictException, Injectable } from '@nestjs/common';
import {
  NOME_LINHAGEM,
  NOME_TIPO_OCORRENCIA,
  pode,
  TipoOcorrencia,
} from '@crista/domain';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { AcessoFazenda } from '../fazendas/acesso-fazenda.guard';
import { PrismaService } from '../prisma/prisma.service';
import { EncerramentoService } from './encerramento.service';
import { br, brl, nomeCategoria, num } from './formato';
import { ResultadoEncerramento } from './indicadores';
import { LoteContexto, paraISO } from './lote-contexto';

const MARGEM = 48;

interface DadosRelatorio {
  fazenda: { nome: string; documento: string; municipio: string; uf: string };
  lote: {
    codigo: string;
    linhagem: string;
    galpao: string;
    dataAlojamento: string;
  };
  encerramento: NonNullable<
    Awaited<ReturnType<EncerramentoService['encerramento']>>
  >;
  cargas: {
    data: string;
    aves: number;
    pesoTotalKg: number;
    precoKg: number | null;
    destino: string | null;
    numeroGta: string | null;
  }[];
  ocorrencias: {
    data: string;
    tipo: TipoOcorrencia;
    descricao: string;
    produto: string | null;
    carenciaDias: number | null;
  }[];
  verFinanceiro: boolean;
}

/** UC17: relatório de encerramento em PDF ou XLSX, a partir do resultado congelado. */
@Injectable()
export class RelatorioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contexto: LoteContexto,
    private readonly encerramentos: EncerramentoService,
  ) {}

  async gerar(acesso: AcessoFazenda, loteId: string, formato: 'pdf' | 'xlsx') {
    const dados = await this.carregar(acesso, loteId);
    const nome = `encerramento-${dados.lote.codigo.replace(/[^\w-]+/g, '_')}.${formato}`;
    const conteudo =
      formato === 'pdf' ? await this.pdf(dados) : await this.xlsx(dados);
    return {
      nome,
      conteudo,
      tipo:
        formato === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private async carregar(
    acesso: AcessoFazenda,
    loteId: string,
  ): Promise<DadosRelatorio> {
    const lote = await this.contexto.carregar(acesso, loteId);
    const encerramento = await this.encerramentos.encerramento(loteId);
    if (!encerramento)
      throw new ConflictException(
        'O relatório de encerramento só existe depois que o lote é encerrado',
      );
    const validos = await this.contexto.filtroValidos(acesso.fazendaId);
    const [fazenda, galpao, cargas, ocorrencias] = await Promise.all([
      this.prisma.fazenda.findUniqueOrThrow({ where: { id: lote.fazendaId } }),
      this.prisma.galpao.findUniqueOrThrow({ where: { id: lote.galpaoId } }),
      this.prisma.saidaCarga.findMany({
        where: { loteId, ...validos },
        orderBy: { data: 'asc' },
      }),
      this.prisma.ocorrenciaSanitaria.findMany({
        where: { loteId, ...validos },
        orderBy: { data: 'asc' },
      }),
    ]);
    return {
      fazenda: {
        nome: fazenda.nome,
        documento: fazenda.documento,
        municipio: fazenda.municipio,
        uf: fazenda.uf,
      },
      lote: {
        codigo: lote.codigo,
        linhagem: NOME_LINHAGEM[lote.linhagem],
        galpao: galpao.identificacao,
        dataAlojamento: paraISO(lote.dataAlojamento),
      },
      encerramento,
      cargas: cargas.map((c) => ({
        data: paraISO(c.data),
        aves: c.aves,
        pesoTotalKg: Number(c.pesoTotalKg),
        precoKg: c.precoKg === null ? null : Number(c.precoKg),
        destino: c.destino,
        numeroGta: c.numeroGta,
      })),
      ocorrencias: ocorrencias.map((o) => ({
        data: paraISO(o.data),
        tipo: o.tipo,
        descricao: o.descricao,
        produto: o.produto,
        carenciaDias: o.carenciaDias,
      })),
      verFinanceiro: pode(acesso.perfil, 'financeiro.ver'),
    };
  }

  private linhasZootecnicas(r: ResultadoEncerramento): [string, string][] {
    const z = r.zootecnico;
    return [
      ['Aves recebidas', num(z.avesRecebidas)],
      ['Aves alojadas', num(z.avesAlojadas)],
      ['Mortes e descartes', num(z.baixas)],
      ['Aves entregues', num(z.avesEntregues)],
      ['Aves sem saída', num(z.avesSemSaida)],
      ['Mortalidade', `${num(z.mortalidadePct, 2)}%`],
      ['Viabilidade', `${num(z.viabilidadePct, 2)}%`],
      ['Idade de abate', `${num(z.idadeAbateDias)} dias`],
      ['Peso entregue', `${num(z.pesoEntregueKg)} kg`],
      ['Peso médio final', `${num(z.pesoMedioFinalKg, 3)} kg`],
      ['Ganho de peso diário', `${num(z.gpdFinalG, 1)} g/dia`],
      ['Ração consumida', `${num(z.racaoConsumidaKg)} kg`],
      ['Conversão alimentar', num(z.conversaoAlimentar, 3)],
      ['IEP', num(z.iep)],
    ];
  }

  private linhasFinanceiras(r: ResultadoEncerramento): [string, string][] {
    const f = r.financeiro;
    return [
      ['Custo total', brl(f.custoTotal)],
      ['Custo por ave alojada', brl(f.custoPorAveAlojada)],
      ['Custo por kg entregue', brl(f.custoPorKgEntregue)],
      ['Receita das cargas', brl(f.receitaRealizada)],
      ['Margem', brl(f.margem)],
      [
        'Margem sobre a receita',
        f.margemPct == null ? '—' : `${num(f.margemPct, 1)}%`,
      ],
    ];
  }

  private pdf(d: DadosRelatorio): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 48,
        info: { Title: `Encerramento do lote ${d.lote.codigo}` },
      });
      const partes: Buffer[] = [];
      doc.on('data', (p: Buffer) => partes.push(p));
      doc.on('end', () => resolve(Buffer.concat(partes)));
      doc.on('error', reject);

      const r = d.encerramento.resultado;
      const titulo = (t: string) =>
        doc
          .moveDown(0.8)
          .font('Helvetica-Bold')
          .fontSize(12)
          .text(t, MARGEM)
          .moveDown(0.3)
          .font('Helvetica')
          .fontSize(10);
      const tabela = (linhas: [string, string][]) => {
        for (const [rotulo, valor] of linhas) {
          const y = doc.y;
          doc.text(rotulo, 48, y, { width: 260 });
          doc.text(valor, 320, y, { width: 220, align: 'right' });
          doc.moveDown(0.15);
        }
        // Volta para a margem esquerda: o texto seguinte não herda a coluna do valor.
        doc.x = MARGEM;
      };

      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .text(`Relatório de encerramento: lote ${d.lote.codigo}`);
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#444')
        .text(
          `${d.fazenda.nome} · ${d.fazenda.municipio}/${d.fazenda.uf} · CPF/CNPJ ${d.fazenda.documento}`,
        )
        .text(
          `${d.lote.galpao} · ${d.lote.linhagem} · alojado em ${br(d.lote.dataAlojamento)} · encerrado em ${br(d.encerramento.data)}`,
        )
        .fillColor('black');
      if (d.encerramento.parcial) {
        doc
          .moveDown(0.6)
          .font('Helvetica-Bold')
          .fillColor('#a33a2c')
          .text('RELATÓRIO PARCIAL: o lote foi encerrado com pendências')
          .font('Helvetica')
          .fillColor('black');
        for (const p of d.encerramento.pendencias) doc.text(`• ${p}`);
      }

      titulo('Resultado zootécnico');
      tabela(this.linhasZootecnicas(r));

      if (d.verFinanceiro) {
        titulo('Resultado financeiro');
        tabela(this.linhasFinanceiras(r));
        if (r.financeiro.cargasSemPreco > 0) {
          doc
            .fontSize(9)
            .fillColor('#444')
            .text(
              `${r.financeiro.cargasSemPreco} carga(s) sem preço ficaram fora da receita.`,
            )
            .fillColor('black')
            .fontSize(10);
        }
        titulo('Custo por categoria');
        tabela(
          r.financeiro.porCategoria.map((c) => [
            nomeCategoria(c.categoria),
            `${brl(c.valor)} (${num(c.percentual, 1)}%)`,
          ]),
        );
      }

      titulo('Cargas de saída');
      if (d.cargas.length === 0) doc.text('Nenhuma carga registrada.');
      for (const c of d.cargas) {
        doc.text(
          `${br(c.data)} · ${num(c.aves)} aves · ${num(c.pesoTotalKg)} kg` +
            (d.verFinanceiro && c.precoKg !== null
              ? ` · ${brl(c.precoKg)}/kg`
              : '') +
            (c.destino ? ` · ${c.destino}` : '') +
            (c.numeroGta ? ` · GTA ${c.numeroGta}` : ''),
        );
      }

      titulo('Histórico sanitário');
      if (d.ocorrencias.length === 0)
        doc.text('Nenhuma ocorrência registrada.');
      for (const o of d.ocorrencias) {
        doc.text(
          `${br(o.data)} · ${NOME_TIPO_OCORRENCIA[o.tipo]} · ${o.descricao}` +
            (o.produto ? ` · ${o.produto}` : '') +
            (o.carenciaDias != null
              ? ` · carência ${o.carenciaDias} dias`
              : ''),
        );
      }

      doc
        .moveDown(1.5)
        .fontSize(8)
        .fillColor('#666')
        .text(
          `Encerrado por ${d.encerramento.encerradoPor ?? '—'}. Gerado pelo CRISTA em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Valores congelados na data do encerramento.`,
        );
      doc.end();
    });
  }

  private async xlsx(d: DadosRelatorio): Promise<Buffer> {
    const livro = new ExcelJS.Workbook();
    livro.creator = 'CRISTA';
    const r = d.encerramento.resultado;

    const resumo = livro.addWorksheet('Resumo');
    resumo.columns = [{ width: 32 }, { width: 28 }];
    resumo.addRow([`Encerramento do lote ${d.lote.codigo}`]).font = {
      bold: true,
      size: 14,
    };
    resumo.addRow(['Fazenda', d.fazenda.nome]);
    resumo.addRow(['Galpão', d.lote.galpao]);
    resumo.addRow(['Linhagem', d.lote.linhagem]);
    resumo.addRow(['Alojamento', br(d.lote.dataAlojamento)]);
    resumo.addRow(['Encerramento', br(d.encerramento.data)]);
    resumo.addRow([
      'Relatório',
      d.encerramento.parcial ? 'PARCIAL (com pendências)' : 'Completo',
    ]);
    for (const p of d.encerramento.pendencias) resumo.addRow(['Pendência', p]);
    resumo.addRow([]);
    resumo.addRow(['Resultado zootécnico']).font = { bold: true };
    for (const linha of this.linhasZootecnicas(r)) resumo.addRow(linha);
    if (d.verFinanceiro) {
      resumo.addRow([]);
      resumo.addRow(['Resultado financeiro']).font = { bold: true };
      for (const linha of this.linhasFinanceiras(r)) resumo.addRow(linha);
      const categorias = livro.addWorksheet('Custos');
      categorias.columns = [
        { header: 'Categoria', width: 20 },
        { header: 'Valor (R$)', width: 16, style: { numFmt: '#,##0.00' } },
        { header: 'Participação (%)', width: 18, style: { numFmt: '0.0' } },
      ];
      categorias.getRow(1).font = { bold: true };
      for (const c of r.financeiro.porCategoria)
        categorias.addRow([nomeCategoria(c.categoria), c.valor, c.percentual]);
    }

    const cargas = livro.addWorksheet('Cargas');
    cargas.columns = [
      { header: 'Data', width: 12 },
      { header: 'Aves', width: 10 },
      { header: 'Peso (kg)', width: 12, style: { numFmt: '#,##0.0' } },
      ...(d.verFinanceiro
        ? [{ header: 'Preço (R$/kg)', width: 14, style: { numFmt: '0.00' } }]
        : []),
      { header: 'Destino', width: 24 },
      { header: 'GTA', width: 14 },
    ];
    cargas.getRow(1).font = { bold: true };
    for (const c of d.cargas) {
      cargas.addRow([
        br(c.data),
        c.aves,
        c.pesoTotalKg,
        ...(d.verFinanceiro ? [c.precoKg] : []),
        c.destino ?? '',
        c.numeroGta ?? '',
      ]);
    }

    const sanidade = livro.addWorksheet('Sanidade');
    sanidade.columns = [
      { header: 'Data', width: 12 },
      { header: 'Tipo', width: 14 },
      { header: 'Descrição', width: 40 },
      { header: 'Produto', width: 22 },
      { header: 'Carência (dias)', width: 15 },
    ];
    sanidade.getRow(1).font = { bold: true };
    for (const o of d.ocorrencias) {
      sanidade.addRow([
        br(o.data),
        NOME_TIPO_OCORRENCIA[o.tipo],
        o.descricao,
        o.produto ?? '',
        o.carenciaDias ?? '',
      ]);
    }

    return Buffer.from(await livro.xlsx.writeBuffer());
  }
}
