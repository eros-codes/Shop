import { BadRequestException } from '@nestjs/common';
import { detectImageType } from './image-file';
import { ProductImagesPipe } from '../pipes/product-images.pipe';

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const gif = Buffer.from('GIF89a......', 'ascii');
const webp = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.alloc(4),
  Buffer.from('WEBPVP8 ', 'ascii'),
]);
const html = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');

describe('detectImageType', () => {
  it('recognises images by their magic bytes', () => {
    expect(detectImageType(png)?.extension).toBe('png');
    expect(detectImageType(jpg)?.extension).toBe('jpg');
    expect(detectImageType(gif)?.extension).toBe('gif');
    expect(detectImageType(webp)?.extension).toBe('webp');
  });

  it('rejects anything else, whatever it claims to be', () => {
    expect(detectImageType(html)).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('ProductImagesPipe', () => {
  const pipe = new ProductImagesPipe();
  const file = (buffer: Buffer, mimetype = 'image/png') =>
    ({
      buffer,
      mimetype,
      originalname: 'x.png',
      size: buffer.length,
    }) as Express.Multer.File;

  it('derives the extension from the content, ignoring the declared type', () => {
    const [image] = pipe.transform([file(jpg, 'image/png')]);
    expect(image.extension).toBe('jpg');
    expect(image.mimeType).toBe('image/jpeg');
  });

  it('rejects an HTML file sent with a fake image/png content type', () => {
    expect(() => pipe.transform([file(png), file(html, 'image/png')])).toThrow(
      BadRequestException,
    );
  });

  it('rejects an empty upload', () => {
    expect(() => pipe.transform([])).toThrow(BadRequestException);
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
  });
});
