// Leave reliable headroom below the Audio API's 25 MB request limit. These chunks
// are created only for transcription; the original source remains in Supabase.
const MAX_TRANSCRIPTION_CHUNK_BYTES = 20 * 1024 * 1024;
const TARGET_TRANSCRIPTION_CHUNK_BYTES = 16 * 1024 * 1024;
const TRANSCRIPTION_CHUNK_OVERLAP_SECONDS = 2;

// The diarized model also rejects audio longer than 1,400 seconds,
// even when a low-bitrate recording is well below the upload byte limit.
const MAX_TRANSCRIPTION_CHUNK_SECONDS = 1200;

type AudioTranscriptionChunk = {
  buffer: Buffer;
  acceptAfterSeconds: number;
  sourceStartSeconds: number;
};

type Mp3Frame = {
  durationSeconds: number;
  length: number;
  offset: number;
  startSeconds: number;
};

function id3v2Length(buffer: Buffer) {
  if (buffer.length < 10 || buffer.toString("ascii", 0, 3) !== "ID3") {
    return 0;
  }

  const flags = buffer[5] || 0;
  const size =
    ((buffer[6] || 0) & 0x7f) * 0x200000 +
    ((buffer[7] || 0) & 0x7f) * 0x4000 +
    ((buffer[8] || 0) & 0x7f) * 0x80 +
    ((buffer[9] || 0) & 0x7f);

  return Math.min(buffer.length, 10 + size + (flags & 0x10 ? 10 : 0));
}

function mp3FrameAt(buffer: Buffer, offset: number, startSeconds: number): Mp3Frame | null {
  if (offset + 4 > buffer.length || buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
    return null;
  }

  const versionBits = (buffer[offset + 1] >> 3) & 0x03;
  const layerBits = (buffer[offset + 1] >> 1) & 0x03;
  const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f;
  const sampleRateIndex = (buffer[offset + 2] >> 2) & 0x03;
  const padding = (buffer[offset + 2] >> 1) & 0x01;

  // LectureVault only needs Layer III MP3 parsing. Reject reserved/free-format frames.
  if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
    return null;
  }

  const sampleRates =
    versionBits === 3
      ? [44100, 48000, 32000]
      : versionBits === 2
        ? [22050, 24000, 16000]
        : [11025, 12000, 8000];
  const bitrates =
    versionBits === 3
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const sampleRate = sampleRates[sampleRateIndex];
  const bitrate = bitrates[bitrateIndex];

  if (!sampleRate || !bitrate) {
    return null;
  }

  const isMpeg1 = versionBits === 3;
  const length = Math.floor(((isMpeg1 ? 144000 : 72000) * bitrate) / sampleRate) + padding;

  if (length < 4 || offset + length > buffer.length) {
    return null;
  }

  return {
    durationSeconds: (isMpeg1 ? 1152 : 576) / sampleRate,
    length,
    offset,
    startSeconds
  };
}

function mp3Frames(buffer: Buffer): Mp3Frame[] {
  const frames: Mp3Frame[] = [];
  let offset = id3v2Length(buffer);
  let startSeconds = 0;

  while (offset + 4 <= buffer.length) {
    const frame = mp3FrameAt(buffer, offset, startSeconds);

    if (!frame) {
      offset += 1;
      continue;
    }

    frames.push(frame);
    offset += frame.length;
    startSeconds += frame.durationSeconds;
  }

  return frames;
}

export function prepareMp3TranscriptionChunks(buffer: Buffer): AudioTranscriptionChunk[] {
  const frames = mp3Frames(buffer);

  // Do not risk corrupting a lecture transcript by slicing an unrecognized MP3 stream.
  if (!frames.length) {
    throw new Error("This MP3 could not be safely prepared for transcription. Please re-export it as a standard MP3.");
  }

  const lastFrame = frames[frames.length - 1];
  const durationSeconds = lastFrame.startSeconds + lastFrame.durationSeconds;
  if (buffer.length <= MAX_TRANSCRIPTION_CHUNK_BYTES && durationSeconds <= MAX_TRANSCRIPTION_CHUNK_SECONDS) {
    return [{ buffer, acceptAfterSeconds: 0, sourceStartSeconds: 0 }];
  }

  const chunks: AudioTranscriptionChunk[] = [];
  let contentStartIndex = 0;

  while (contentStartIndex < frames.length) {
    let endIndex = contentStartIndex;
    const contentStartOffset = frames[contentStartIndex].offset;

    while (
      endIndex < frames.length &&
      frames[endIndex].offset + frames[endIndex].length - contentStartOffset <= TARGET_TRANSCRIPTION_CHUNK_BYTES &&
      frames[endIndex].startSeconds + frames[endIndex].durationSeconds - frames[contentStartIndex].startSeconds <=
        MAX_TRANSCRIPTION_CHUNK_SECONDS - TRANSCRIPTION_CHUNK_OVERLAP_SECONDS
    ) {
      endIndex += 1;
    }

    if (endIndex === contentStartIndex) {
      throw new Error("An MP3 frame is too large to prepare for transcription.");
    }

    const acceptAfterSeconds = frames[contentStartIndex].startSeconds;
    let chunkStartIndex = contentStartIndex;

    if (contentStartIndex > 0) {
      const overlapStart = Math.max(0, acceptAfterSeconds - TRANSCRIPTION_CHUNK_OVERLAP_SECONDS);
      while (chunkStartIndex > 0 && frames[chunkStartIndex - 1].startSeconds >= overlapStart) {
        chunkStartIndex -= 1;
      }
    }

    const chunkStart = frames[chunkStartIndex];
    const chunkEnd = frames[endIndex - 1];
    chunks.push({
      buffer: buffer.subarray(chunkStart.offset, chunkEnd.offset + chunkEnd.length),
      acceptAfterSeconds,
      sourceStartSeconds: chunkStart.startSeconds
    });

    contentStartIndex = endIndex;
  }

  return chunks;
}
