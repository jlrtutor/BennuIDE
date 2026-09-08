export interface Glyph {
  charIndex: number;
  width: number;
  height: number;
  xadvance: number;
  yadvance: number;
  xoffset: number;
  yoffset: number;
  rgbaData: Uint8Array; // width * height * 4
}

export interface BennuFont {
  isFnx: boolean;
  charsetType: number; // 0 = ISO8859, 1 = CP850
  bpp: number; // 32
  glyphs: (Glyph | null)[]; // 256 slots
}

export class FntParser {
  public static parse(buffer: Uint8Array): BennuFont {
    if (buffer.length < 12) {
      throw new Error('Archivo de fuente inválido: tamaño insuficiente.');
    }

    const magic = String.fromCharCode(buffer[0], buffer[1], buffer[2]);
    const isFnx = magic.toLowerCase() === 'fnx';
    const isFnt = magic.toLowerCase() === 'fnt';

    if (!isFnx && !isFnt) {
      throw new Error('Cabecera de fuente no válida (debe ser "fnx" o "fnt").');
    }

    const bpp = buffer[7] || 32;
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const charsetType = view.getInt32(8, true);

    let offset = 12;
    const glyphs: (Glyph | null)[] = new Array(256).fill(null);

    const recordSize = isFnx ? 28 : 16;
    const recordsHeaderEnd = 12 + (256 * recordSize);

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

    for (let i = 0; i < 256; i++) {
      if (isFnx) {
        headers.push({
          width: view.getInt32(offset, true),
          height: view.getInt32(offset + 4, true),
          xadvance: view.getInt32(offset + 8, true),
          yadvance: view.getInt32(offset + 12, true),
          xoffset: view.getInt32(offset + 16, true),
          yoffset: view.getInt32(offset + 20, true),
          fileoffset: view.getInt32(offset + 24, true)
        });
        offset += 28;
      } else {
        const w = view.getInt32(offset, true);
        const h = view.getInt32(offset + 4, true);
        const yo = view.getInt32(offset + 8, true);
        const fo = view.getInt32(offset + 12, true);
        headers.push({
          width: w,
          height: h,
          xadvance: w,
          yadvance: h + yo,
          xoffset: 0,
          yoffset: yo,
          fileoffset: fo
        });
        offset += 16;
      }
    }

    // Parse bitmaps
    for (let i = 0; i < 256; i++) {
      const h = headers[i];
      if (h.fileoffset > 0 && h.width > 0 && h.height > 0 && h.fileoffset + (h.width * h.height * 4) <= buffer.length) {
        const rawPixels = buffer.subarray(h.fileoffset, h.fileoffset + (h.width * h.height * 4));
        const rgbaData = new Uint8Array(h.width * h.height * 4);

        // ARGB8888 in file to RGBA in Canvas
        for (let p = 0; p < h.width * h.height; p++) {
          const b = rawPixels[p * 4 + 0];
          const g = rawPixels[p * 4 + 1];
          const r = rawPixels[p * 4 + 2];
          const a = rawPixels[p * 4 + 3];
          rgbaData[p * 4 + 0] = r;
          rgbaData[p * 4 + 1] = g;
          rgbaData[p * 4 + 2] = b;
          rgbaData[p * 4 + 3] = a;
        }

        glyphs[i] = {
          charIndex: i,
          width: h.width,
          height: h.height,
          xadvance: h.xadvance,
          yadvance: h.yadvance,
          xoffset: h.xoffset,
          yoffset: h.yoffset,
          rgbaData
        };
      }
    }

    return {
      isFnx,
      charsetType,
      bpp,
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
    out[0] = isFnx ? 0x66 : 0x66; // 'f'
    out[1] = isFnx ? 0x6E : 0x6E; // 'n'
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
