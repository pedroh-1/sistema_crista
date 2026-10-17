import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AlertasModule } from '../alertas/alertas.module';
import { AuthModule } from '../auth/auth.module';
import { validarAmbiente } from '../comum/ambiente';
import { ComumModule } from '../comum/comum.module';
import { LIMITE_GERAL } from '../comum/limites';
import { EquipamentosModule } from '../equipamentos/equipamentos.module';
import { PrismaErrosFilter } from '../comum/prisma-erros.filter';
import { FazendasModule } from '../fazendas/fazendas.module';
import { HealthController } from '../health/health.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ProducaoModule } from '../producao/producao.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validarAmbiente }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [LIMITE_GERAL],
        // Os testes de integração fazem muitos logins seguidos do mesmo IP.
        skipIf: () => config.get('LIMITE_REQUISICOES') === 'desligado',
      }),
    }),
    PrismaModule,
    ComumModule,
    AuthModule,
    FazendasModule,
    ProducaoModule,
    AlertasModule,
    EquipamentosModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: PrismaErrosFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
