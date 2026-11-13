/**
 * src/lib/image-util.ts
 *
 * Browser-side image resize and WebP conversion utility.
 */

export async function resizeImageToWebP(
  file: File,
  maxDimension: number = 800,
  quality: number = 0.85
): Promise<{ blob: Blob; fileName: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image for processing'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Could not get 2D canvas context'));
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error('Could not convert canvas to WebP'));
            }
            const rawName = file.name.includes('.')
              ? file.name.substring(0, file.name.lastIndexOf('.'))
              : file.name;
            const baseName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
            const fileName = `${baseName}.webp`;
            resolve({ blob, fileName });
          },
          'image/webp',
          quality
        );
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

