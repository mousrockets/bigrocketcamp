// The logo is resized and compressed here, before it leaves the device: the club stores a small square only.

/** Four times the header's 64 px: sharp on any screen. */
const logoSide = 256;
/** The usual result is a few tens of kB; the API refuses anything over 100 kB. */
const targetBytes = 60 * 1024;
const largestBytes = 100 * 1024;
const qualities = [0.86, 0.72, 0.58, 0.44];
/** A JPEG has no transparency: what was transparent takes the app's background. */
const opaqueBackground = '#060b1d';

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

function squareCanvas(image: ImageBitmap, background?: string): HTMLCanvasElement {
  // The centre square of the picture, never enlarged.
  const crop = Math.min(image.width, image.height);
  const side = Math.min(logoSide, crop);
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Ce navigateur ne sait pas redimensionner l’image.');
  context.imageSmoothingQuality = 'high';
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, side, side);
  }
  context.drawImage(image, (image.width - crop) / 2, (image.height - crop) / 2, crop, crop, 0, 0, side, side);
  return canvas;
}

async function smallest(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  let best: Blob | null = null;
  for (const quality of qualities) {
    const blob = await encode(canvas, type, quality);
    // A browser without this encoder answers in PNG instead.
    if (!blob || blob.type !== type) return null;
    best = blob;
    if (blob.size <= targetBytes) break;
  }
  return best;
}

/** A square WebP of 256 px at most, or a JPEG where the browser cannot write WebP (Safari). */
export async function resizeLogo(file: File): Promise<Blob> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error('Cette image ne s’ouvre pas : choisis un fichier JPEG, PNG ou WebP.');
  }
  try {
    const logo =
      (await smallest(squareCanvas(image), 'image/webp')) ??
      (await smallest(squareCanvas(image, opaqueBackground), 'image/jpeg'));
    if (!logo || logo.size > largestBytes) throw new Error('Image impossible à alléger assez : essaie une autre.');
    return logo;
  } finally {
    image.close();
  }
}
