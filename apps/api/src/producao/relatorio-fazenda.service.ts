import { Injectable } from '@nestjs/common';
import {
  FiltroRelatorioFazenda,
  Indicador,
  NOME_LINHAGEM,
  NOME_SITUACAO_FILTRO,
  SecaoRelatorio,
} from '@crista/domain';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { AcessoFazenda } from '../fazendas/acesso-fazenda.guard';
import { PrismaService } from '../prisma/prisma.service';
import { br, brl, nomeCategoria, num } from './formato';
import {
  PontoAtencao,
  VisaoGeral,
  VisaoGeralService,
} from './visao-geral.service';

const MARGEM = 48;
const LARGURA = 595.28 - 2 * MARGEM;

/** Cores do Design System (styles.scss), para o PDF falar a mesma língua da tela. */
const COR = {
  texto: '#18241b',
  suave: '#525e54',
  grade: '#dde3d9',
  serie: '#2a78d6',
  critico: '#b0271d',
  atencao: '#855400',
  sucesso: '#2f6b3a',
  info: '#2559a6',
} as const;

const ROTULO_TOM: Record<PontoAtencao['tom'], string> = {
  critico: 'Crítico',
  atencao: 'Atenção',
  info: 'Informação',
  sucesso: 'Em ordem',
};

const NOME_SITUACAO_LOTE: Record<string, string> = {
  em_andamento: 'Em andamento',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
};

const ind = (i: Indicador, casas = 0, unidade = '') =>
  i.disponivel ? `${num(i.valor, casas)}${unidade}` : '—';

interface DadosRelatorioFazenda {
  visao: VisaoGeral;
  secoes: readonly SecaoRelatorio[];
  /** Filtros em texto, para o cabeçalho. */
  filtros: string;
}

