/**
 * Seed script to populate Strapi Cloud with default blocks
 *
 * Usage: npx tsx scripts/seed-blocks.ts
 */

const STRAPI_URL = process.env.STRAPI_URL || "https://mindful-growth-1d34faa3a8.strapiapp.com";
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || "a540115ccdfd6053d1db78a2e9d17ec1c8bd85b7be20d400765b25a51f3866f136541591bbc728e4248419c44ad6bb35940e340416135f75ab85d24622edba58867515f5648ed7969239b9dbbdca9c37e91b4dc7f8a1785e7ba2650566076c6e309931fab26d6cb5097891025cdd9d76222a378c97fe661d3e079d13bb94abb6";

interface BlockMaterial {
  type?: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  transparent?: boolean;
  side?: string;
}

interface BlockData {
  blockId: string;
  name: string;
  description: string;
  cells: { x: number; z: number }[];
  color: string;
  height: number;
  category: string;
  sortOrder: number;
  isActive: boolean;
  material?: BlockMaterial;
  metadata: Record<string, unknown>;
}

const DEFAULT_BLOCKS: BlockData[] = [
  {
    blockId: "block_gray",
    name: "Gray Block",
    description: "Basic gray building block",
    cells: [{ x: 0, z: 0 }],
    color: "#808080",
    height: 1,
    category: "basic",
    sortOrder: 1,
    isActive: true,
    metadata: {},
  },
  {
    blockId: "block_red",
    name: "Red Block",
    description: "Red building block",
    cells: [{ x: 0, z: 0 }],
    color: "#e74c3c",
    height: 1,
    category: "basic",
    sortOrder: 2,
    isActive: true,
    metadata: {},
  },
  {
    blockId: "block_blue",
    name: "Blue Block",
    description: "Blue building block",
    cells: [{ x: 0, z: 0 }],
    color: "#3498db",
    height: 1,
    category: "basic",
    sortOrder: 3,
    isActive: true,
    metadata: {},
  },
  {
    blockId: "block_green",
    name: "Green Block",
    description: "Green building block",
    cells: [{ x: 0, z: 0 }],
    color: "#2ecc71",
    height: 1,
    category: "basic",
    sortOrder: 4,
    isActive: true,
    metadata: {},
  },
  {
    blockId: "block_yellow",
    name: "Yellow Block",
    description: "Yellow building block",
    cells: [{ x: 0, z: 0 }],
    color: "#f1c40f",
    height: 1,
    category: "basic",
    sortOrder: 5,
    isActive: true,
    metadata: {},
  },
  {
    blockId: "block_orange",
    name: "Orange Block",
    description: "Orange building block",
    cells: [{ x: 0, z: 0 }],
    color: "#e67e22",
    height: 1,
    category: "basic",
    sortOrder: 6,
    isActive: true,
    metadata: {},
  },
  {
    blockId: "block_purple",
    name: "Purple Block",
    description: "Purple building block",
    cells: [{ x: 0, z: 0 }],
    color: "#9b59b6",
    height: 1,
    category: "basic",
    sortOrder: 7,
    isActive: true,
    metadata: {},
  },
  {
    blockId: "block_cyan",
    name: "Cyan Block",
    description: "Cyan building block",
    cells: [{ x: 0, z: 0 }],
    color: "#1abc9c",
    height: 1,
    category: "basic",
    sortOrder: 8,
    isActive: true,
    metadata: {},
  },
  {
    blockId: "block_brown",
    name: "Brown Block",
    description: "Brown building block",
    cells: [{ x: 0, z: 0 }],
    color: "#8b4513",
    height: 1,
    category: "basic",
    sortOrder: 9,
    isActive: true,
    metadata: {},
  },
  {
    blockId: "block_white",
    name: "White Block",
    description: "White building block",
    cells: [{ x: 0, z: 0 }],
    color: "#ecf0f1",
    height: 1,
    category: "basic",
    sortOrder: 10,
    isActive: true,
    metadata: {},
  },
  {
    blockId: "block_black",
    name: "Dark Block",
    description: "Dark building block",
    cells: [{ x: 0, z: 0 }],
    color: "#2c3e50",
    height: 1,
    category: "basic",
    sortOrder: 11,
    isActive: true,
    metadata: {},
  },
  {
    blockId: "block_pink",
    name: "Pink Block",
    description: "Pink building block",
    cells: [{ x: 0, z: 0 }],
    color: "#e91e63",
    height: 1,
    category: "basic",
    sortOrder: 12,
    isActive: true,
    metadata: {},
  },
  {
    blockId: "block_metal",
    name: "Metal Block",
    description: "Shiny metallic block",
    cells: [{ x: 0, z: 0 }],
    color: "#c0c0c0",
    height: 1,
    category: "materials",
    sortOrder: 13,
    isActive: true,
    material: {
      type: "standard",
      roughness: 0.2,
      metalness: 0.9,
    },
    metadata: {},
  },
  {
    blockId: "block_gold",
    name: "Gold Block",
    description: "Shiny gold block",
    cells: [{ x: 0, z: 0 }],
    color: "#ffd700",
    height: 1,
    category: "materials",
    sortOrder: 14,
    isActive: true,
    material: {
      type: "standard",
      roughness: 0.3,
      metalness: 0.95,
    },
    metadata: {},
  },
  {
    blockId: "block_glass",
    name: "Glass Block",
    description: "Transparent glass block",
    cells: [{ x: 0, z: 0 }],
    color: "#87ceeb",
    height: 1,
    category: "materials",
    sortOrder: 15,
    isActive: true,
    material: {
      type: "standard",
      roughness: 0.1,
      metalness: 0,
      opacity: 0.4,
      transparent: true,
      side: "double",
    },
    metadata: {},
  },
  {
    blockId: "block_glow_green",
    name: "Glow Green",
    description: "Glowing green block",
    cells: [{ x: 0, z: 0 }],
    color: "#00ff00",
    height: 1,
    category: "materials",
    sortOrder: 16,
    isActive: true,
    material: {
      type: "standard",
      roughness: 0.5,
      metalness: 0,
      emissive: "#00ff00",
      emissiveIntensity: 0.5,
    },
    metadata: {},
  },
  {
    blockId: "block_glow_red",
    name: "Glow Red",
    description: "Glowing red block",
    cells: [{ x: 0, z: 0 }],
    color: "#ff0000",
    height: 1,
    category: "materials",
    sortOrder: 17,
    isActive: true,
    material: {
      type: "standard",
      roughness: 0.5,
      metalness: 0,
      emissive: "#ff0000",
      emissiveIntensity: 0.5,
    },
    metadata: {},
  },
  {
    blockId: "block_matte",
    name: "Matte Block",
    description: "Non-reflective matte block",
    cells: [{ x: 0, z: 0 }],
    color: "#555555",
    height: 1,
    category: "materials",
    sortOrder: 18,
    isActive: true,
    material: {
      type: "standard",
      roughness: 1.0,
      metalness: 0,
    },
    metadata: {},
  },
];

