/** One Chrome profile: image and I2V must run one at a time. */
let tail: Promise<void> = Promise.resolve();

export async function enqueueGflow<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const prev = tail;
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await prev;
    return await fn();
  } finally {
    release();
  }
}
