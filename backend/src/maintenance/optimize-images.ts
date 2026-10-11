// Brings product photos uploaded before resizing existed up to date: each
// one is stored again at every width, as WebP, and its row points at the
// new files. New uploads are done this way already; this is for the ones
// that came before.
//
//   npm run images:optimize                       # keeps the original files
//   npm run images:optimize -- --delete-originals # and removes them after
//
// Safe to run more than once: only images with no sizes yet are touched,
// and SVG drawings (the demo's artwork) are left alone - they scale by
// themselves. The API caches listings for a minute, so the new pictures
// show up there within one.
import 'dotenv/config';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { IsNull } from 'typeorm';
import dataSource from '../data-source';
import { ProductImage } from '../products/entities/product-image.entity';
import { ProductImageProcessor } from '../products/images/product-image-processor';
import {
  PRODUCT_IMAGES_FOLDER,
  storeRenditions,
} from '../products/images/image-files';
import {
  LocalFileStorage,
  resolveUploadRoot,
} from '../common/storage/local-file-storage';

async function optimizeImages() {
  const deleteOriginals = process.argv.includes('--delete-originals');
  const config = {
    get: (key: string) => process.env[key],
  } as unknown as ConfigService;
  const storage = new LocalFileStorage(config);
  const root = resolveUploadRoot(process.env.UPLOAD_DIR);
  const processor = new ProductImageProcessor();

  await dataSource.initialize();
  const images = dataSource.getRepository(ProductImage);
  const pending = await images.find({
    select: { id: true, filename: true },
    where: { sizes: IsNull() },
  });

  let converted = 0;
  let skipped = 0;
  let failed = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const image of pending) {
    if (/\.svg$/i.test(image.filename)) {
      skipped += 1;
      continue;
    }
    const key = `${PRODUCT_IMAGES_FOLDER}/${image.filename}`;
    try {
      const original = await readFile(join(root, key));
      const renditions = await processor.renditions(original);
      const written: string[] = [];
      try {
        const stored = await storeRenditions(storage, renditions, (saved) =>
          written.push(saved),
        );
        await images.update(image.id, stored);
      } catch (error) {
        await Promise.all(written.map((saved) => storage.delete(saved)));
        throw error;
      }
      if (deleteOriginals) await storage.delete(key);
      converted += 1;
      bytesBefore += original.length;
      bytesAfter += renditions[0].buffer.length;
    } catch (error) {
      failed += 1;
      console.error(`image ${image.id} (${key}): ${(error as Error).message}`);
    }
  }

  await dataSource.destroy();
  const kb = (bytes: number) =>
    bytes < 10 * 1024 ? `${bytes} bytes` : `${Math.round(bytes / 1024)} KB`;
  console.log(
    `Converted ${converted}, skipped ${skipped} drawing(s), failed ${failed}.`,
  );
  if (converted) {
    console.log(
      `A product card now loads ${kb(bytesAfter)} where it loaded ${kb(bytesBefore)}.`,
    );
    if (!deleteOriginals) {
      console.log(
        'The original files are still on disk; re-run with --delete-originals to remove them.',
      );
    }
  }
  if (failed) process.exitCode = 1;
}

optimizeImages().catch((error) => {
  console.error(error);
  process.exit(1);
});
