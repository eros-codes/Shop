import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { detectImageType, ImageExtension } from '../utils/image-file';

export const MAX_IMAGES_PER_UPLOAD = 10;
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export interface ValidatedImage {
  buffer: Buffer;
  extension: ImageExtension;
  mimeType: string;
  size: number;
}

@Injectable()
export class ProductImagesPipe implements PipeTransform<
  Express.Multer.File[] | undefined,
  ValidatedImage[]
> {
  transform(files: Express.Multer.File[] | undefined): ValidatedImage[] {
    if (!Array.isArray(files) || files.length === 0) {
      throw new BadRequestException(
        'Upload at least one image in the "images" field',
      );
    }

    return files.map((file, index) => {
      const label = `File #${index + 1}`;
      if (!file.buffer || file.buffer.length === 0) {
        throw new BadRequestException(`${label} is empty`);
      }
      if (file.buffer.length > MAX_IMAGE_SIZE_BYTES) {
        throw new BadRequestException(`${label} is larger than 5MB`);
      }
      const detected = detectImageType(file.buffer);
      if (!detected) {
        throw new BadRequestException(
          `${label} is not a JPEG, PNG, GIF or WebP image`,
        );
      }
      return {
        buffer: file.buffer,
        extension: detected.extension,
        mimeType: detected.mimeType,
        size: file.buffer.length,
      };
    });
  }
}
