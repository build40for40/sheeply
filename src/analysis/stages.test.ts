import { describe, expect, it } from "vitest";
import { stageBucket } from "./stages.ts";

describe("stageBucket", () => {
  it("maps Dealroom round labels in either spelling", () => {
    expect(stageBucket("PRE-SEED")).toBe("pre_seed");
    expect(stageBucket("Micro-Seed")).toBe("seed");
    expect(stageBucket("SEED+")).toBe("seed");
    expect(stageBucket("Seed Extension")).toBe("seed");
    expect(stageBucket("SERIES A EXTENSION")).toBe("series_a");
    expect(stageBucket("SERIES B")).toBe("series_b_plus");
    expect(stageBucket("Series F Extension")).toBe("series_b_plus");
  });

  it("leaves missing and unknown labels unmapped instead of guessing", () => {
    expect(stageBucket(null)).toBeNull();
    expect(stageBucket("GROWTH EQUITY VC")).toBeNull();
  });
});
