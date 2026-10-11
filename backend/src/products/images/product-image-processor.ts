import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';

// The widths every uploaded photo is kept at. A product card asks for the
// 400 (the 800 on a sharp phone screen), the product page for the 800 or
// the 1600. A phone photo straight off the camera is ~4000px and 3-5MB;
// a product card used to download all of it to draw 180px.
export const IMAGE_WIDTHS = [400, 800, 1600] as const;

// What gets decoded at most. A small file can describe an enormous image
// (a "decompression bomb"); without a ceiling, decoding one takes the
// server's memory with it. 50MP is well above any camera photo.
const MAX_INPUT_PIXELS = 50_000_000;

const WEBP_QUALITY = 80;

export interface Rendition {
  width: number;
  height: number;
  buffer: Buffer;
}

@Injectable()
export class ProductImageProcessor {
  // The photo at each of IMAGE_WIDTHS (its longer side at most that wide),
  // smallest first, as WebP. Turned upright by its EXIF orientation, and
  // nothing of the EXIF kept - a phone photo carries the GPS position of
  // where it was taken. Never enlarged: a small original yields fewer
  // renditions rather than blurry copies of itself.
  async renditions(input: Buffer, index = 0): Promise<Rendition[]> {
    try {
      const source = sharp(input, {
        limitInputPixels: MAX_INPUT_PIXELS,
        animated: false,
      });
      const renditions: Rendition[] = [];
      for (const width of IMAGE_WIDTHS) {
        const { data, info } = await source
          .clone()
          .rotate()
          .resize({
            width,
            height: width,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer({ resolveWithObject: true });
        if (renditions.some((done) => done.width === info.width)) continue;
        renditions.push({
          width: info.width,
          height: info.height,
          buffer: data,
        });
      }
      return renditions;
    } catch (error) {
      throw AppError.badRequest(
        ErrorCodes.IMAGE_UNREADABLE,
        `File #${index + 1} could not be read as an image: ${(error as Error).message}`,
        { file: index + 1 },
      );
    }
  }
}
