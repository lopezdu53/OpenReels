/** Job folders that must never be listed or pruned as Short/Film jobs. */
export function isIsolatedJobDir(name: string): boolean {
  return (
    name === "vox" ||
    name === "stickman" ||
    name === "nara" ||
    isVoxJobDirName(name) ||
    isStickmanJobDirName(name) ||
    isNaraJobDirName(name)
  );
}

export function isVoxJobDirName(name: string): boolean {
  return /^vox-[\w]+$/.test(name);
}

export function isStickmanJobDirName(name: string): boolean {
  return /^stickman-[\w]+$/.test(name);
}

export function isNaraJobDirName(name: string): boolean {
  return /^nara-[\w]+$/.test(name);
}
