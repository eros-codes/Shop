import { Global, Module } from '@nestjs/common';
import { FileStorage } from './file-storage';
import { LocalFileStorage } from './local-file-storage';

@Global()
@Module({
  providers: [{ provide: FileStorage, useClass: LocalFileStorage }],
  exports: [FileStorage],
})
export class StorageModule {}
