import { recolorUniformPixels, UNIFORM_REGION_DIMENSION } from '@my-app/shared';
import type { UniformColorRegions, UniformPartPalette } from '@my-app/shared';

export async function regionImagePixels(png: string, max = UNIFORM_REGION_DIMENSION) {
  const image = new Image(); image.src = png; await image.decode();
  const ratio = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, context, image: context.getImageData(0, 0, canvas.width, canvas.height), width: canvas.width, height: canvas.height };
}
export async function recolorRegionImage(png: string, regions: UniformColorRegions, palette: UniformPartPalette) {
  const { canvas, context, image, width, height } = await regionImagePixels(png, 2048);
  image.data.set(recolorUniformPixels(image.data, width, height, regions, palette));
  context.putImageData(image, 0, 0); return canvas.toDataURL('image/png');
}
