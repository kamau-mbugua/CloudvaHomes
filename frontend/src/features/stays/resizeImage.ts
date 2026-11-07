/**
 * Resizes an image in the browser using an off-screen canvas before upload,
 * keeping the longest side at or below `maxSide` and encoding as JPEG.
 */
export async function resizeImage(
  file: File,
  maxSide = 1600,
  quality = 0.8,
): Promise<Blob> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return file;
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read image'));
      el.src = objectUrl;
    });
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) return file;

    const scale = Math.min(1, maxSide / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    return blob ?? file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
