import sharp from 'sharp';
import { ProductImageProcessor } from './product-image-processor';

// Real images, made here with sharp itself - the point is what actually
// comes out of the encoder, not what a mock says.
const photo = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: '#2a9d8f' },
  });

describe('ProductImageProcessor', () => {
  const processor = new ProductImageProcessor();

  it('keeps a large photo at 400, 800 and 1600 wide, as WebP', async () => {
    const input = await photo(3000, 2000).jpeg().toBuffer();

    const renditions = await processor.renditions(input);

    expect(renditions.map((r) => [r.width, r.height])).toEqual([
      [400, 267],
      [800, 533],
      [1600, 1067],
    ]);
    for (const rendition of renditions) {
      expect((await sharp(rendition.buffer).metadata()).format).toBe('webp');
    }
    // The whole point: far smaller than what was uploaded.
    expect(renditions[0].buffer.length).toBeLessThan(input.length);
  });

  it('turns a photo upright by its EXIF orientation and keeps none of its metadata', async () => {
    // Taken with the phone held upright: stored landscape, flagged
    // "rotate 90°", with the place it was taken.
    const input = await photo(3000, 2000)
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '35/1 41/1 0/1' },
      })
      .toBuffer();

    const [small, , large] = await processor.renditions(input);

    expect([small.width, small.height]).toEqual([267, 400]);
    expect([large.width, large.height]).toEqual([1067, 1600]);
    const meta = await sharp(large.buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it('never enlarges a small image - it just has fewer sizes', async () => {
    const input = await photo(300, 200).png().toBuffer();

    const renditions = await processor.renditions(input);

    expect(renditions.map((r) => r.width)).toEqual([300]);
  });

  it('refuses a file it cannot decode, naming which one', async () => {
    await expect(
      processor.renditions(Buffer.from('not an image at all'), 2),
    ).rejects.toMatchObject({
      status: 400,
      code: 'IMAGE_UNREADABLE',
      details: { file: 3 },
    });
  });

  it('refuses to decode an image of absurd dimensions (a decompression bomb)', async () => {
    // 64 megapixels of one colour: a small file, a huge decode.
    const bomb = await photo(8000, 8000)
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(1024 * 1024);

    await expect(processor.renditions(bomb)).rejects.toMatchObject({
      code: 'IMAGE_UNREADABLE',
    });
  });
});
