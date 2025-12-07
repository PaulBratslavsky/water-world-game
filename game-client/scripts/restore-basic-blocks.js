/**
 * Script to restore the original 12 basic blocks in Strapi
 *
 * Usage: node scripts/restore-basic-blocks.js
 */

const STRAPI_URL = process.env.STRAPI_URL || "https://mindful-growth-1d34faa3a8.strapiapp.com";
const STRAPI_TOKEN = process.env.STRAPI_TOKEN || "a540115ccdfd6053d1db78a2e9d17ec1c8bd85b7be20d400765b25a51f3866f136541591bbc728e4248419c44ad6bb35940e340416135f75ab85d24622edba58867515f5648ed7969239b9dbbdca9c37e91b4dc7f8a1785e7ba2650566076c6e309931fab26d6cb5097891025cdd9d76222a378c97fe661d3e079d13bb94abb6";

// Original 12 basic blocks - these should be in Strapi
const BASIC_BLOCKS = [
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
];

async function findBlockByBlockId(blockId) {
  const url = `${STRAPI_URL}/api/blocks?filters[blockId][$eq]=${encodeURIComponent(blockId)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${STRAPI_TOKEN}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const result = await response.json();
  if (result.data && result.data.length > 0) {
    return result.data[0];
  }
  return null;
}

async function createBlock(block) {
  const url = `${STRAPI_URL}/api/blocks`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${STRAPI_TOKEN}`,
    },
    body: JSON.stringify({ data: block }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create ${block.blockId}: ${response.status} ${error}`);
  }

  const result = await response.json();
  return result.data;
}

async function updateBlock(documentId, block) {
  const url = `${STRAPI_URL}/api/blocks/${documentId}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${STRAPI_TOKEN}`,
    },
    body: JSON.stringify({ data: block }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update ${block.blockId}: ${response.status} ${error}`);
  }

  const result = await response.json();
  return result.data;
}

async function createOrUpdateBlock(block) {
  const existing = await findBlockByBlockId(block.blockId);

  if (existing) {
    await updateBlock(existing.documentId, block);
    return "updated";
  } else {
    await createBlock(block);
    return "created";
  }
}

async function main() {
  console.log("Restoring basic blocks...");
  console.log(`Using Strapi URL: ${STRAPI_URL}`);
  console.log("");

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const block of BASIC_BLOCKS) {
    try {
      process.stdout.write(`Processing ${block.blockId}... `);
      const result = await createOrUpdateBlock(block);
      if (result === "created") {
        console.log("CREATED");
        created++;
      } else {
        console.log("UPDATED");
        updated++;
      }
    } catch (error) {
      console.log(`FAILED: ${error.message}`);
      failed++;
    }
  }

  console.log("");
  console.log(`Done! Created: ${created}, Updated: ${updated}, Failed: ${failed}`);
}

main().catch(console.error);
