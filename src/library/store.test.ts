import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../auth/store.js";
import {
  deleteCharacter,
  deleteLocation,
  parseCharacterBundle,
  parseLocationBundle,
  parseStyleBundle,
  upsertCharacter,
  upsertLocation,
  upsertVisualStyle,
} from "./store.js";

describe("library store", () => {
  let dir: string;
  const prev = process.env["DATA_DIR"];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "or-lib-"));
    process.env["DATA_DIR"] = dir;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (prev === undefined) delete process.env["DATA_DIR"];
    else process.env["DATA_DIR"] = prev;
  });

  it("creates, updates, exports and deletes a character", async () => {
    const user = await createUser({ email: "lib@test.com", name: "L", password: "secret123" });
    const created = upsertCharacter(user.id, {
      name: "Rayitas",
      species: "tigrillo ocelote cachorro",
      appearance: "pelaje amarillo pálido con ocelos pequeños, orejas redondas",
      mustAvoid: "tigre de Bengala adulto, gato doméstico",
    });
    expect(created.id).toBeTruthy();
    expect(created.kind).toBe("fictional");
    const updated = upsertCharacter(user.id, { ...created, age: "cachorro 4 meses", kind: "animal" });
    expect(updated.age).toContain("cachorro");
    expect(updated.kind).toBe("animal");
    const withAlias = upsertCharacter(user.id, { ...updated, aliases: "el tigrillo, Rayitas" });
    expect(withAlias.aliases).toContain("tigrillo");
    expect(deleteCharacter(user.id, created.id)).toBe(true);
    expect(deleteCharacter(user.id, created.id)).toBe(false);
  });

  it("unwraps download JSON bundles", () => {
    const char = parseCharacterBundle({
      openreels: "character",
      version: 1,
      character: { name: "Mito", species: "ocelote", appearance: "ocelos dorados y cola anillada" },
    });
    expect(char.name).toBe("Mito");
    const style = parseStyleBundle({
      openreels: "visual-style",
      version: 1,
      style: { name: "Selva cine", artStyle: "Filmic jungle, golden hour, 35mm, soft haze" },
    });
    expect(style.name).toBe("Selva cine");
  });

  it("saves a custom visual style", async () => {
    const user = await createUser({ email: "st@test.com", name: "S", password: "secret123" });
    const style = upsertVisualStyle(user.id, {
      name: "Cuento selva",
      artStyle: "Warm cinematic storybook, golden hour jungle, soft bokeh, 35mm",
      palette: "amber, moss, gold",
    });
    expect(style.artStyle).toContain("storybook");
    expect(style.referenceImage).toBeUndefined();
  });

  it("defaults human species and stores a style board image", async () => {
    const user = await createUser({ email: "sheet@test.com", name: "H", password: "secret123" });
    const human = upsertCharacter(user.id, {
      name: "Ana",
      kind: "human",
      appearance: "cabello oscuro, ojos cafe, cicatriz suave en la ceja",
    });
    expect(human.kind).toBe("human");
    expect(human.species).toBe("humano");

    const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "utf8").toString("utf8");
    const style = upsertVisualStyle(user.id, {
      name: "Selva cine",
      artStyle: "Filmic jungle, golden hour, 35mm, soft haze, storybook lighting",
      referenceImage: tinyPng,
    });
    expect(style.referenceImage).toBeTruthy();
  });

  it("creates, exports and deletes a location", async () => {
    const user = await createUser({ email: "loc@test.com", name: "L", password: "secret123" });
    const created = upsertLocation(user.id, {
      name: "Villa Santorini",
      place: "villa blanca de cal en acantilado, terrazas al Egeo",
      aliases: "la villa, la casa blanca",
    });
    expect(created.id).toBeTruthy();
    expect(created.place).toContain("acantilado");
    const updated = upsertLocation(user.id, { ...created, timeOfDay: "atardecer" });
    expect(updated.timeOfDay).toBe("atardecer");
    expect(parseLocationBundle({
      openreels: "location",
      version: 1,
      location: { name: "Oficina", place: "open space de cristal y acero, noche" },
    }).name).toBe("Oficina");
    expect(deleteLocation(user.id, created.id)).toBe(true);
    expect(deleteLocation(user.id, created.id)).toBe(false);
  });
});
