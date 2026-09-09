/** Job folders that must never be listed or pruned as Short/Film jobs. */
export function isIsolatedJobDir(name: string): boolean {
  return name === "vox" || name === "stickman" || isVoxJobDirName(name) || isStickmanJobDirName(name);
}

export function isVoxJobDirName(name: string): boolean {
  return /^vox-[\w]+$/.test(name);
}

export function isStickmanJobDirName(name: string): boolean {
  return /^stickman-[\w]+$/.test(name);
}
