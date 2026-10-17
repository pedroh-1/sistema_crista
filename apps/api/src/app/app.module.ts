import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AlertasModule } from '../alertas/alertas.module';
import { AuthModule } from '../auth/auth.module';
import { ComumModule } from '../comum/comum.module';
import { EquipamentosModule } from '../equipamentos/equipamentos.module';
import { PrismaErrosFilter } from '../comum/prisma-erros.filter';
import { FazendasModule } from '../fazendas/fazendas.module';
import { HealthController } from '../health/health.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ProducaoModule } from '../producao/producao.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ComumModule,
    AuthModule,
    FazendasModule,
    ProducaoModule,
    AlertasModule,
    EquipamentosModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: PrismaErrosFilter }],
})
export class AppModule {}
