// Draws a WaveField on the stage: paint into an offscreen ImageData, then one scaled drawImage.
import type { Draw } from '../../draw/draw';
import type { WaveField } from './field';

let off: HTMLCanvasElement | null = null;
let img: ImageData | null = null;

export function drawWave(g: Draw, f: WaveField, t: number, rgb: [number, number, number]): void {
  if (!off) off = document.createElement('canvas');
  if (off.width !== f.nx || off.height !== f.ny || !img) {
    off.width = f.nx;
    off.height = f.ny;
    img = off.getContext('2d')!.createImageData(f.nx, f.ny);
  }
  f.paint(t, img.data, rgb);
  off.getContext('2d')!.putImageData(img, 0, 0);
  const [ax, ay] = g.vp.toPx(f.s.xL, f.s.y1);
  const [bx, by] = g.vp.toPx(f.s.x1, f.s.y0);
  const ctx = g.ctx;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, ax, ay, bx - ax, by - ay);
  ctx.restore();
}

/** CSS colour of an rgb triple. */
export const css = ([r, g, b]: [number, number, number], a = 1) => `rgba(${r}, ${g}, ${b}, ${a})`;
