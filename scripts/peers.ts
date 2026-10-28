import type { SheepProfile } from "../src/analysis/black-sheep.ts";
import { sheepProfile } from "../src/analysis/black-sheep.ts";
import { loadDataset } from "../src/analysis/dataset.ts";
import { entryMaturity } from "../src/analysis/entry-maturity.ts";
import { buildInvestmentHistory } from "../src/analysis/investments.ts";
import type { Database } from "../src/db/database.ts";

export interface PeerSet {
  version: string;
  investors: { id: string; name: string }[];
}

/**
 * UK and European early-stage investors, plus a few whose structure fixes their behaviour
 * (angel networks, high-volume small-cheque funds, accelerators) as a check on the score.
 * Identifiers only: `npm run calibrate` fetches their data into a local cache and ships only
 * anonymised shares in `src/analysis/black-sheep-calibration.ts`.
 */
export const PEER_SET: PeerSet = {
  version: "2026-10-28",
  investors: [
    { id: "8ef2c94d-4f0b-4f81-8d57-50119a61cfca", name: "Ada Ventures" },
    { id: "e3aa47c8-e975-48a4-95cf-30f23ff075cc", name: "Antler" },
    { id: "7202b85a-8685-45d5-855d-92b506df75ee", name: "Ascension" },
    { id: "38257af9-ad2c-40c4-aba4-68bdd916d641", name: "byFounders" },
    { id: "ef8b387f-a469-4aa0-9d82-71c05dff90e5", name: "Cambridge Angels" },
    { id: "6e86d624-5d6f-43d9-b08a-338849d988ee", name: "Cherry Ventures" },
    { id: "bd5d7690-a542-4ac3-927e-e92035b6fea7", name: "Concept Ventures" },
    { id: "fec3166e-da91-4483-b318-b1306ca2f987", name: "Crane Venture Partners" },
    { id: "9c3c8279-3e29-4b58-8f10-fcb0730acb26", name: "Entrepreneur First" },
    { id: "80f325c6-e85f-427b-8b96-5cc55423e960", name: "Episode 1 Ventures" },
    { id: "f7a455eb-2b38-4081-b017-ef42eb22148c", name: "Firstminute Capital" },
    { id: "33aeaedb-5f8d-4b01-b759-6b97fe8f5796", name: "Founders Factory" },
    { id: "851c969b-2fac-4acf-9444-25d0d74c598b", name: "Frontline Ventures" },
    { id: "9ebb1740-2482-472a-8551-5b2000c1a689", name: "Fuel Ventures" },
    { id: "475e1cb1-cc85-4ad0-a0ec-06bb2d8247de", name: "Haatch" },
    { id: "a50b7737-3df9-4693-a9b5-4d48264bfb26", name: "Hoxton Ventures" },
    { id: "1fb096c7-c78e-4e8d-89ee-aa14bbfe60c3", name: "Inventure" },
    { id: "1fc9be32-9158-487e-8079-cd322dd7d5b4", name: "JamJar Investments" },
    { id: "32c68bf6-652e-4126-86ef-ff74d579c5fe", name: "Kima Ventures" },
    { id: "d4d84f2e-712d-4076-b5a6-310f9f907357", name: "Kindred Capital" },
    { id: "04926651-e527-446b-83d9-1736dde1e0f8", name: "La Famiglia" },
    { id: "7d3c9943-e634-4481-848a-80bcf452c848", name: "LocalGlobe" },
    { id: "5f56fc90-5331-48d7-a0d1-eaa748c40fd6", name: "Mustard Seed MAZE" },
    { id: "c907cf53-e181-4d47-9883-f30dd58676d0", name: "Notion Capital" },
    { id: "2318f945-ca0c-40bf-8a76-e9da304d74bc", name: "Passion Capital" },
    { id: "087ff418-703b-44bd-8100-d5c3363503bc", name: "Playfair Capital" },
    { id: "4fd42643-7a8a-4d25-9cd5-026fe83d18a0", name: "Point Nine" },
    { id: "a9d89ae3-22df-49b8-9fb6-57ad8701973d", name: "Seedcamp" },
    { id: "81bca5ea-1155-4e7e-93ef-0149c565446c", name: "SFC Capital" },
    { id: "a6979072-620d-418b-b506-c27fbda25ae2", name: "Speedinvest" },
    { id: "7524140b-8d67-4f5c-af49-ac1666d54f33", name: "Stride.VC" },
  ],
};

export function loadSheepProfile(db: Database, investorId: string): SheepProfile {
  const dataset = loadDataset(db, investorId);
  const history = buildInvestmentHistory(dataset);
  return sheepProfile(history, entryMaturity(history), dataset.investor.name);
}
