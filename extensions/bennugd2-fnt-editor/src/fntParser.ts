import * as zlib from 'zlib';

export interface Glyph {
  charIndex: number;
  width: number;
  height: number;
  xadvance: number;
  yadvance: number;
  xoffset: number;
  yoffset: number;
  rgbaData: Uint8Array; // width * height * 4 (RGBA)
}

export interface BennuFont {
  isFnx: boolean;
  charsetType: number; // 0 = ISO8859, 1 = CP850
  bpp: number; // 8, 16, 32
  glyphs: (Glyph | null)[]; // 256 slots
}

export class FntParser {
  public static parse(rawBuffer: Uint8Array): BennuFont {
    if (rawBuffer.length === 0) {
      return {
        isFnx: true,
        charsetType: 0,
        bpp: 32,
        glyphs: new Array(256).fill(null)
      };
    }

    let buffer = rawBuffer;
    // Handle gzip / zlib compression
    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      try {
        buffer = new Uint8Array(zlib.gunzipSync(Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength)));
      } catch (e) {
        console.warn('FntParser: Gunzip failed, using raw buffer', e);
      }
    } else if (buffer.length >= 2 && buffer[0] === 0x78) {
      try {
        buffer = new Uint8Array(zlib.inflateSync(Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength)));
      } catch (e) {
        // Not zlib compressed
      }
    }

    if (buffer.length < 12) {
      throw new Error('Archivo de fuente inválido: tamaño insuficiente.');
    }

    const magic = String.fromCharCode(buffer[0], buffer[1], buffer[2]).toLowerCase();
    const isFnx = magic === 'fnx';
    const isFnt = magic === 'fnt' || magic === 'fn0' || magic === 'fn8' || magic === 'fn1' || magic === 'fn3' || magic === 'f08' || magic === 'f16' || magic === 'f32' || magic === 'f01';

    if (!isFnx && !isFnt) {
      throw new Error(`Cabecera de fuente no válida "${magic}" (debe ser "fnx" o "fnt").`);
    }

    let bpp = buffer[7];
    if (isFnx) {
      bpp = 32;
    } else if (magic === 'fn0' || magic === 'fn8' || magic === 'f08') {
      bpp = 8;
    } else if (magic === 'fn1' || magic === 'f16') {
      bpp = 16;
    } else if (magic === 'fn3' || magic === 'f32') {
      bpp = 32;
    } else if (magic === 'f01') {
      bpp = 1;
    } else if (magic === 'fnt') {
      if (bpp === 0) bpp = 8;
      else if (bpp !== 8 && bpp !== 16 && bpp !== 32 && bpp !== 1) bpp = 8;
    }

    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const recordSize = isFnx ? 28 : 16;

    // Detect character table start offset across all FNT/FNX variants
    let candidateOffsets = [12];
    if (bpp === 8 && !isFnx) {
      // 1356 = 8 header + 768 palette + 576 gamma + 4 charsetType (Standard BennuGD/DIV)
      // 776 / 780 = 8 header + 768 palette (+ 4 charsetType)
      // 12 = 8 header + 4 charsetType (No palette)
      candidateOffsets = [1356, 776, 780, 12];
    }

    let bestOffset = 12;
    let bestScore = -1;

    for (const off of candidateOffsets) {
      if (off + (256 * recordSize) > buffer.length) continue;
      let validCount = 0;
      for (let i = 0; i < 256; i++) {
        const w = view.getInt32(off + (i * recordSize), true);
        const h = view.getInt32(off + (i * recordSize) + 4, true);
        const fo = view.getInt32(off + (i * recordSize) + (isFnx ? 24 : 12), true);
        if (fo >= off + (256 * recordSize) && fo < buffer.length && w > 0 && h > 0 && w < 1000 && h < 1000) {
          validCount++;
        }
      }
      if (validCount > bestScore) {
        bestScore = validCount;
        bestOffset = off;
      }
    }

    let palette: Uint8Array | null = null;
    if (bpp === 8 && !isFnx && bestOffset >= 776) {
      palette = buffer.subarray(8, 8 + 768);
    }

    const charsetType = bestOffset >= 4 ? view.getInt32(bestOffset - 4, true) : (buffer.length >= 12 ? view.getInt32(8, true) : 0);
    const glyphs: (Glyph | null)[] = new Array(256).fill(null);

    interface GlyphHeader {
      width: number;
      height: number;
      xadvance: number;
      yadvance: number;
      xoffset: number;
      yoffset: number;
      fileoffset: number;
    }

    const headers: GlyphHeader[] = [];
    let offset = bestOffset;

    for (let i = 0; i < 256; i++) {
      if (offset + recordSize > buffer.length) break;

      if (isFnx) {
        headers.push({
          width: Math.max(0, view.getInt32(offset, true)),
          height: Math.max(0, view.getInt32(offset + 4, true)),
          xadvance: view.getInt32(offset + 8, true),
          yadvance: view.getInt32(offset + 12, true),
          xoffset: view.getInt32(offset + 16, true),
          yoffset: view.getInt32(offset + 20, true),
          fileoffset: view.getInt32(offset + 24, true)
        });
        offset += 28;
      } else {
        const w = Math.max(0, view.getInt32(offset, true));
        const h = Math.max(0, view.getInt32(offset + 4, true));
        const yo = view.getInt32(offset + 8, true);
        const fo = view.getInt32(offset + 12, true);
        headers.push({
          width: w,
          height: h,
          xadvance: w > 0 ? w + 1 : 0,
          yadvance: h + yo,
          xoffset: 0,
          yoffset: yo,
          fileoffset: fo
        });
        offset += 16;
      }
    }

    // Bytes per pixel
    const bytesPerPixel = bpp === 8 ? 1 : bpp === 16 ? 2 : bpp === 1 ? 1 : 4;

    // Decode Bitmaps
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (h.fileoffset > 0 && h.width > 0 && h.height > 0 && h.fileoffset + (h.width * h.height * bytesPerPixel) <= buffer.length) {
        const pixelCount = h.width * h.height;
        const rgbaData = new Uint8Array(pixelCount * 4);
        const rawPixels = buffer.subarray(h.fileoffset, h.fileoffset + (pixelCount * bytesPerPixel));

        if (bpp === 8 || bpp === 1) {
          // 8-BIT PALETTED
          let isVgaScale = true;
          if (palette) {
            for (let c = 0; c < 768; c++) {
              if (palette[c] > 63) {
                isVgaScale = false;
                break;
              }
            }
          }
          const shift = (palette && isVgaScale) ? 2 : 0;
          
          for (let p = 0; p < pixelCount; p++) {
            const palIdx = rawPixels[p];
            if (palIdx === 0) {
              rgbaData[p * 4 + 0] = 0;
              rgbaData[p * 4 + 1] = 0;
              rgbaData[p * 4 + 2] = 0;
              rgbaData[p * 4 + 3] = 0; // Transparent
            } else if (palette) {
              rgbaData[p * 4 + 0] = Math.min(255, (palette[palIdx * 3 + 0] || 0) << shift);
              rgbaData[p * 4 + 1] = Math.min(255, (palette[palIdx * 3 + 1] || 0) << shift);
              rgbaData[p * 4 + 2] = Math.min(255, (palette[palIdx * 3 + 2] || 0) << shift);
              rgbaData[p * 4 + 3] = 255;
            } else {
              // No palette: render as white/grayscale
              const col = palIdx === 1 ? 255 : palIdx;
              rgbaData[p * 4 + 0] = col;
              rgbaData[p * 4 + 1] = col;
              rgbaData[p * 4 + 2] = col;
              rgbaData[p * 4 + 3] = 255;
            }
          }
        } else if (bpp === 16) {
          // 16-BIT RGB565
          for (let p = 0; p < pixelCount; p++) {
            const val = rawPixels[p * 2] | (rawPixels[p * 2 + 1] << 8);
            if (val === 0) {
              rgbaData[p * 4 + 0] = 0;
              rgbaData[p * 4 + 1] = 0;
              rgbaData[p * 4 + 2] = 0;
              rgbaData[p * 4 + 3] = 0;
            } else {
              const r = Math.round(((val >> 11) & 0x1F) * 255 / 31);
              const g = Math.round(((val >> 5) & 0x3F) * 255 / 63);
              const b = Math.round((val & 0x1F) * 255 / 31);
              rgbaData[p * 4 + 0] = r;
              rgbaData[p * 4 + 1] = g;
              rgbaData[p * 4 + 2] = b;
              rgbaData[p * 4 + 3] = 255;
            }
          }
        } else {
          // 32-BIT ARGB8888 / XRGB8888 / RGBA
          let hasNonZeroAlpha = false;
          let hasNonZeroRGB = false;

          for (let p = 0; p < pixelCount; p++) {
            const b = rawPixels[p * 4 + 0];
            const g = rawPixels[p * 4 + 1];
            const r = rawPixels[p * 4 + 2];
            const a = rawPixels[p * 4 + 3];

            if (a > 0) hasNonZeroAlpha = true;
            if (r > 0 || g > 0 || b > 0) hasNonZeroRGB = true;

            rgbaData[p * 4 + 0] = r;
            rgbaData[p * 4 + 1] = g;
            rgbaData[p * 4 + 2] = b;
            rgbaData[p * 4 + 3] = a;
          }

          // Fix for XRGB8888 fonts (e.g. menu_18_red.fnt) where alpha channel is 0 but RGB colors exist!
          if (!hasNonZeroAlpha && hasNonZeroRGB) {
            for (let p = 0; p < pixelCount; p++) {
              const r = rgbaData[p * 4 + 0];
              const g = rgbaData[p * 4 + 1];
              const b = rgbaData[p * 4 + 2];
              if (r > 0 || g > 0 || b > 0) {
                rgbaData[p * 4 + 3] = 255;
              }
            }
          } else {
            // Also check individual pixels: if a pixel has color (r,g,b > 0) but alpha is 0, give it full opacity
            for (let p = 0; p < pixelCount; p++) {
              if (rgbaData[p * 4 + 3] === 0) {
                if (rgbaData[p * 4 + 0] > 0 || rgbaData[p * 4 + 1] > 0 || rgbaData[p * 4 + 2] > 0) {
                  rgbaData[p * 4 + 3] = 255;
                }
              }
            }
          }
        }

        glyphs[i] = {
          charIndex: i,
          width: h.width,
          height: h.height,
          xadvance: (h.xadvance && h.xadvance > 0) ? h.xadvance : h.width + 1,
          yadvance: (h.yadvance && h.yadvance > 0) ? h.yadvance : h.height,
          xoffset: h.xoffset,
          yoffset: h.yoffset,
          rgbaData
        };
      }
    }

    return {
      isFnx,
      charsetType,
      bpp: 32, // Converted to 32bpp RGBA in memory
      glyphs
    };
  }

  public static serialize(font: BennuFont): Uint8Array {
    const isFnx = font.isFnx;
    const recordSize = isFnx ? 28 : 16;
    const headerSize = 12 + (256 * recordSize);

    let totalBitmapSize = 0;
    for (let i = 0; i < 256; i++) {
      const g = font.glyphs[i];
      if (g && g.width > 0 && g.height > 0) {
        totalBitmapSize += g.width * g.height * 4;
      }
    }

    const out = new Uint8Array(headerSize + totalBitmapSize);
    const view = new DataView(out.buffer);

    // Magic: "fnx\x1a\x0d\x0a\x00" or "fnt\x1a\x0d\x0a\x00"
    out[0] = 0x66; // 'f'
    out[1] = 0x6E; // 'n'
    out[2] = isFnx ? 0x78 : 0x74; // 'x' or 't'
    out[3] = 0x1A;
    out[4] = 0x0D;
    out[5] = 0x0A;
    out[6] = 0x00;
    out[7] = 32; // 32 bpp

    view.setInt32(8, font.charsetType, true);

    let headerOffset = 12;
    let bitmapOffset = headerSize;

    for (let i = 0; i < 256; i++) {
      const g = font.glyphs[i];
      if (g && g.width > 0 && g.height > 0) {
        const fileOffset = bitmapOffset;

        if (isFnx) {
          view.setInt32(headerOffset, g.width, true);
          view.setInt32(headerOffset + 4, g.height, true);
          view.setInt32(headerOffset + 8, g.xadvance, true);
          view.setInt32(headerOffset + 12, g.yadvance, true);
          view.setInt32(headerOffset + 16, g.xoffset, true);
          view.setInt32(headerOffset + 20, g.yoffset, true);
          view.setInt32(headerOffset + 24, fileOffset, true);
          headerOffset += 28;
        } else {
          view.setInt32(headerOffset, g.width, true);
          view.setInt32(headerOffset + 4, g.height, true);
          view.setInt32(headerOffset + 8, g.yoffset, true);
          view.setInt32(headerOffset + 12, fileOffset, true);
          headerOffset += 16;
        }

        // Write ARGB8888 bitmap
        for (let p = 0; p < g.width * g.height; p++) {
          const r = g.rgbaData[p * 4 + 0];
          const gCol = g.rgbaData[p * 4 + 1];
          const b = g.rgbaData[p * 4 + 2];
          const a = g.rgbaData[p * 4 + 3];
          out[bitmapOffset + p * 4 + 0] = b;
          out[bitmapOffset + p * 4 + 1] = gCol;
          out[bitmapOffset + p * 4 + 2] = r;
          out[bitmapOffset + p * 4 + 3] = a;
        }
        bitmapOffset += g.width * g.height * 4;
      } else {
        // Empty glyph slot
        for (let b = 0; b < recordSize; b++) {
          out[headerOffset + b] = 0;
        }
        headerOffset += recordSize;
      }
    }

    return out;
  }
}
