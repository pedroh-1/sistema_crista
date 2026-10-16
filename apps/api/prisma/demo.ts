/**
 * Cria contas e dados de demonstração no banco de desenvolvimento.
 * Rodar com: npm run demo
 *
 * Os dados entram direto no banco, sem passar pela API: servem para explorar
 * as telas, não ficam na auditoria e não devem ir para produção.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '../src/generated/prisma/client';

const SENHA = 'crista123';
const CNPJ_DEMO = '11444777000161';
const CONTAS = [
  {
    email: 'gestor@demo.crista',
    nome: 'Gabriela Gestora',
    perfil: 'gestor' as const,
  },
  {
    email: 'operador@demo.crista',
    nome: 'Otávio Operador',
    perfil: 'operador' as const,
  },
  {
    email: 'veterinaria@demo.crista',
    nome: 'Vera Veterinária',
    perfil: 'veterinario' as const,
  },
  {
    email: 'produtor@demo.crista',
    nome: 'Paulo Produtor',
    perfil: 'produtor' as const,
  },
  {
    email: 'consulta@demo.crista',
    nome: 'Carla Consulta',
    perfil: 'consulta' as const,
  },
];

// Peso médio aproximado de frango de corte por idade (g). Só para a demonstração.
const PESO_POR_IDADE: Record<number, number> = {
  7: 185,
  14: 470,
  21: 920,
  28: 1460,
};

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env['DATABASE_URL'] ?? '',
  }),
});

function dia(deslocamento: number): Date {
  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
  const d = new Date(`${hoje}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deslocamento);
  return d;
}

/** Número pseudoaleatório estável, para os dados saírem iguais a cada execução. */
function sorteador(semente: number) {
  return () => {
    semente = (semente * 1103515245 + 12345) % 2 ** 31;
    return semente / 2 ** 31;
  };
}

function imprimirContas() {
  console.log(`\nContas de demonstração (senha de todas: ${SENHA})\n`);
  for (const c of CONTAS) console.log(`  ${c.perfil.padEnd(12)} ${c.email}`);
  console.log('\nO Operador só tem acesso ao Galpão 1.\n');
}

async function main() {
  const existente = await prisma.fazenda.findUnique({
    where: { documento: CNPJ_DEMO },
  });
  if (existente) {
    await garantirCustos(existente.id);
    console.log('Os dados de demonstração já existem.');
    imprimirContas();
    return;
  }

  const senhaHash = await hash(SENHA);
  const usuarios = new Map<string, string>();
  for (const c of CONTAS) {
    const u = await prisma.usuario.upsert({
      where: { email: c.email },
      update: {},
      create: {
        nome: c.nome,
        email: c.email,
        senhaHash,
        status: 'ativo',
        emailVerificadoEm: new Date(),
      },
    });
    usuarios.set(c.perfil, u.id);
  }
  const gestorId = usuarios.get('gestor') as string;

  const fazenda = await prisma.fazenda.create({
    data: {
      nome: 'Granja Demonstração',
      documento: CNPJ_DEMO,
      municipio: 'Chapecó',
      uf: 'SC',
      integradora: 'Independente',
      criadoPorId: gestorId,
    },
  });
  const galpao1 = await prisma.galpao.create({
    data: {
      fazendaId: fazenda.id,
      identificacao: 'Galpão 1',
      areaUtilM2: 1500,
      capacidadeAves: 21000,
      tipo: 'climatizado',
      situacao: 'ocupado',
    },
  });
  await prisma.galpao.create({
    data: {
      fazendaId: fazenda.id,
      identificacao: 'Galpão 2',
      areaUtilM2: 1200,
      capacidadeAves: 16000,
      tipo: 'convencional',
    },
  });

  for (const c of CONTAS) {
    await prisma.vinculo.create({
      data: {
        fazendaId: fazenda.id,
        usuarioId: usuarios.get(c.perfil),
        emailConvidado: c.email,
        perfil: c.perfil,
        crmv: c.perfil === 'veterinario' ? 'SC-04321' : null,
        status: 'ativo',
        aceitoEm: new Date(),
        convidadoPorId: c.perfil === 'gestor' ? null : gestorId,
        galpoes:
          c.perfil === 'operador'
            ? { create: [{ galpaoId: galpao1.id }] }
            : undefined,
      },
    });
  }

  // Lote de 28 dias no Galpão 1
  const alojamento = dia(-28);
  const base = { fazendaId: fazenda.id };
  const lote = await prisma.lote.create({
    data: {
      ...base,
      galpaoId: galpao1.id,
      codigo: 'DEMO-01',
      linhagem: 'cobb500',
      origem: 'Incubatório Oeste',
      dataAlojamento: alojamento,
      pesoPintoG: 42,
      custoPinto: 3.1,
      quantidadePrevista: 20000,
      criadoPorId: gestorId,
    },
  });
  const operadorId = usuarios.get('operador') as string;
  const evento = { ...base, loteId: lote.id, criadoPorId: operadorId };

  await prisma.alojamento.create({
    data: {
      ...base,
      loteId: lote.id,
      data: alojamento,
      avesRecebidas: 20000,
      mortasTransporte: 40,
      criadoPorId: operadorId,
    },
  });

  const sortear = sorteador(42);
  for (let d = -27; d <= 0; d++) {
    const idade = d + 28;
    const media = idade <= 7 ? 22 : idade <= 14 ? 9 : 6;
    const mortes = Math.max(1, Math.round(media * (0.6 + sortear() * 0.8)));
    await prisma.eventoBaixa.create({
      data: {
        ...evento,
        data: dia(d),
        mortes,
        descartes: idade % 9 === 0 ? 3 : 0,
        causaProvavel: idade <= 7 ? 'Refugagem' : null,
      },
    });
  }

  for (const [idade, media] of Object.entries(PESO_POR_IDADE)) {
    const pesos = Array.from({ length: 60 }, () =>
      Math.round(media * (0.88 + sortear() * 0.24)),
    );
    await prisma.pesagem.create({
      data: {
        ...evento,
        data: dia(Number(idade) - 28),
        avesPesadas: pesos.length,
        pesoTotalG: pesos.reduce((s, p) => s + p, 0),
        pontoColeta: 'Meio do galpão',
        pesos: { create: pesos.map((pesoG) => ({ pesoG })) },
      },
    });
  }

  for (const [d, kg] of [
    [-28, 9000],
    [-18, 14000],
    [-8, 18000],
  ] as const) {
    await prisma.movimentoRacao.create({
      data: {
        ...evento,
        data: dia(d),
        tipo: 'entrada',
        quantidadeKg: kg,
        fornecedor: 'Rações Vale',
        notaFiscal: `NF-${1000 - d}`,
      },
    });
  }
  await prisma.movimentoRacao.create({
    data: {
      ...evento,
      data: dia(0),
      tipo: 'estoque_restante',
      quantidadeKg: 4200,
    },
  });

  const veterinariaId = usuarios.get('veterinario') as string;
  const sanidade = { ...base, loteId: lote.id, criadoPorId: veterinariaId };
  await prisma.ocorrenciaSanitaria.create({
    data: {
      ...sanidade,
      data: dia(-14),
      tipo: 'vacinacao',
      descricao: 'Vacina contra Gumboro',
      produto: 'Bursine Plus',
      dose: '1 dose/ave',
      via: 'agua',
      loteProduto: 'BP-2291',
      carenciaDias: 0,
    },
  });
  await prisma.ocorrenciaSanitaria.create({
    data: {
      ...sanidade,
      data: dia(-3),
      tipo: 'medicacao',
      descricao: 'Tratamento de quadro respiratório leve',
      produto: 'Enrofloxacina 10%',
      dose: '10 mg/kg',
      via: 'agua',
      loteProduto: 'ENR-0877',
      carenciaDias: 7,
    },
  });
  await prisma.ocorrenciaSanitaria.create({
    data: {
      ...sanidade,
      data: dia(-1),
      tipo: 'inspecao',
      descricao:
        'Cama úmida perto dos bebedouros do fundo; pedido ajuste de vazão.',
    },
  });

  await garantirCustos(fazenda.id);
  console.log(
    'Dados de demonstração criados: Granja Demonstração, Galpões 1 e 2, lote DEMO-01 com 28 dias.',
  );
  imprimirContas();
}

