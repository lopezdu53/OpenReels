/** PNG / JPEG / WebP header size — no sharp dependency. */

export interface ImageSize {
  width: number;
  height: number;
}

/** 16:9 is ~1.778. 3:2 is 1.5. Below ~1.4 is square or portrait. */
export const MIN_LANDSCAPE_RATIO = 1.4;

export function readImageSize(buffer: Buffer): ImageSize | null {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return readPngSize(buffer);
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return readJpegSize(buffer);
  }
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return readWebpSize(buffer);
  }
  return null;
}

export function isWideLandscape(size: ImageSize | null, minRatio = MIN_LANDSCAPE_RATIO): boolean {
  if (!size || size.width < 2 || size.height < 2) return false;
  return size.width / size.height >= minRatio;
}

export function landscapeRetryPrompt(prompt: string): string {
  return (
    "CRITICAL FRAME: WIDE 16:9 HORIZONTAL landscape still, much wider than tall, cinematic widescreen 1920x1080. " +
    "Fill the entire frame edge to edge. No portrait, no square, no black bars, no letterboxing, no pillarboxing. " +
    prompt
  );
}

export function pickWider(a: Buffer, b: Buffer): Buffer {
  const ra = ratioOf(a);
  const rb = ratioOf(b);
  return rb > ra ? b : a;
}

export async function generateOrientedImage(
  generate: (
    prompt: string,
    style?: string,
    referenceImage?: Buffer,
    aspectRatio?: string,
    referenceImageUrl?: string,
  ) => Promise<Buffer>,
  opts: {
    prompt: string;
    style?: string;
    referenceImage?: Buffer;
    referenceImageUrl?: string;
    aspectRatio?: string;
  },
): Promise<Buffer> {
  const first = await generate(
    opts.prompt,
    opts.style,
    opts.referenceImage,
    opts.aspectRatio,
    opts.referenceImageUrl,
  );
  if (opts.aspectRatio !== "16:9") return first;

  const firstSize = readImageSize(first);
  if (isWideLandscape(firstSize)) return first;

  console.warn(
    `[image] got ${firstSize ? `${firstSize.width}x${firstSize.height}` : "unknown size"}, expected 16:9 landscape — retrying`,
  );
  const second = await generate(
    landscapeRetryPrompt(opts.prompt),
    opts.style,
    opts.referenceImage,
    opts.aspectRatio,
    opts.referenceImageUrl,
  );
  return isWideLandscape(readImageSize(second)) ? second : pickWider(first, second);
}

function ratioOf(buffer: Buffer): number {
  const size = readImageSize(buffer);
  if (!size || size.height === 0) return 0;
  return size.width / size.height;
}

function readPngSize(buffer: Buffer): ImageSize | null {
  if (buffer.length < 24) return null;
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readJpegSize(buffer: Buffer): ImageSize | null {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker == null) break;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
      offset += 2;
      continue;
    }
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (offset + 4 > buffer.length) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) break;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof && offset + 9 < buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

function readWebpSize(buffer: Buffer): ImageSize | null {
  if (buffer.length < 30) return null;
  if (buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X" && buffer.length >= 30) {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { width, height };
  }
  if (chunk === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return null;
}
