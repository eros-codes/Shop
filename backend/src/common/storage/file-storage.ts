export abstract class FileStorage {
  abstract save(key: string, data: Buffer): Promise<void>;

  abstract delete(key: string): Promise<void>;

  abstract getPublicUrl(key: string): string;
}
