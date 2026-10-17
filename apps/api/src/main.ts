import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  // A API só responde JSON e arquivos: cabeçalhos de segurança padrão do helmet.
  app.use(helmet());
  // Atrás do proxy reverso (docs/07-producao.md), o IP do cliente vem do
  // X-Forwarded-For; ele é a chave do limite de requisições.
  app.set('trust proxy', config.get<string>('CONFIAR_PROXY') ?? 'loopback');
  // Termina as requisições e a tarefa da fila em andamento ao receber SIGTERM.
  app.enableShutdownHooks();

  const port = config.get<number>('API_PORT') ?? 3000;
  await app.listen(port);
  Logger.log(`API em http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
