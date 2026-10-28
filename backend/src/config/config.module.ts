import { Global, Module } from '@nestjs/common';
import { FieldCipher, parseKeyRing } from '../common/crypto/field-cipher.js';
import { GcsStorage, LocalStorage, ObjectStorage } from '../common/storage/object-storage.js';
import { parseEnv, type Env } from './env.js';

/** Injection token for the validated environment. */
export const ENV = Symbol('ENV');

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: (): Env => parseEnv(process.env) },
    {
      provide: FieldCipher,
      inject: [ENV],
      useFactory: (env: Env) =>
        new FieldCipher(
          parseKeyRing(env.FIELD_ENCRYPTION_KEYS),
          Buffer.from(env.FIELD_INDEX_KEY, 'base64'),
        ),
    },
    {
      provide: ObjectStorage,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.STORAGE_DRIVER === 'gcs'
          ? new GcsStorage(env.STORAGE_BUCKET!)
          : new LocalStorage(env.STORAGE_DIR),
    },
  ],
  exports: [ENV, FieldCipher, ObjectStorage],
})
export class ConfigModule {}
