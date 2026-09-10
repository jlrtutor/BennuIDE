export interface FpgControlPoint {
  x: number;
  y: number;
}

export interface FpgSprite {
  code: number;
  description: string;
  filename: string;
  width: number;
  height: number;
  controlPoints: FpgControlPoint[];
  rgbaData: Uint8Array; // RGBA 4 bytes per pixel for Webview canvas
}

export interface FpgFile {
  bpp: number; // 8, 16, 32
  palette?: Uint8Array; // 768 bytes (256 * 3 RGB) for 8 bpp
  sprites: FpgSprite[];
}

export class FpgParser {
  public static parse(buffer: Uint8Array): FpgFile {
    if (buffer.length === 0) {
      return {
        bpp: 32,
        sprites: []
      };
    }

    if (buffer.length < 8) {
      throw new Error('Archivo FPG inválido: tamaño insuficiente.');
    }

    // Determine Magic & bpp
    const magicStr = String.fromCharCode(...buffer.subarray(0, 3)).toLowerCase();
    let bpp = buffer[7];

    if (magicStr === 'f16' || magicStr === 'm16') {
      bpp = 16;
    } else if (magicStr === 'f32' || magicStr === 'm32') {
      bpp = 32;
    } else if (magicStr === 'f08' || magicStr === 'm08') {
      bpp = 8;
    } else if (magicStr === 'f01' || magicStr === 'm01') {
      bpp = 1;
    } else if (magicStr === 'fpg' || magicStr === 'map') {
      if (bpp === 0) {
        bpp = 8; // DIV 1 / 2 default 8-bit
      }
    } else {
      // If magic is not strict "fpg", check if bpp byte is 8, 16, or 32
      if (bpp === 0 || bpp === 8) {
        bpp = 8;
      } else if (bpp !== 16 && bpp !== 32) {
        bpp = 32; // fallback default
      }
    }

    if (bpp !== 8 && bpp !== 16 && bpp !== 32 && bpp !== 1) {
      bpp = 32;
    }

    let offset = 8;
    let palette: Uint8Array | undefined = undefined;

    if (bpp === 8) {
      if (buffer.length >= offset + 768) {
        palette = buffer.slice(offset, offset + 768);
        offset += 768;
      }
    }

    const sprites: FpgSprite[] = [];
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    while (offset + 64 <= buffer.length) {
      const code = view.getInt32(offset, true);
      const chunkSize = view.getInt32(offset + 4, true);

      // Description (32 bytes)
      let descBytes = buffer.subarray(offset + 8, offset + 40);
      let descEnd = descBytes.indexOf(0);
      if (descEnd === -1) descEnd = descBytes.length;
      const description = new TextDecoder('latin1').decode(descBytes.subarray(0, descEnd)).trim();

      // Filename (12 bytes)
      let fnBytes = buffer.subarray(offset + 40, offset + 52);
      let fnEnd = fnBytes.indexOf(0);
      if (fnEnd === -1) fnEnd = fnBytes.length;
      const filename = new TextDecoder('latin1').decode(fnBytes.subarray(0, fnEnd)).trim();

      const width = view.getInt32(offset + 52, true);
      const height = view.getInt32(offset + 56, true);
      const numPointsRaw = view.getInt32(offset + 60, true);
      const numPoints = Math.max(0, Math.min(1000, numPointsRaw));

      if (width <= 0 || width > 16384 || height <= 0 || height > 16384) {
        break;
      }

      offset += 64;

      const controlPoints: FpgControlPoint[] = [];
      for (let i = 0; i < numPoints; i++) {
        if (offset + 4 > buffer.length) break;
        const px = view.getInt16(offset, true);
        const py = view.getInt16(offset + 2, true);
        controlPoints.push({ x: px, y: py });
        offset += 4;
      }

      const bytesPerPixel = bpp === 8 ? 1 : bpp === 16 ? 2 : 4;
      const pixelBytesCount = width * height * bytesPerPixel;
      if (offset + pixelBytesCount > buffer.length) {
        break; // EOF or truncated
      }

      const rawPixels = buffer.subarray(offset, offset + pixelBytesCount);
      offset += pixelBytesCount;

      // Convert raw pixels to RGBA 32-bit for canvas
      const rgbaData = new Uint8Array(width * height * 4);

      if (bpp === 8) {
        // Detect if palette is 0..63 (VGA DAC) or 0..255
        let isVgaPalette = true;
        if (palette) {
          for (let p = 0; p < palette.length; p++) {
            if (palette[p] > 63) {
              isVgaPalette = false;
              break;
            }
          }
        }
        const shift = isVgaPalette ? 2 : 0;

        for (let i = 0; i < width * height; i++) {
          const palIndex = rawPixels[i];
          if (palIndex === 0) {
            // Transparent
            rgbaData[i * 4 + 0] = 0;
            rgbaData[i * 4 + 1] = 0;
            rgbaData[i * 4 + 2] = 0;
            rgbaData[i * 4 + 3] = 0;
          } else {
            const r = palette ? ((palette[palIndex * 3 + 0] << shift) & 0xFF) : palIndex;
            const g = palette ? ((palette[palIndex * 3 + 1] << shift) & 0xFF) : palIndex;
            const b = palette ? ((palette[palIndex * 3 + 2] << shift) & 0xFF) : palIndex;
            rgbaData[i * 4 + 0] = r;
            rgbaData[i * 4 + 1] = g;
            rgbaData[i * 4 + 2] = b;
            rgbaData[i * 4 + 3] = 255;
          }
        }
      } else if (bpp === 16) {
        const rawView = new DataView(rawPixels.buffer, rawPixels.byteOffset, rawPixels.byteLength);
        for (let i = 0; i < width * height; i++) {
          const pixel16 = rawView.getUint16(i * 2, true);
          if (pixel16 === 0) {
            rgbaData[i * 4 + 3] = 0;
          } else {
            // 565 RGB
            const r = ((pixel16 >> 11) & 0x1F) * 255 / 31;
            const g = ((pixel16 >> 5) & 0x3F) * 255 / 63;
            const b = (pixel16 & 0x1F) * 255 / 31;
            rgbaData[i * 4 + 0] = Math.round(r);
            rgbaData[i * 4 + 1] = Math.round(g);
            rgbaData[i * 4 + 2] = Math.round(b);
            rgbaData[i * 4 + 3] = 255;
          }
        }
      } else if (bpp === 32) {
        let hasNonZeroAlpha = false;
        let hasNonZeroRgb = false;
        for (let i = 0; i < width * height; i++) {
          const b = rawPixels[i * 4 + 0];
          const g = rawPixels[i * 4 + 1];
          const r = rawPixels[i * 4 + 2];
          const a = rawPixels[i * 4 + 3];
          if (a > 0) hasNonZeroAlpha = true;
          if (r > 0 || g > 0 || b > 0) hasNonZeroRgb = true;
          rgbaData[i * 4 + 0] = r;
          rgbaData[i * 4 + 1] = g;
          rgbaData[i * 4 + 2] = b;
          rgbaData[i * 4 + 3] = a;
        }
        // If all pixels had alpha 0 but has colors, treat as opaque (BennuGD legacy 32bit RGB)
        if (!hasNonZeroAlpha && hasNonZeroRgb) {
          for (let i = 0; i < width * height; i++) {
            const r = rgbaData[i * 4 + 0];
            const g = rgbaData[i * 4 + 1];
            const b = rgbaData[i * 4 + 2];
            if (r > 0 || g > 0 || b > 0) {
              rgbaData[i * 4 + 3] = 255;
            }
          }
        }
      }

      sprites.push({
        code,
        description,
        filename,
        width,
        height,
        controlPoints,
        rgbaData
      });
    }

    return {
      bpp,
      palette,
      sprites
    };
  }

