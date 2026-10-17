import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleInit, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';

/**
 * Onde os anexos ficam. `ARMAZENAMENTO=disco` (padrão) grava numa pasta, para
 * desenvolvimento e servidor único; `ARMAZENAMENTO=s3` usa um bucket S3 (ou
 * compatível, como o MinIO). A chave é a mesma nos dois.
 */
export abstract class Armazenamento {
  /** Grava o conteúdo; nunca sobrescreve um anexo existente. */
  abstract gravar(chave: string, conteudo: Buffer): Promise<void>;
  abstract ler(chave: string): Promise<Readable>;
}

export class ArmazenamentoDisco extends Armazenamento {
  private readonly raiz: string;

  constructor(pasta: string) {
    super();
    this.raiz = resolve(pasta);
  }

  async gravar(chave: string, conteudo: Buffer): Promise<void> {
    const caminho = this.caminho(chave);
    await mkdir(dirname(caminho), { recursive: true });
    await writeFile(caminho, conteudo, { flag: 'wx' });
  }

  async ler(chave: string): Promise<Readable> {
    return createReadStream(this.caminho(chave));
  }

  private caminho(chave: string): string {
    const caminho = resolve(join(this.raiz, chave));
    if (!caminho.startsWith(this.raiz))
      throw new Error('Chave de anexo inválida');
    return caminho;
  }
}

@Injectable()
export class ArmazenamentoS3 extends Armazenamento implements OnModuleInit {
  private readonly logger = new Logger(ArmazenamentoS3.name);
  private readonly cliente: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    super();
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    const endpoint = config.get<string>('S3_ENDPOINT');
    const acesso = config.get<string>('S3_ACESSO');
    const segredo = config.get<string>('S3_SEGREDO');
    this.cliente = new S3Client({
      region: config.get<string>('S3_REGIAO') ?? 'sa-east-1',
      // MinIO e outros compatíveis: endpoint próprio e caminho no lugar do subdomínio.
      ...(endpoint && { endpoint, forcePathStyle: true }),
      // Sem chave no ambiente, vale a cadeia padrão da AWS (perfil, papel da instância).
      ...(acesso &&
        segredo && {
          credentials: { accessKeyId: acesso, secretAccessKey: segredo },
        }),
    });
  }

  /** Falha na subida da API se o bucket não estiver acessível. */
  async onModuleInit(): Promise<void> {
    await this.cliente.send(new HeadBucketCommand({ Bucket: this.bucket }));
    this.logger.log(`Anexos no bucket S3 "${this.bucket}"`);
  }

  async gravar(chave: string, conteudo: Buffer): Promise<void> {
    await this.cliente.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: chave,
        Body: conteudo,
        IfNoneMatch: '*',
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  async ler(chave: string): Promise<Readable> {
    const resposta = await this.cliente.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: chave }),
    );
    return resposta.Body as Readable;
  }
}

export const armazenamentoProvider: Provider = {
  provide: Armazenamento,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Armazenamento => {
    const tipo = config.get<string>('ARMAZENAMENTO') ?? 'disco';
    if (tipo === 's3') return new ArmazenamentoS3(config);
    if (tipo !== 'disco')
      throw new Error(`ARMAZENAMENTO inválido: ${tipo} (use disco ou s3)`);
    return new ArmazenamentoDisco(
      config.get<string>('ARMAZENAMENTO_DIR') ?? './armazenamento',
    );
  },
};
