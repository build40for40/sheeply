import { describe, expect, it } from "vitest";
import { WOOL_SLOTS, renderBlackSheep, renderSheep, tierLabel, woolCount } from "./sheep.ts";

const outline = (sheep: string) => sheep.replaceAll("@", " ");

describe("black sheep", () => {
  it.each([0, 25, 50, 75, 100])("prints the sheep at %i for an eyeball check", (score) => {
    const output = renderBlackSheep("Example Ventures", score);
    console.log(`\n${output}`);

    expect(output.match(/@/g)?.length ?? 0).toBe(woolCount(score));
    expect(outline(renderSheep(score))).toBe(outline(renderSheep(0)));
  });

  it("has 68 wool slots, all filled at 0 and none at 100", () => {
    expect(WOOL_SLOTS).toBe(68);
    expect(woolCount(0)).toBe(68);
    expect(renderSheep(100)).not.toContain("@");
  });

  it("thins the fleece everywhere at once instead of emptying one area first", () => {
    const rows = renderSheep(50).split("\n").filter((line) => line.includes("("));
    for (const row of rows) expect(row).toMatch(/@ @ @/);
  });

  it("clamps out-of-range scores", () => {
    expect(renderBlackSheep("A", -20)).toBe(renderBlackSheep("A", 0));
    expect(renderBlackSheep("A", 250)).toBe(renderBlackSheep("A", 100));
    expect(renderBlackSheep("A", 250)).toContain("100% black sheep: True Blaaaaack Sheep");
  });

  it("labels each tier at its boundaries", () => {
    expect([0, 15, 16, 35, 36, 55, 56, 75, 76, 90, 91, 100].map(tierLabel)).toEqual([
      "Pure white sheep. Baaa-sically the whole flock.",
      "Pure white sheep. Baaa-sically the whole flock.",
      "Follows the flock",
      "Follows the flock",
      "Grey area. Shear indecision.",
      "Grey area. Shear indecision.",
      "Ewe-nique taste",
      "Ewe-nique taste",
      "Ram-pant contrarian",
      "Ram-pant contrarian",
      "True Blaaaaack Sheep",
      "True Blaaaaack Sheep",
    ]);
  });
});
