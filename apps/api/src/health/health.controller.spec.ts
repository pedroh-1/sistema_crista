import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const criar = (queryRaw: jest.Mock) =>
    new HealthController({ $queryRaw: queryRaw } as unknown as PrismaService);

  it('responde ok quando o banco responde', async () => {
    const controller = criar(jest.fn().mockResolvedValue([{ '?column?': 1 }]));
    await expect(controller.verificar()).resolves.toEqual({
      status: 'ok',
      banco: 'ok',
    });
  });

  it('responde 503 quando o banco está fora do ar', async () => {
    const controller = criar(
      jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    );
    await expect(controller.verificar()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