/** Despesas e preço de referência do lote DEMO-01 (Fase 4). Só cria se ainda não houver despesas. */
async function garantirCustos(fazendaId: string) {
  if ((await prisma.despesa.count({ where: { fazendaId } })) > 0) return;
  const lote = await prisma.lote.findFirstOrThrow({
    where: { fazendaId, codigo: 'DEMO-01' },
  });
  const produtor = await prisma.usuario.findUniqueOrThrow({
    where: { email: 'produtor@demo.crista' },
  });
  await prisma.lote.update({
    where: { id: lote.id },
    data: { precoReferenciaKg: 6.2 },
  });
  const despesas = [
    {
      d: -28,
      categoria: 'racao',
      descricao: 'Ração inicial: 9.000 kg',
      valor: 17100,
      fornecedor: 'Rações Vale',
      nota: 'NF-1028',
    },
    {
      d: -18,
      categoria: 'racao',
      descricao: 'Ração crescimento: 14.000 kg',
      valor: 25900,
      fornecedor: 'Rações Vale',
      nota: 'NF-1018',
    },
    {
      d: -8,
      categoria: 'racao',
      descricao: 'Ração crescimento: 18.000 kg',
      valor: 32400,
      fornecedor: 'Rações Vale',
      nota: 'NF-1008',
    },
    {
      d: -27,
      categoria: 'cama',
      descricao: 'Maravalha',
      valor: 4800,
      fornecedor: 'Serraria Sul',
      nota: '311',
    },
    {
      d: -20,
      categoria: 'gas',
      descricao: 'Gás para aquecimento',
      valor: 3600,
      fornecedor: 'Gás Oeste',
      nota: '8812',
    },
    {
      d: -5,
      categoria: 'energia',
      descricao: 'Energia elétrica',
      valor: 2950,
      fornecedor: 'Celesc',
      nota: '552019',
    },
    {
      d: -3,
      categoria: 'medicamentos',
      descricao: 'Enrofloxacina 10%',
      valor: 1240,
      fornecedor: 'Agrovet',
      nota: '7710',
    },
    {
      d: -1,
      categoria: 'mao_de_obra',
      descricao: 'Mão de obra do mês',
      valor: 4500,
      fornecedor: null,
      nota: null,
    },
  ] as const;
  for (const x of despesas) {
    await prisma.despesa.create({
      data: {
        fazendaId,
        data: dia(x.d),
        categoria: x.categoria,
        descricao: x.descricao,
        valor: x.valor,
        fornecedor: x.fornecedor,
        numeroNota: x.nota,
        criadoPorId: produtor.id,
        rateios: {
          create: [{ loteId: lote.id, percentual: 100, valor: x.valor }],
        },
      },
    });
  }
  console.log(
    'Despesas de demonstração lançadas no lote DEMO-01 (preço de referência R$ 6,20/kg).',
  );
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
