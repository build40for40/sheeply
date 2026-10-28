const SHEEP = [
  "          .-~~-.-~~-.-~~-.",
  "  ,--.  .(@@@@@@@@@@@@@@@).",
  " ( o  \\(@@@@@@@@@@@@@@@@@@@)",
  "  \\   /(@@@@@@@@@@@@@@@@@@@)",
  "   `-'  `(@@@@@@@@@@@@@@@)'",
  "          `-~~-'-~~-'-~~-'",
  "            ||        ||",
  "            ^^        ^^",
];

const WOOL = "@";

const WOOL_ROWS = SHEEP.flatMap((text, line) =>
  text.includes(WOOL) ? [{ line, start: text.indexOf(WOOL), width: text.lastIndexOf(WOOL) - text.indexOf(WOOL) + 1 }] : [],
);

export const WOOL_SLOTS = WOOL_ROWS.reduce((sum, row) => sum + row.width, 0);

const TIERS: Array<[maxScore: number, label: string]> = [
  [15, "Pure white sheep. Baaa-sically the whole flock."],
  [35, "Follows the flock"],
  [55, "Grey area. Shear indecision."],
  [75, "Ewe-nique taste"],
  [90, "Ram-pant contrarian"],
  [100, "True Blaaaaack Sheep"],
];

export const clampScore = (score: number): number => Math.round(Math.min(100, Math.max(0, score)));

export const tierLabel = (score: number): string => TIERS.find(([max]) => clampScore(score) <= max)![1];

export const woolCount = (score: number): number => Math.round((WOOL_SLOTS * (100 - clampScore(score))) / 100);

function fleece(wool: number): boolean[][] {
  let slot = 0;
  return WOOL_ROWS.map((row) =>
    Array.from({ length: row.width }, () => {
      const filled = Math.floor(((slot + 1) * wool) / WOOL_SLOTS) > Math.floor((slot * wool) / WOOL_SLOTS);
      slot++;
      return filled;
    }),
  );
}

const offsetAlternateRows = (rows: boolean[][]): boolean[][] =>
  rows.map((slots, r) => (r % 2 === 1 ? [slots.at(-1)!, ...slots.slice(0, -1)] : slots));

/** Counts screen columns where the sparser mark sits directly above itself in the next row. */
function stripes(rows: boolean[][], sparse: boolean): number {
  let count = 0;
  for (let r = 1; r < rows.length; r++) {
    const shift = WOOL_ROWS[r]!.start - WOOL_ROWS[r - 1]!.start;
    rows[r]!.forEach((slot, s) => {
      if (slot === sparse && rows[r - 1]![s + shift] === sparse) count++;
    });
  }
  return count;
}

export function renderSheep(score: number): string {
  const wool = woolCount(score);
  const sparse = wool * 2 < WOOL_SLOTS;
  const even = fleece(wool);
  const offset = offsetAlternateRows(even);
  const rows = stripes(offset, sparse) < stripes(even, sparse) ? offset : even;

  const lines = [...SHEEP];
  WOOL_ROWS.forEach(({ line, start, width }, r) => {
    const text = lines[line]!;
    const fill = rows[r]!.map((filled) => (filled ? WOOL : " ")).join("");
    lines[line] = text.slice(0, start) + fill + text.slice(start + width);
  });
  return lines.join("\n");
}

export function renderBlackSheep(investorName: string, score: number): string {
  const clamped = clampScore(score);
  return `Investor: ${investorName}\n${renderSheep(clamped)}\n${clamped}% black sheep: ${tierLabel(clamped)}\n`;
}
