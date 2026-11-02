/**
 * Shrinks picked images entirely in the browser, so large photos never leave
 * the device:
 * - profile pictures: center-cropped to a 256x256 square;
 * - family-tree photos: whole picture, longest side 480 px.
 * Both are compressed (WebP where supported, else JPEG) until they fit the
 * size the Firestore rules accept.
 */
export const AVATAR_SIZE = 256;
/** Keep in sync with validPhoto() in firestore.rules (70,000 characters). */
const MAX_DATA_URL_LENGTH = 60_000;
/** Faces stay clearly recognizable at this size; about 20-40 KB each. */
export const PHOTO_SIZE = 480;
/** Keep in sync with validTreePhoto() in firestore.rules (100,000 characters). */
const MAX_PHOTO_URL_LENGTH = 90_000;
/** Refuse absurd inputs before decoding them (memory on low-end phones). */
export const MAX_INPUT_BYTES = 20 * 1024 * 1024;

export class AvatarError extends Error {}

async function decode(file: File): Promise<ImageBitmap> {
  if (!file.type.startsWith('image/')) throw new AvatarError('Please choose an image file.');
  if (file.size > MAX_INPUT_BYTES)
    throw new AvatarError('That image is larger than 20 MB. Please choose a smaller one.');
  try {
    return await createImageBitmap(file); // applies the photo's EXIF rotation
  } catch {
    throw new AvatarError("This image format isn't supported. Try a JPEG or PNG.");
  }
}

/** Lowers the quality until the data URL is short enough. */
function encode(canvas: HTMLCanvasElement, maxLength: number, qualities: number[]): string {
  const webp = canvas.toDataURL('image/webp', 0.8).startsWith('data:image/webp');
  const type = webp ? 'image/webp' : 'image/jpeg';
  for (const quality of qualities) {
    const url = canvas.toDataURL(type, quality);
    if (url.length <= maxLength) return url;
  }
  throw new AvatarError("Couldn't make this image small enough. Please try another one.");
}

function draw(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  paint(ctx);
  return canvas;
}

export async function toAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await decode(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = draw(AVATAR_SIZE, AVATAR_SIZE, (ctx) =>
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    ),
  );
  bitmap.close();
  return encode(canvas, MAX_DATA_URL_LENGTH, [0.8, 0.65, 0.5, 0.35]);
}

/** A family-tree photo: as small as possible while a face is still clear. */
export async function toPhotoDataUrl(file: File): Promise<string> {
  const bitmap = await decode(file);
  const scale = Math.min(1, PHOTO_SIZE / Math.max(bitmap.width, bitmap.height));
  const [w, h] = [Math.round(bitmap.width * scale), Math.round(bitmap.height * scale)];
  const canvas = draw(w, h, (ctx) => ctx.drawImage(bitmap, 0, 0, w, h));
  bitmap.close();
  return encode(canvas, MAX_PHOTO_URL_LENGTH, [0.6, 0.5, 0.4]);
}
