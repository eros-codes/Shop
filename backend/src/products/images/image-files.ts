import { randomUUID } from 'crypto';
import { FileStorage } from '../../common/storage/file-storage';
import { ImageSize, ProductImage } from '../entities/product-image.entity';
import { Rendition } from './product-image-processor';

export const PRODUCT_IMAGES_FOLDER = 'products';

export interface StoredImage {
  filename: string;
  url: string;
  sizes: ImageSize[];
}

// Writes one photo's renditions (smallest first). The largest is the
// image itself (<id>.webp); the others carry their width (<id>-400.webp).
// `onSaved` hears of every file as soon as it exists, so a caller can
// remove them all if something later fails.
export async function storeRenditions(
  storage: FileStorage,
  renditions: Rendition[],
  onSaved: (key: string) => void = () => undefined,
): Promise<StoredImage> {
  const id = randomUUID();
  const largest = renditions[renditions.length - 1];
  const sizes: ImageSize[] = [];
  for (const rendition of renditions) {
    const filename =
      rendition === largest ? `${id}.webp` : `${id}-${rendition.width}.webp`;
    const key = `${PRODUCT_IMAGES_FOLDER}/${filename}`;
    await storage.save(key, rendition.buffer);
    onSaved(key);
    sizes.push({ width: rendition.width, url: storage.getPublicUrl(key) });
  }
  return {
    filename: `${id}.webp`,
    url: sizes[sizes.length - 1].url,
    sizes,
  };
}

// Every file one image occupies: the image itself and each stored width
// (named after the last part of its URL).
export function storedKeysOf(
  image: Pick<ProductImage, 'filename' | 'sizes'>,
): string[] {
  const names = new Set([image.filename]);
  for (const size of image.sizes ?? []) {
    const name = size.url.split('/').pop();
    if (name) names.add(decodeURIComponent(name));
  }
  return [...names].map((name) => `${PRODUCT_IMAGES_FOLDER}/${name}`);
}