/** Relatório da fazenda com o filtro da visão geral, em PDF ou XLSX. */
@Injectable()
export class RelatorioFazendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visoes: VisaoGeralService,
  ) {}

  async gerar(acesso: AcessoFazenda, filtro: FiltroRelatorioFazenda) {
    const visao = await this.visoes.visao(acesso, filtro);
    const secoes = filtro.secoes.filter(
      (s) => s !== 'custos' || visao.financeiroVisivel,
    );
    const dados = {
      visao,
      secoes,
      filtros: await this.filtrosEmTexto(visao),
    };
    const nomeArquivo = `relatorio-${visao.fazenda.nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(
        /[^\w-]+/g,
        '_',
      )}-${visao.periodo.de}-a-${visao.periodo.ate}.${filtro.formato}`;
    return {
      nome: nomeArquivo,
      conteudo:
        filtro.formato === 'pdf'
          ? await this.pdf(dados)
          : await this.xlsx(dados),
      tipo:
        filtro.formato === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private async filtrosEmTexto(v: VisaoGeral): Promise<string> {
    const partes = [NOME_SITUACAO_FILTRO[v.filtro.situacao]];
    if (v.filtro.galpao) {
      const g = await this.prisma.galpao.findUnique({
        where: { id: v.filtro.galpao },
        select: { identificacao: true },
      });
      partes.push(`galpão ${g?.identificacao ?? '—'}`);
    }
    if (v.filtro.lote) {
      const lote = v.lotes.find((l) => l.id === v.filtro.lote);
      partes.push(`lote ${lote?.codigo ?? '—'}`);
    }
    return partes.join(' · ');
  }

  /** Indicadores principais, sempre presentes; os financeiros só para quem vê. */
  private linhasIndicadores(v: VisaoGeral): [string, string][] {
    const i = v.indicadores;
    const linhas: [string, string][] = [
      [
        'Lotes no período',
        `${num(i.lotes.total)} (${num(i.lotes.emAndamento)} em andamento, ${num(i.lotes.encerrados)} encerrados)`,
      ],
      ['Aves alojadas', num(i.avesAlojadas)],
      ['Plantel atual (lotes em andamento)', `${num(i.plantelAtual)} aves`],
      ['Mortes e descartes', num(i.baixas)],
      ['Mortalidade acumulada (ponderada)', ind(i.mortalidade, 2, '%')],
      ['Viabilidade', ind(i.viabilidade, 2, '%')],
      ['Conversão alimentar (ponderada)', ind(i.conversaoAlimentar, 3)],
      ['IEP médio dos lotes', ind(i.iepMedio)],
      [
        'Meta de peso na última pesagem',
        `${i.meta.dentro} dentro · ${i.meta.abaixo} abaixo · ${i.meta.acima} acima · ${i.meta.semPesagem} sem pesagem`,
      ],
      [
        'Alertas abertos',
        `${num(v.alertas.abertos)} (${num(v.alertas.criticos)} críticos)`,
      ],
    ];
    if (v.financeiroVisivel) {
      linhas.push(['Custo total dos lotes', brl(i.custoTotal)]);
      linhas.push(['Margem prevista dos lotes', brl(i.margem)]);
    }
    return linhas;
  }

  private pdf(d: DadosRelatorioFazenda): Promise<Buffer> {
    const v = d.visao;
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: MARGEM,
        info: { Title: `Relatório da fazenda ${v.fazenda.nome}` },
      });
      const partes: Buffer[] = [];
      doc.on('data', (p: Buffer) => partes.push(p));
      doc.on('end', () => resolve(Buffer.concat(partes)));
      doc.on('error', reject);

      const garantirEspaco = (altura: number) => {
        if (doc.y + altura > doc.page.height - MARGEM) doc.addPage();
      };
      const titulo = (t: string) => {
        garantirEspaco(60);
        doc
          .moveDown(0.8)
          .font('Helvetica-Bold')
          .fontSize(12)
          .fillColor(COR.texto)
          .text(t, MARGEM)
          .moveDown(0.3)
          .font('Helvetica')
          .fontSize(10);
      };

      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor(COR.texto)
        .text(`Relatório da fazenda: ${v.fazenda.nome}`);
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(COR.suave)
        .text(
          `${v.fazenda.municipio}/${v.fazenda.uf} · período de ${br(v.periodo.de)} a ${br(v.periodo.ate)} · ${d.filtros}`,
        )
        .fillColor(COR.texto);

      titulo('Indicadores principais');
      for (const [rotulo, valor] of this.linhasIndicadores(v)) {
        const y = doc.y;
        doc.text(rotulo, MARGEM, y, { width: 250 });
        doc.text(valor, MARGEM + 250, y, {
          width: LARGURA - 250,
          align: 'right',
        });
        doc.moveDown(0.15);
      }
      doc.x = MARGEM;

      if (d.secoes.includes('atencao')) {
        titulo('Pontos de atenção');
        for (const p of v.atencao) {
          garantirEspaco(30);
          const y = doc.y;
          doc
            .font('Helvetica-Bold')
            .fillColor(COR[p.tom])
            .text(ROTULO_TOM[p.tom], MARGEM, y, { width: 70 });
          doc
            .font('Helvetica')
            .fillColor(COR.texto)
            .text(p.texto, MARGEM + 76, y, { width: LARGURA - 76 });
          doc.moveDown(0.2);
        }
        doc.x = MARGEM;
      }

      if (d.secoes.includes('mortalidade')) {
        titulo('Mortalidade diária da fazenda (%)');
        if (v.mortalidadeDiaria.length === 0) {
          doc.text('Nenhuma baixa lançada no período.');
        } else {
          this.graficoMortalidade(doc, v);
        }
      }

      if (d.secoes.includes('lotes')) {
        titulo('Comparação dos lotes');
        if (v.lotes.length === 0) doc.text('Nenhum lote no período.');
        else this.tabelaLotes(doc, v);
      }

      if (d.secoes.includes('custos') && v.custos) {
        titulo('Custos por categoria (acumulado dos lotes)');
        if (v.custos.porCategoria.length === 0)
          doc.text('Nenhum custo lançado nos lotes.');
        for (const c of v.custos.porCategoria) {
          const y = doc.y;
          doc.text(nomeCategoria(c.categoria), MARGEM, y, { width: 250 });
          doc.text(
            `${brl(c.valor)} (${num(c.percentual, 1)}%)`,
            MARGEM + 250,
            y,
            {
              width: LARGURA - 250,
              align: 'right',
            },
          );
          doc.moveDown(0.15);
        }
        doc.x = MARGEM;
        if (v.custos.porMes.length > 0) {
          titulo('Despesas lançadas por mês no período');
          for (const m of v.custos.porMes) {
            const y = doc.y;
            const [ano, mes] = m.mes.split('-');
            doc.text(`${mes}/${ano}`, MARGEM, y, { width: 250 });
            doc.text(brl(m.valor), MARGEM + 250, y, {
              width: LARGURA - 250,
              align: 'right',
            });
            doc.moveDown(0.15);
          }
          doc.x = MARGEM;
        }
      }

      doc
        .moveDown(1.5)
        .fontSize(8)
        .fillColor(COR.suave)
        .text(
          `Gerado pelo CRISTA em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. ` +
            'Mortalidade e conversão ponderadas pelas aves e pelos quilos de cada lote. Lote encerrado aparece como estava no encerramento. ' +
            'As cores seguem os limites dos alertas configurados na fazenda.',
          MARGEM,
        );
      doc.end();
    });
  }

  /** Linha da mortalidade diária, com o pior nível do dia marcado no ponto. */
  private graficoMortalidade(doc: PDFKit.PDFDocument, v: VisaoGeral) {
    const pontos = v.mortalidadeDiaria;
    const altura = 150;
    const esquerda = MARGEM + 36;
    const largura = LARGURA - 36;
    if (doc.y + altura + 40 > doc.page.height - MARGEM) doc.addPage();
    const topo = doc.y + 6;
    const base = topo + altura;
    const maximo = Math.max(...pontos.map((p) => p.percentual), 0.1);
    const passo = maximo > 2 ? 1 : maximo > 1 ? 0.5 : maximo > 0.4 ? 0.2 : 0.1;
    const teto = Math.ceil(maximo / passo) * passo;
    const dia = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 864e5;
    const x0 = dia(v.periodo.de);
    const x1 = Math.max(dia(v.periodo.ate), x0 + 1);
    const X = (iso: string) =>
      esquerda + ((dia(iso) - x0) / (x1 - x0)) * largura;
    const Y = (pct: number) => base - (pct / teto) * altura;

    doc.fontSize(8).fillColor(COR.suave);
    for (let t = 0; t <= teto + 1e-9; t += passo) {
      doc
        .moveTo(esquerda, Y(t))
        .lineTo(esquerda + largura, Y(t))
        .lineWidth(0.5)
        .strokeColor(COR.grade)
        .stroke();
      doc.text(`${num(t, passo < 1 ? 1 : 0)}%`, MARGEM, Y(t) - 4, {
        width: 30,
        align: 'right',
      });
    }
    doc.text(br(v.periodo.de), esquerda, base + 4, { width: 80 });
    doc.text(br(v.periodo.ate), esquerda + largura - 80, base + 4, {
      width: 80,
      align: 'right',
    });

    pontos.forEach((p, i) => {
      if (i === 0) doc.moveTo(X(p.data), Y(p.percentual));
      else doc.lineTo(X(p.data), Y(p.percentual));
    });
    doc.lineWidth(1.5).strokeColor(COR.serie).stroke();
    for (const p of pontos) {
      const cor =
        p.nivel === 'critico'
          ? COR.critico
          : p.nivel === 'atencao'
            ? COR.atencao
            : COR.serie;
      doc
        .circle(X(p.data), Y(p.percentual), p.nivel === 'normal' ? 1.8 : 3)
        .fill(cor);
    }
    doc.x = MARGEM;
    doc.y = base + 18;
    const criticos = pontos.filter((p) => p.nivel === 'critico').length;
    const atencao = pontos.filter((p) => p.nivel === 'atencao').length;
    doc
      .fontSize(9)
      .fillColor(COR.suave)
      .text(
        `${pontos.length} dias com baixa lançada · ${criticos} acima do limite crítico · ${atencao} acima do limite de atenção (pior lote do dia, pelo limite da idade dele).`,
        MARGEM,
      )
      .fontSize(10)
      .fillColor(COR.texto);
  }

  private tabelaLotes(doc: PDFKit.PDFDocument, v: VisaoGeral) {
    const colunas = [
      { titulo: 'Lote', largura: 62, alinha: 'left' as const },
      { titulo: 'Galpão', largura: 52, alinha: 'left' as const },
      { titulo: 'Situação', largura: 64, alinha: 'left' as const },
      { titulo: 'Alojadas', largura: 52, alinha: 'right' as const },
      { titulo: 'Mortal.', largura: 44, alinha: 'right' as const },
      { titulo: 'Peso (g)', largura: 48, alinha: 'right' as const },
      { titulo: 'Peso×curva', largura: 58, alinha: 'right' as const },
      { titulo: 'CA', largura: 40, alinha: 'right' as const },
      { titulo: 'IEP', largura: 40, alinha: 'right' as const },
    ];
    const linha = (
      valores: string[],
      negrito = false,
      cores: string[] = [],
    ) => {
      if (doc.y + 16 > doc.page.height - MARGEM) doc.addPage();
      const y = doc.y;
      let x = MARGEM;
      doc.font(negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      colunas.forEach((c, i) => {
        doc.fillColor(cores[i] ?? COR.texto).text(valores[i], x, y, {
          width: c.largura - 4,
          align: c.alinha,
          lineBreak: false,
        });
        x += c.largura;
      });
      doc.y = y + 13;
    };
    linha(
      colunas.map((c) => c.titulo),
      true,
    );
    const corDoNivel = (n: string | null) =>
      n === 'critico' ? COR.critico : n === 'atencao' ? COR.atencao : COR.texto;
    for (const l of v.lotes) {
      linha(
        [
          l.codigo,
          l.galpao,
          NOME_SITUACAO_LOTE[l.situacao] ?? l.situacao,
          num(l.avesAlojadas),
          ind(l.mortalidade, 2, '%'),
          ind(l.pesoMedioG),
          ind(l.desvioCurva, 1, '%'),
          ind(l.conversaoAlimentar, 3),
          ind(l.iep),
        ],
        false,
        ['', '', '', '', '', '', corDoNivel(l.nivelMeta)],
      );
    }
    doc.x = MARGEM;
    doc.font('Helvetica').fontSize(10).fillColor(COR.texto);
  }

  private async xlsx(d: DadosRelatorioFazenda): Promise<Buffer> {
    const v = d.visao;
    const livro = new ExcelJS.Workbook();
    livro.creator = 'CRISTA';

    const resumo = livro.addWorksheet('Resumo');
    resumo.columns = [{ width: 36 }, { width: 48 }];
    resumo.addRow([`Relatório da fazenda ${v.fazenda.nome}`]).font = {
      bold: true,
      size: 14,
    };
    resumo.addRow(['Município', `${v.fazenda.municipio}/${v.fazenda.uf}`]);
    resumo.addRow(['Período', `${br(v.periodo.de)} a ${br(v.periodo.ate)}`]);
    resumo.addRow(['Filtros', d.filtros]);
    resumo.addRow([]);
    resumo.addRow(['Indicadores principais']).font = { bold: true };
    for (const linha of this.linhasIndicadores(v)) resumo.addRow(linha);

    if (d.secoes.includes('atencao')) {
      const aba = livro.addWorksheet('Pontos de atenção');
      aba.columns = [
        { header: 'Situação', width: 14 },
        { header: 'Ponto de atenção', width: 90 },
      ];
      aba.getRow(1).font = { bold: true };
      for (const p of v.atencao) aba.addRow([ROTULO_TOM[p.tom], p.texto]);
    }

    if (d.secoes.includes('mortalidade')) {
      const aba = livro.addWorksheet('Mortalidade diária');
      aba.columns = [
        { header: 'Data', width: 12 },
        { header: 'Baixas', width: 10 },
        { header: 'Aves no início do dia', width: 22 },
        { header: 'Mortalidade (%)', width: 16, style: { numFmt: '0.000' } },
        { header: 'Pior nível', width: 12 },
        { header: 'Lotes', width: 8 },
      ];
      aba.getRow(1).font = { bold: true };
      const nivel = {
        normal: 'Normal',
        atencao: 'Atenção',
        critico: 'Crítico',
      };
      for (const p of v.mortalidadeDiaria)
        aba.addRow([
          br(p.data),
          p.baixas,
          p.avesInicioDia,
          p.percentual,
          nivel[p.nivel],
          p.lotes,
        ]);
    }

    if (d.secoes.includes('lotes')) {
      const aba = livro.addWorksheet('Lotes');
      const n = (i: Indicador) => (i.disponivel ? i.valor : null);
      aba.columns = [
        { header: 'Lote', width: 12 },
        { header: 'Galpão', width: 12 },
        { header: 'Linhagem', width: 14 },
        { header: 'Situação', width: 14 },
        { header: 'Alojamento', width: 12 },
        { header: 'Encerramento', width: 13 },
        { header: 'Aves alojadas', width: 13 },
        { header: 'Saldo de aves', width: 13 },
        { header: 'Mortalidade (%)', width: 15, style: { numFmt: '0.00' } },
        { header: 'Peso médio (g)', width: 14, style: { numFmt: '0' } },
        { header: 'Peso × curva (%)', width: 15, style: { numFmt: '0.0' } },
        { header: 'Uniformidade (%)', width: 16, style: { numFmt: '0.0' } },
        {
          header: 'Conversão alimentar',
          width: 18,
          style: { numFmt: '0.000' },
        },
        { header: 'IEP', width: 8, style: { numFmt: '0' } },
        ...(v.financeiroVisivel
          ? [
              {
                header: 'Custo total (R$)',
                width: 16,
                style: { numFmt: '#,##0.00' },
              },
            ]
          : []),
      ];
      aba.getRow(1).font = { bold: true };
      for (const l of v.lotes)
        aba.addRow([
          l.codigo,
          l.galpao,
          NOME_LINHAGEM[l.linhagem],
          NOME_SITUACAO_LOTE[l.situacao] ?? l.situacao,
          br(l.dataAlojamento),
          l.dataEncerramento ? br(l.dataEncerramento) : '',
          l.avesAlojadas,
          l.saldoAves,
          n(l.mortalidade),
          n(l.pesoMedioG),
          n(l.desvioCurva),
          n(l.uniformidade),
          n(l.conversaoAlimentar),
          n(l.iep),
          ...(v.financeiroVisivel ? [l.financeiro?.custoTotal ?? null] : []),
        ]);
    }

    if (d.secoes.includes('custos') && v.custos) {
      const aba = livro.addWorksheet('Custos');
      aba.columns = [
        { header: 'Categoria', width: 20 },
        { header: 'Valor (R$)', width: 16, style: { numFmt: '#,##0.00' } },
        { header: 'Participação (%)', width: 18, style: { numFmt: '0.0' } },
      ];
      aba.getRow(1).font = { bold: true };
      for (const c of v.custos.porCategoria)
        aba.addRow([nomeCategoria(c.categoria), c.valor, c.percentual]);
      aba.addRow([]);
      aba.addRow(['Despesas lançadas por mês no período']).font = {
        bold: true,
      };
      for (const m of v.custos.porMes) {
        const [ano, mes] = m.mes.split('-');
        aba.addRow([`${mes}/${ano}`, m.valor]);
      }
    }

    return Buffer.from(await livro.xlsx.writeBuffer());
  }
}
