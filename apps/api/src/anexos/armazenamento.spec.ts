import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  armazenamentoProvider,
  ArmazenamentoDisco,
  ArmazenamentoS3,
} from './armazenamento';

const ler = async (r: Readable) => {
  const partes: Buffer[] = [];
  for await (const p of r) partes.push(Buffer.from(p));
  return Buffer.concat(partes).toString();
};

const fabrica = (
  armazenamentoProvider as { useFactory: (c: ConfigService) => unknown }
).useFactory;

describe('Armazenamento em disco', () => {
  let pasta: string;
  let disco: ArmazenamentoDisco;

  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), 'crista-armazenamento-'));
    disco = new ArmazenamentoDisco(pasta);
  });
  afterEach(() => rm(pasta, { recursive: true, force: true }));

  it('grava, lê e nunca sobrescreve', async () => {
    await disco.gravar('fazenda/anexo', Buffer.from('laudo'));
    expect(await ler(await disco.ler('fazenda/anexo'))).toBe('laudo');
    await expect(
      disco.gravar('fazenda/anexo', Buffer.from('outro')),
    ).rejects.toThrow();
  });

  it('recusa chave que sai da pasta', async () => {
    await expect(disco.gravar('../fora', Buffer.from('x'))).rejects.toThrow(
      'Chave de anexo inválida',
    );
  });
});

describe('Armazenamento S3', () => {
  const config = (valores: Record<string, string>) =>
    new ConfigService(valores);

  it('grava sem sobrescrever, com criptografia, e lê do bucket', async () => {
    const s3 = new ArmazenamentoS3(
      config({ S3_BUCKET: 'anexos', S3_ENDPOINT: 'http://localhost:9000' }),
    );
    const enviados: unknown[] = [];
    // Substitui a chamada à rede pelo registro do comando.
    (s3 as unknown as { cliente: { send: unknown } }).cliente.send = async (
      comando: unknown,
    ) => {
      enviados.push(comando);
      return { Body: Readable.from(['laudo']) };
    };

    await s3.gravar('fazenda/anexo', Buffer.from('laudo'));
    const put = enviados[0] as PutObjectCommand;
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect(put.input).toMatchObject({
      Bucket: 'anexos',
      Key: 'fazenda/anexo',
      IfNoneMatch: '*',
      ServerSideEncryption: 'AES256',
    });

    expect(await ler(await s3.ler('fazenda/anexo'))).toBe('laudo');
    expect(enviados[1]).toBeInstanceOf(GetObjectCommand);
  });

  it('a escolha vem de ARMAZENAMENTO', () => {
    expect(fabrica(config({}))).toBeInstanceOf(ArmazenamentoDisco);
    expect(
      fabrica(config({ ARMAZENAMENTO: 's3', S3_BUCKET: 'anexos' })),
    ).toBeInstanceOf(ArmazenamentoS3);
    expect(() => fabrica(config({ ARMAZENAMENTO: 'ftp' }))).toThrow(
      /ARMAZENAMENTO inválido/,
    );
  });
});
