import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authenticate,
  createUser,
  ensureSuperadmin,
  getUserById,
  listUsers,
  setUserPassword,
  toAdminRow,
  toPublic,
  updateUser,
} from "./store.js";

describe("user store + superadmin", () => {
  let dir: string;
  const prevData = process.env["DATA_DIR"];
  const prevEmail = process.env["SUPERADMIN_EMAIL"];
  const prevPass = process.env["SUPERADMIN_PASSWORD"];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "or-users-"));
    process.env["DATA_DIR"] = dir;
    delete process.env["SUPERADMIN_EMAIL"];
    delete process.env["SUPERADMIN_PASSWORD"];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (prevData === undefined) delete process.env["DATA_DIR"];
    else process.env["DATA_DIR"] = prevData;
    if (prevEmail === undefined) delete process.env["SUPERADMIN_EMAIL"];
    else process.env["SUPERADMIN_EMAIL"] = prevEmail;
    if (prevPass === undefined) delete process.env["SUPERADMIN_PASSWORD"];
    else process.env["SUPERADMIN_PASSWORD"] = prevPass;
  });

  it("creates users as role user and lists them without password hashes", async () => {
    await createUser({ email: "a@test.com", name: "Ana", password: "secret123" });
    const rows = listUsers().map(toAdminRow);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("user");
    expect(rows[0]?.email).toBe("a@test.com");
    expect(JSON.stringify(rows[0])).not.toContain("passwordHash");
    expect(toPublic(listUsers()[0]!).role).toBe("user");
  });

  it("updates email in the index and sets a new password", async () => {
    const user = await createUser({ email: "old@test.com", name: "Old", password: "secret123" });
    const updated = await updateUser(user.id, {
      email: "new@test.com",
      name: "Nuevo",
      dailyGoal: 6,
    });
    expect(updated.email).toBe("new@test.com");
    expect(updated.name).toBe("Nuevo");
    expect(updated.dailyGoal).toBe(6);
    expect(await authenticate("old@test.com", "secret123")).toBeNull();
    await setUserPassword(user.id, "newpass99");
    expect(await authenticate("new@test.com", "secret123")).toBeNull();
    expect((await authenticate("new@test.com", "newpass99"))?.id).toBe(user.id);
  });

  it("seeds superadmin from env and syncs password on boot", async () => {
    process.env["SUPERADMIN_EMAIL"] = "boss@test.com";
    process.env["SUPERADMIN_PASSWORD"] = "adminpass";
    const first = await ensureSuperadmin();
    expect(first?.role).toBe("admin");
    expect(await authenticate("boss@test.com", "adminpass")).not.toBeNull();

    process.env["SUPERADMIN_PASSWORD"] = "rotated99";
    await ensureSuperadmin();
    expect(await authenticate("boss@test.com", "adminpass")).toBeNull();
    const boss = await authenticate("boss@test.com", "rotated99");
    expect(boss).not.toBeNull();
    expect(toPublic(boss!).role).toBe("admin");
  });

  it("refuses to demote or rename the env superadmin", async () => {
    process.env["SUPERADMIN_EMAIL"] = "boss@test.com";
    process.env["SUPERADMIN_PASSWORD"] = "adminpass";
    const boss = await ensureSuperadmin();
    await expect(updateUser(boss!.id, { role: "user" })).rejects.toThrow(/degradar/);
    await expect(updateUser(boss!.id, { email: "other@test.com" })).rejects.toThrow(/email/);
  });

  it("hydrates legacy user files missing dashboard fields", async () => {
    const user = await createUser({ email: "legacy@test.com", name: "L", password: "secret123" });
    const file = path.join(dir, "users", `${user.id}.json`);
    const raw = JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
    delete raw["clonedVideos"];
    delete raw["clonedChannels"];
    delete raw["checkins"];
    delete raw["dailyGoal"];
    writeFileSync(file, JSON.stringify(raw));
    const loaded = getUserById(user.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.clonedVideos).toEqual([]);
    expect(loaded!.clonedChannels).toEqual([]);
    expect(loaded!.characters).toEqual([]);
    expect(loaded!.visualStyles).toEqual([]);
    expect(loaded!.checkins).toEqual({});
    expect(loaded!.dailyGoal).toBe(4);
    expect(() => loaded!.clonedVideos.slice(0, 12)).not.toThrow();
  });
});
