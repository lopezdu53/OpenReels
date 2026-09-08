import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ImageProvider } from "../../schema/providers.js";
import { resolveGflowImageModel } from "../gflow/catalog.js";
import { GflowCliError, runGflowJson } from "../gflow/client.js";

function readLocalPath(payload: Record<string, unknown>): string {
  const images = payload["images"];
  if (Array.isArray(images) && images[0] && typeof images[0] === "object") {
    const local = (images[0] as { local_path?: string }).local_path;
    if (local) return local;
  }
  throw new GflowCliError("gflow image no devolvió local_path");
}

export class GflowImage implements ImageProvider {
  private modelId: string;

  constructor(modelId?: string) {
    this.modelId = resolveGflowImageModel(modelId);
  }

  async generate(
    prompt: string,
    style?: string,
    referenceImage?: Buffer,
    aspectRatio?: string,
  ): Promise<Buffer> {
    const aspect = aspectRatio === "9:16" || aspectRatio === "1:1" ? aspectRatio : "16:9";
    const full = style ? `${prompt}. Style: ${style}` : prompt;
    const dest = path.join(os.tmpdir(), `openreels-gflow-${Date.now()}.png`);
    const args = referenceImage && referenceImage.length > 80
      ? ["image", "i2i", full, "--ref", writeTempPng(referenceImage), "--model", this.modelId, "--aspect", aspect, "-o", dest]
      : ["image", "t2i", full, "--model", this.modelId, "--aspect", aspect, "-o", dest];

    const payload = await runGflowJson(args, 240_000);
    const local = fs.existsSync(dest) ? dest : readLocalPath(payload);
    const buf = fs.readFileSync(local);
    if (buf.length < 1000) throw new GflowCliError(`gflow image too small (${buf.length} bytes)`);
    return buf;
  }
}

function writeTempPng(buf: Buffer): string {
  const dest = path.join(os.tmpdir(), `openreels-gflow-ref-${Date.now()}.png`);
  fs.writeFileSync(dest, buf);
  return dest;
}