  public static serialize(fpg: FpgFile): Uint8Array {
    let totalSize = 8;
    if (fpg.bpp === 8) {
      totalSize += 768;
    }

    for (const sprite of fpg.sprites) {
      totalSize += 64 + (sprite.controlPoints.length * 4) + (sprite.width * sprite.height * (fpg.bpp === 8 ? 1 : fpg.bpp === 16 ? 2 : 4));
    }

    const out = new Uint8Array(totalSize);
    const view = new DataView(out.buffer);

    // Magic: "fpg\x1a\x0d\x0a\x00" or "f16\x1a\x0d\x0a\x00" or "f32\x1a\x0d\x0a\x00"
    if (fpg.bpp === 16) {
      out[0] = 0x66; out[1] = 0x31; out[2] = 0x36; // 'f16'
    } else if (fpg.bpp === 32) {
      out[0] = 0x66; out[1] = 0x33; out[2] = 0x32; // 'f32'
    } else {
      out[0] = 0x66; out[1] = 0x70; out[2] = 0x67; // 'fpg'
    }
    out[3] = 0x1A;
    out[4] = 0x0D;
    out[5] = 0x0A;
    out[6] = 0x00;
    out[7] = fpg.bpp;

    let offset = 8;

    if (fpg.bpp === 8 && fpg.palette) {
      out.set(fpg.palette, offset);
      offset += 768;
    } else if (fpg.bpp === 8) {
      // Default grayscale palette if none
      for (let i = 0; i < 256; i++) {
        out[offset + i * 3 + 0] = i;
        out[offset + i * 3 + 1] = i;
        out[offset + i * 3 + 2] = i;
      }
      offset += 768;
    }

    for (const sprite of fpg.sprites) {
      const spriteHeaderOffset = offset;
      const bytesPerPixel = fpg.bpp === 8 ? 1 : fpg.bpp === 16 ? 2 : 4;
      const pixelBytes = sprite.width * sprite.height * bytesPerPixel;
      const chunkSize = 64 + (sprite.controlPoints.length * 4) + pixelBytes;

      view.setInt32(spriteHeaderOffset, sprite.code, true);
      view.setInt32(spriteHeaderOffset + 4, chunkSize, true);

      // Description (32 bytes)
      const descEncoded = new TextEncoder().encode(sprite.description || '');
      out.set(descEncoded.subarray(0, Math.min(31, descEncoded.length)), spriteHeaderOffset + 8);

      // Filename (12 bytes)
      const fnEncoded = new TextEncoder().encode(sprite.filename || '');
      out.set(fnEncoded.subarray(0, Math.min(11, fnEncoded.length)), spriteHeaderOffset + 40);

      view.setInt32(spriteHeaderOffset + 52, sprite.width, true);
      view.setInt32(spriteHeaderOffset + 56, sprite.height, true);
      view.setInt32(spriteHeaderOffset + 60, sprite.controlPoints.length, true);

      offset += 64;

      // Control points
      for (const pt of sprite.controlPoints) {
        view.setInt16(offset, pt.x, true);
        view.setInt16(offset + 2, pt.y, true);
        offset += 4;
      }

      // Pixels
      if (fpg.bpp === 32) {
        for (let i = 0; i < sprite.width * sprite.height; i++) {
          const r = sprite.rgbaData[i * 4 + 0];
          const g = sprite.rgbaData[i * 4 + 1];
          const b = sprite.rgbaData[i * 4 + 2];
          const a = sprite.rgbaData[i * 4 + 3];
          out[offset + i * 4 + 0] = b;
          out[offset + i * 4 + 1] = g;
          out[offset + i * 4 + 2] = r;
          out[offset + i * 4 + 3] = a;
        }
        offset += pixelBytes;
      } else if (fpg.bpp === 16) {
        for (let i = 0; i < sprite.width * sprite.height; i++) {
          const r = sprite.rgbaData[i * 4 + 0];
          const g = sprite.rgbaData[i * 4 + 1];
          const b = sprite.rgbaData[i * 4 + 2];
          const a = sprite.rgbaData[i * 4 + 3];
          if (a === 0) {
            view.setUint16(offset + i * 2, 0, true);
          } else {
            const r5 = (r >> 3) & 0x1F;
            const g6 = (g >> 2) & 0x3F;
            const b5 = (b >> 3) & 0x1F;
            const val16 = (r5 << 11) | (g6 << 5) | b5;
            view.setUint16(offset + i * 2, val16, true);
          }
        }
        offset += pixelBytes;
      } else if (fpg.bpp === 8) {
        for (let i = 0; i < sprite.width * sprite.height; i++) {
          const a = sprite.rgbaData[i * 4 + 3];
          out[offset + i] = a === 0 ? 0 : 1;
        }
        offset += pixelBytes;
      }
    }

    return out;
  }
}
