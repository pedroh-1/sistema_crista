import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface Saude {
  status: 'ok';
  banco: 'ok';
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async verificar(): Promise<Saude> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'erro',
        banco: 'indisponivel',
      });
    }
    return { status: 'ok', banco: 'ok' };
  }
}
