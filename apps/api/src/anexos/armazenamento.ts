import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, ReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * Onde os anexos ficam. Implementação em disco para desenvolvimento e
 * servidor único; em produção, trocar por S3 mantendo a mesma interface.
 */
@Injectable()
export class Armazenamento {
  private readonly raiz: string;

  constructor(config: ConfigService) {
    this.raiz = resolve(
      config.get<string>('ARMAZENAMENTO_DIR') ?? './armazenamento',
    );
  }

  async gravar(chave: string, conteudo: Buffer): Promise<void> {
    const caminho = this.caminho(chave);
    await mkdir(dirname(caminho), { recursive: true });
    await writeFile(caminho, conteudo, { flag: 'wx' });
  }

  ler(chave: string): ReadStream {
    return createReadStream(this.caminho(chave));
  }

  private caminho(chave: string): string {
    const caminho = resolve(join(this.raiz, chave));
    if (!caminho.startsWith(this.raiz))
      throw new Error('Chave de anexo inválida');
    return caminho;
  }
}
