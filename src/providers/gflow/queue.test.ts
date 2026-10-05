import { describe, expect, it } from "vitest";
import { enqueueGflow } from "./queue.js";

describe("enqueueGflow", () => {
  it("runs jobs one after another", async () => {
    const order: number[] = [];
    const slow = enqueueGflow(async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push(1);
      return "a";
    });
    const fast = enqueueGflow(async () => {
      order.push(2);
      return "b";
    });
    await expect(Promise.all([slow, fast])).resolves.toEqual(["a", "b"]);
    expect(order).toEqual([1, 2]);
  });
});
