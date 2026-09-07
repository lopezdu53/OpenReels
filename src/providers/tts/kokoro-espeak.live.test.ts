import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { phonemizeForKokoro } from "./kokoro-espeak.js";

function hasEspeak(): boolean {
  try {
    execFileSync("espeak-ng", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasEspeak())("phonemizeForKokoro (live espeak-ng)", () => {
  it("reads 400,000 as cuatrocientos mil, not 'coma cero'", async () => {
    const ipa = await phonemizeForKokoro(
      "Durante 400 años, más de 400,000 personas murieron.",
      "es",
    );
    expect(ipa).toMatch(/mˈil/);
    expect(ipa).not.toMatch(/kˌoma/);
    expect(ipa).toContain(",");
    expect(ipa.endsWith(".")).toBe(true);
  });

  it("keeps a comma pause between clauses", async () => {
    const ipa = await phonemizeForKokoro("Hola, mundo.", "es");
    expect(ipa).toMatch(/ola,\s*mˈundo\./);
  });
});
