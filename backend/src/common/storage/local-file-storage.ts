import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, rename, unlink, writeFile } from 'fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'path';
import { FileStorage } from './file-storage';

export function resolveUploadRoot(uploadDir?: string): string {
  const dir = uploadDir?.trim() || 'uploads';
  return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

@Injectable()
export class LocalFileStorage extends FileStorage {
  private readonly logger = new Logger(LocalFileStorage.name);
  private readonly root: string;
  private readonly publicBaseUrl: string;

  constructor(configService: ConfigService) {
    super();
    this.root = resolveUploadRoot(configService.get<string>('UPLOAD_DIR'));
    const backendUrl = configService.get<string>('BACKEND_URL') ?? '';
    this.publicBaseUrl = `${backendUrl.replace(/\/+$/, '')}/uploads`;
  }

  async save(key: string, data: Buffer): Promise<void> {
    const target = this.resolveKey(key);
    await mkdir(dirname(target), { recursive: true });
    const tempPath = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, data, { flag: 'wx' });
      await rename(tempPath, target);
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(
          `Could not delete stored file "${key}": ${(error as Error).message}`,
        );
      }
    }
  }

  getPublicUrl(key: string): string {
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `${this.publicBaseUrl}/${encodedKey}`;
  }

  private resolveKey(key: string): string {
    const target = resolve(this.root, key);
    if (!target.startsWith(this.root + sep)) {
      throw new Error(`Refusing to use a path outside the upload root: ${key}`);
    }
    return target;
  }
}