async function getExistingBlocks(): Promise<string[]> {
  const response = await fetch(`${STRAPI_URL}/api/blocks`, {
    headers: {
      Authorization: `Bearer ${STRAPI_API_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch existing blocks: ${response.status}`);
  }

  const json = await response.json();
  return json.data.map((block: { blockId: string }) => block.blockId);
}

async function createBlock(block: BlockData): Promise<boolean> {
  const response = await fetch(`${STRAPI_URL}/api/blocks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${STRAPI_API_TOKEN}`,
    },
    body: JSON.stringify({ data: block }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Failed to create ${block.blockId}: ${response.status} - ${error}`);
    return false;
  }

  return true;
}

async function main() {
  console.log("Seeding blocks to Strapi Cloud...");
  console.log(`URL: ${STRAPI_URL}`);
  console.log("");

  // Get existing blocks to avoid duplicates
  const existingBlocks = await getExistingBlocks();
  console.log(`Found ${existingBlocks.length} existing blocks: ${existingBlocks.join(", ")}`);
  console.log("");

  let created = 0;
  let skipped = 0;

  for (const block of DEFAULT_BLOCKS) {
    if (existingBlocks.includes(block.blockId)) {
      console.log(`⏭️  Skipping ${block.blockId} (already exists)`);
      skipped++;
      continue;
    }

    const success = await createBlock(block);
    if (success) {
      console.log(`✅ Created ${block.blockId}`);
      created++;
    } else {
      console.log(`❌ Failed to create ${block.blockId}`);
    }
  }

  console.log("");
  console.log(`Done! Created: ${created}, Skipped: ${skipped}`);
}

main().catch(console.error);
