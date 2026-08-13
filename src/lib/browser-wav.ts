/** Browser-side PCM → WAV helpers for PyAI Hear (WebM often fails STT). */

export type WavCapture = {
  stream: MediaStream;
  stop: () => Promise<Blob>;
  sampleRate: number;
};

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function downsample(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (outputRate >= inputRate) return input;
  const ratio = inputRate / outputRate;
  const newLen = Math.floor(input.length / ratio);
  const result = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j]!;
    result[i] = sum / Math.max(1, end - start);
  }
  return result;
}

export function encodeWavMono(
  samples: Float32Array,
  sampleRate: number,
): Blob {
  const pcm = floatTo16BitPCM(samples);
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, pcm.length * 2, true);

  let offset = 44;
  for (let i = 0; i < pcm.length; i++, offset += 2) {
    view.setInt16(offset, pcm[i]!, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Capture mic as mono WAV (16 kHz). Hear rejects many browser WebM blobs;
 * WAV PCM is the reliable batch upload format.
 */
export async function startWavCapture(
  targetRate = 16_000,
): Promise<WavCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const chunks: Float32Array[] = [];

  // ScriptProcessor for broad browser support (same approach as PyAI captions demo).
  const bufferSize = 4096;
  const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
  };

  source.connect(processor);
  // Keep the processor in the graph without monitoring the mic.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  processor.connect(mute);
  mute.connect(ctx.destination);

  return {
    stream,
    sampleRate: targetRate,
    stop: async () => {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close().catch(() => undefined);

      const total = chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Float32Array(total);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }

      const down = downsample(merged, ctx.sampleRate, targetRate);
      return encodeWavMono(down, targetRate);
    },
  };
}
