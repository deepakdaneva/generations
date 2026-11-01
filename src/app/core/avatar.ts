/**
 * Turns any picked image into a small square profile picture, entirely in the
 * browser: center-crop to a square, scale to 256x256 and compress until it is
 * below the size the Firestore rules accept. Large photos never leave the device.
 */
export const AVATAR_SIZE = 256;
/** Keep in sync with validPhoto() in firestore.rules (70,000 characters). */
const MAX_DATA_URL_LENGTH = 60_000;
/** Refuse absurd inputs before decoding them (memory on low-end phones). */
export const MAX_INPUT_BYTES = 20 * 1024 * 1024;

export class AvatarError extends Error {}

export async function toAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new AvatarError('Please choose an image file.');
  if (file.size > MAX_INPUT_BYTES)
    throw new AvatarError('That image is larger than 20 MB. Please choose a smaller one.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // applies the photo's EXIF rotation
  } catch {
    throw new AvatarError("This image format isn't supported. Try a JPEG or PNG.");
  }

  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
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
  );
  bitmap.close();

  // WebP where supported (smaller), JPEG otherwise; lower quality until it fits.
  const webp = canvas.toDataURL('image/webp', 0.8).startsWith('data:image/webp');
  const type = webp ? 'image/webp' : 'image/jpeg';
  for (const quality of [0.8, 0.65, 0.5, 0.35]) {
    const url = canvas.toDataURL(type, quality);
    if (url.length <= MAX_DATA_URL_LENGTH) return url;
  }
  throw new AvatarError("Couldn't make this image small enough. Please try another one.");
}
