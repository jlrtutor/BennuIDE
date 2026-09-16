/**
 * Utility to encode Float32 audio channel data into standard 16-bit PCM WAV format.
 * Fully compatible with BennuGD / BennuGD2 mod_sound (libSDL2_mixer / libsound).
 */
export function encodeWav16(
  channels: Float32Array[],
  sampleRate: number
): Uint8Array {
  const numChannels = channels.length;
  if (numChannels === 0) {
    throw new Error('No audio channels provided');
  }

  const numSamples = channels[0].length;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const bufferSize = 44 + dataSize; // 44 bytes standard header

  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF identifier
  writeString(0, 'RIFF');
  // File length minus RIFF identifier & length field
  view.setUint32(4, 36 + dataSize, true);
  // RIFF type
  writeString(8, 'WAVE');

  // Format chunk identifier
  writeString(12, 'fmt ');
  // Format chunk length (16 for PCM)
  view.setUint32(16, 16, true);
  // Sample format (1 = PCM)
  view.setUint16(20, 1, true);
  // Channel count
  view.setUint16(22, numChannels, true);
  // Sample rate
  view.setUint32(24, sampleRate, true);
  // Byte rate
  view.setUint32(28, byteRate, true);
  // Block align
  view.setUint16(32, blockAlign, true);
  // Bits per sample
  view.setUint16(34, 16, true);

  // Data chunk identifier
  writeString(36, 'data');
  // Data chunk length
  view.setUint32(40, dataSize, true);

  // Write interleaved PCM 16-bit samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = channels[ch][i];
      // Clamp between -1.0 and 1.0
      if (sample < -1) sample = -1;
      else if (sample > 1) sample = 1;

      // Convert float [-1.0, 1.0] to signed 16-bit integer [-32768, 32767]
      const intSample = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, Math.round(intSample), true);
      offset += 2;
    }
  }

  return new Uint8Array(buffer);
}
