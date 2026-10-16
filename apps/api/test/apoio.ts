import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';
import { EmailService, Mensagem } from '../src/email/email.service';
import { FilaService } from '../src/fila/fila.service';
import { PrismaService } from '../src/prisma/prisma.service';

/** Todas as tabelas, para começar cada arquivo de teste com o banco vazio. */
const TABELAS = [
  'conta.usuario',
  'conta.aceite_termos',
  'conta.token_verificacao',
  'fazenda.fazenda',
  'fazenda.galpao',
  'fazenda.vinculo_usuario_fazenda',
  'fazenda.vinculo_galpao',
  'producao.lote',
  'producao.alojamento',
  'producao.evento_baixa',
  'producao.pesagem',
  'producao.pesagem_individual',
  'producao.movimento_racao',
  'producao.estorno',
  'sanidade.ocorrencia_sanitaria',
  'producao.saida_carga',
  'producao.encerramento_lote',
  'alertas.regra_alerta',
  'alertas.alerta',
  'alertas.notificacao',
  'fila.tarefa',
  'custos.despesa',
  'custos.despesa_rateio',
  'arquivo.anexo',
  'auditoria.evento_auditoria',
];

/** Sobe a API inteira com o e-mail capturado em memória e o banco de teste vazio. */
export async function iniciarApi() {
  const emails: Mensagem[] = [];
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EmailService)
    .useValue({ enviar: async (m: Mensagem) => void emails.push(m) })
    .compile();
  const app: INestApplication = modulo.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  const prisma = app.get(PrismaService);
  // TRUNCATE não dispara os gatilhos que bloqueiam UPDATE e DELETE.
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABELAS.join(', ')} CASCADE`);

  const api = () => request(app.getHttpServer());

  const tokenDoUltimoEmail = (para: string) => {
    const msg = [...emails].reverse().find((m) => m.para === para);
    const token = msg?.texto.match(/token=([\w-]+)/)?.[1];
    if (!token) throw new Error(`Nenhum link enviado para ${para}`);
    return token;
  };

  /** Cadastra, confirma o e-mail e devolve o token de acesso. */
  async function criarUsuario(email: string, nome = 'Usuário Teste') {
    await api()
      .post('/api/auth/cadastro')
      .send({ nome, email, senha: 'galinha123', aceiteTermos: true })
      .expect(201);
    await api()
      .post('/api/auth/verificar-email')
      .send({ token: tokenDoUltimoEmail(email) })
      .expect(204);
    const login = await api()
      .post('/api/auth/login')
      .send({ email, senha: 'galinha123' })
      .expect(200);
    return login.body.accessToken as string;
  }

  /** Convida para a fazenda e aceita o convite em nome do convidado. */
  async function vincular(
    gestor: string,
    fazendaId: string,
    convidado: { token: string; email: string },
    dados: { perfil: string; crmv?: string; galpoes?: string[] },
  ) {
    await api()
      .post(`/api/fazendas/${fazendaId}/vinculos`)
      .auth(gestor, { type: 'bearer' })
      .send({ email: convidado.email, ...dados })
      .expect(201);
    await api()
      .post('/api/convites/aceitar')
      .auth(convidado.token, { type: 'bearer' })
      .send({ token: tokenDoUltimoEmail(convidado.email) })
      .expect(200);
  }

  /** Roda as tarefas da fila (avaliação de alertas, notificações). */
  const processarFila = () => app.get(FilaService).esvaziar();

  return {
    processarFila,
    app,
    prisma,
    api,
    emails,
    tokenDoUltimoEmail,
    criarUsuario,
    vincular,
  };
}

/** Data de hoje deslocada em dias (AAAA-MM-DD, fuso de São Paulo). */
export function diasAtras(dias: number): string {
  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
  const d = new Date(`${hoje}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}
