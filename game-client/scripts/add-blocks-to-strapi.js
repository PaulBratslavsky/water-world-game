/**
 * Script to add block variants to Strapi
 *
 * Usage: node scripts/add-blocks-to-strapi.js
 */

const STRAPI_URL = process.env.STRAPI_URL || "https://mindful-growth-1d34faa3a8.strapiapp.com";
const STRAPI_TOKEN = process.env.STRAPI_TOKEN || "a540115ccdfd6053d1db78a2e9d17ec1c8bd85b7be20d400765b25a51f3866f136541591bbc728e4248419c44ad6bb35940e340416135f75ab85d24622edba58867515f5648ed7969239b9dbbdca9c37e91b4dc7f8a1785e7ba2650566076c6e309931fab26d6cb5097891025cdd9d76222a378c97fe661d3e079d13bb94abb6";

// Base colors from the existing blocks
const COLORS = [
  { name: "Gray", id: "gray", hex: "#808080" },
  { name: "Red", id: "red", hex: "#e74c3c" },
  { name: "Blue", id: "blue", hex: "#3498db" },
  { name: "Green", id: "green", hex: "#2ecc71" },
  { name: "Yellow", id: "yellow", hex: "#f1c40f" },
  { name: "Orange", id: "orange", hex: "#e67e22" },
  { name: "Purple", id: "purple", hex: "#9b59b6" },
  { name: "Cyan", id: "cyan", hex: "#1abc9c" },
  { name: "Brown", id: "brown", hex: "#8b4513" },
  { name: "White", id: "white", hex: "#ecf0f1" },
  { name: "Dark", id: "dark", hex: "#2c3e50" },
  { name: "Pink", id: "pink", hex: "#e91e63" },
];

// Generate blocks for each color
function generateColorVariants() {
  const blocks = [];
  let sortOrder = 100; // Start after existing blocks

  for (const color of COLORS) {
    // Glass variant
    blocks.push({
      blockId: `block_${color.id}_glass`,
      name: `${color.name} Glass`,
      description: `Transparent ${color.name.toLowerCase()} glass block`,
      cells: [{ x: 0, z: 0 }],
      color: color.hex,
      height: 1,
      category: "materials",
      sortOrder: sortOrder++,
      isActive: true,
      material: {
        type: "standard",
        roughness: 0.1,
        metalness: 0.1,
        opacity: 0.5,
        transparent: true,
      },
      metadata: {},
    });

    // Metallic variant
    blocks.push({
      blockId: `block_${color.id}_metal`,
      name: `${color.name} Metal`,
      description: `Shiny metallic ${color.name.toLowerCase()} block`,
      cells: [{ x: 0, z: 0 }],
      color: color.hex,
      height: 1,
      category: "materials",
      sortOrder: sortOrder++,
      isActive: true,
      material: {
        type: "standard",
        roughness: 0.2,
        metalness: 0.9,
      },
      metadata: {},
    });

    // Glowing variant
    blocks.push({
      blockId: `block_${color.id}_glow`,
      name: `${color.name} Glow`,
      description: `Glowing ${color.name.toLowerCase()} block`,
      cells: [{ x: 0, z: 0 }],
      color: color.hex,
      height: 1,
      category: "materials",
      sortOrder: sortOrder++,
      isActive: true,
      material: {
        type: "standard",
        roughness: 0.5,
        metalness: 0.1,
        emissive: color.hex,
        emissiveIntensity: 0.8,
      },
      metadata: {},
    });
  }

  return blocks;
}

// Special blocks - unique materials and effects
function generateSpecialBlocks() {
  let sortOrder = 200;

  return [
    // Nature blocks
    {
      blockId: "block_grass",
      name: "Grass",
      description: "Natural grass block",
      cells: [{ x: 0, z: 0 }],
      color: "#4a7c23",
      height: 1,
      category: "nature",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.9, metalness: 0 },
      metadata: {},
    },
    {
      blockId: "block_dirt",
      name: "Dirt",
      description: "Earthy dirt block",
      cells: [{ x: 0, z: 0 }],
      color: "#6b4423",
      height: 1,
      category: "nature",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.95, metalness: 0 },
      metadata: {},
    },
    {
      blockId: "block_sand",
      name: "Sand",
      description: "Sandy beach block",
      cells: [{ x: 0, z: 0 }],
      color: "#e6d5a8",
      height: 1,
      category: "nature",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.9, metalness: 0 },
      metadata: {},
    },
    {
      blockId: "block_stone",
      name: "Stone",
      description: "Solid stone block",
      cells: [{ x: 0, z: 0 }],
      color: "#7a7a7a",
      height: 1,
      category: "nature",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.8, metalness: 0 },
      metadata: {},
    },
    {
      blockId: "block_cobblestone",
      name: "Cobblestone",
      description: "Rough cobblestone block",
      cells: [{ x: 0, z: 0 }],
      color: "#5a5a5a",
      height: 1,
      category: "nature",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.95, metalness: 0 },
      metadata: {},
    },
    {
      blockId: "block_wood",
      name: "Wood",
      description: "Wooden plank block",
      cells: [{ x: 0, z: 0 }],
      color: "#b5651d",
      height: 1,
      category: "nature",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.85, metalness: 0 },
      metadata: {},
    },
    {
      blockId: "block_log",
      name: "Log",
      description: "Tree log block",
      cells: [{ x: 0, z: 0 }],
      color: "#654321",
      height: 1,
      category: "nature",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.9, metalness: 0 },
      metadata: {},
    },
    {
      blockId: "block_leaves",
      name: "Leaves",
      description: "Tree leaves block",
      cells: [{ x: 0, z: 0 }],
      color: "#228b22",
      height: 1,
      category: "nature",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.9, metalness: 0, opacity: 0.9, transparent: true },
      metadata: {},
    },
    {
      blockId: "block_water",
      name: "Water",
      description: "Transparent water block",
      cells: [{ x: 0, z: 0 }],
      color: "#1e90ff",
      height: 1,
      category: "nature",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.1, metalness: 0.3, opacity: 0.6, transparent: true },
      metadata: {},
    },
    {
      blockId: "block_ice",
      name: "Ice",
      description: "Slippery ice block",
      cells: [{ x: 0, z: 0 }],
      color: "#b0e0e6",
      height: 1,
      category: "nature",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.05, metalness: 0.2, opacity: 0.7, transparent: true },
      metadata: {},
    },
    {
      blockId: "block_snow",
      name: "Snow",
      description: "Fluffy snow block",
      cells: [{ x: 0, z: 0 }],
      color: "#fffafa",
      height: 1,
      category: "nature",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.95, metalness: 0 },
      metadata: {},
    },
    {
      blockId: "block_lava",
      name: "Lava",
      description: "Hot glowing lava block",
      cells: [{ x: 0, z: 0 }],
      color: "#ff4500",
      height: 1,
      category: "nature",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.6, metalness: 0, emissive: "#ff4500", emissiveIntensity: 1.5 },
      metadata: {},
    },

    // Building materials
    {
      blockId: "block_brick",
      name: "Brick",
      description: "Classic red brick block",
      cells: [{ x: 0, z: 0 }],
      color: "#cb4154",
      height: 1,
      category: "industrial",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.85, metalness: 0 },
      metadata: {},
    },
    {
      blockId: "block_concrete",
      name: "Concrete",
      description: "Solid concrete block",
      cells: [{ x: 0, z: 0 }],
      color: "#95a5a6",
      height: 1,
      category: "industrial",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.8, metalness: 0 },
      metadata: {},
    },
    {
      blockId: "block_marble",
      name: "Marble",
      description: "Elegant marble block",
      cells: [{ x: 0, z: 0 }],
      color: "#f5f5f5",
      height: 1,
      category: "industrial",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.3, metalness: 0.1 },
      metadata: {},
    },
    {
      blockId: "block_obsidian",
      name: "Obsidian",
      description: "Dark volcanic glass block",
      cells: [{ x: 0, z: 0 }],
      color: "#1a1a2e",
      height: 1,
      category: "industrial",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.15, metalness: 0.4 },
      metadata: {},
    },

    // Precious materials
    {
      blockId: "block_silver",
      name: "Silver",
      description: "Shiny silver block",
      cells: [{ x: 0, z: 0 }],
      color: "#c0c0c0",
      height: 1,
      category: "materials",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.15, metalness: 0.95 },
      metadata: {},
    },
    {
      blockId: "block_copper",
      name: "Copper",
      description: "Warm copper block",
      cells: [{ x: 0, z: 0 }],
      color: "#b87333",
      height: 1,
      category: "materials",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.25, metalness: 0.9 },
      metadata: {},
    },
    {
      blockId: "block_bronze",
      name: "Bronze",
      description: "Aged bronze block",
      cells: [{ x: 0, z: 0 }],
      color: "#cd7f32",
      height: 1,
      category: "materials",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.35, metalness: 0.85 },
      metadata: {},
    },
    {
      blockId: "block_diamond",
      name: "Diamond",
      description: "Sparkling diamond block",
      cells: [{ x: 0, z: 0 }],
      color: "#b9f2ff",
      height: 1,
      category: "materials",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.05, metalness: 0.3, opacity: 0.8, transparent: true },
      metadata: {},
    },
    {
      blockId: "block_emerald",
      name: "Emerald",
      description: "Precious emerald block",
      cells: [{ x: 0, z: 0 }],
      color: "#50c878",
      height: 1,
      category: "materials",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.1, metalness: 0.3, opacity: 0.85, transparent: true },
      metadata: {},
    },
    {
      blockId: "block_ruby",
      name: "Ruby",
      description: "Precious ruby block",
      cells: [{ x: 0, z: 0 }],
      color: "#e0115f",
      height: 1,
      category: "materials",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.1, metalness: 0.3, opacity: 0.85, transparent: true },
      metadata: {},
    },
    {
      blockId: "block_sapphire",
      name: "Sapphire",
      description: "Precious sapphire block",
      cells: [{ x: 0, z: 0 }],
      color: "#0f52ba",
      height: 1,
      category: "materials",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.1, metalness: 0.3, opacity: 0.85, transparent: true },
      metadata: {},
    },

    // Tech/Sci-fi blocks
    {
      blockId: "block_neon_blue",
      name: "Neon Blue",
      description: "Bright neon blue light",
      cells: [{ x: 0, z: 0 }],
      color: "#00ffff",
      height: 1,
      category: "industrial",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.3, metalness: 0.5, emissive: "#00ffff", emissiveIntensity: 1.2 },
      metadata: {},
    },
    {
      blockId: "block_neon_pink",
      name: "Neon Pink",
      description: "Bright neon pink light",
      cells: [{ x: 0, z: 0 }],
      color: "#ff00ff",
      height: 1,
      category: "industrial",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.3, metalness: 0.5, emissive: "#ff00ff", emissiveIntensity: 1.2 },
      metadata: {},
    },
    {
      blockId: "block_hologram",
      name: "Hologram",
      description: "Translucent holographic block",
      cells: [{ x: 0, z: 0 }],
      color: "#00ff88",
      height: 1,
      category: "industrial",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.2, metalness: 0.6, opacity: 0.4, transparent: true, emissive: "#00ff88", emissiveIntensity: 0.5 },
      metadata: {},
    },
    {
      blockId: "block_circuit",
      name: "Circuit",
      description: "High-tech circuit block",
      cells: [{ x: 0, z: 0 }],
      color: "#1a1a1a",
      height: 1,
      category: "industrial",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.4, metalness: 0.7, emissive: "#00ff00", emissiveIntensity: 0.3 },
      metadata: {},
    },
    {
      blockId: "block_energy",
      name: "Energy",
      description: "Pulsing energy block",
      cells: [{ x: 0, z: 0 }],
      color: "#7b68ee",
      height: 1,
      category: "industrial",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 0.2, metalness: 0.4, opacity: 0.7, transparent: true, emissive: "#7b68ee", emissiveIntensity: 1.0 },
      metadata: {},
    },

    // Fabric/Soft blocks
    {
      blockId: "block_wool_white",
      name: "White Wool",
      description: "Soft white wool block",
      cells: [{ x: 0, z: 0 }],
      color: "#f5f5dc",
      height: 1,
      category: "materials",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 1.0, metalness: 0 },
      metadata: {},
    },
    {
      blockId: "block_wool_red",
      name: "Red Wool",
      description: "Soft red wool block",
      cells: [{ x: 0, z: 0 }],
      color: "#dc143c",
      height: 1,
      category: "materials",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 1.0, metalness: 0 },
      metadata: {},
    },
    {
      blockId: "block_wool_blue",
      name: "Blue Wool",
      description: "Soft blue wool block",
      cells: [{ x: 0, z: 0 }],
      color: "#4169e1",
      height: 1,
      category: "materials",
      sortOrder: sortOrder++,
      isActive: true,
      material: { roughness: 1.0, metalness: 0 },
      metadata: {},
    },
  ];
}

// Generate all blocks
function generateBlocks() {
  return [...generateColorVariants(), ...generateSpecialBlocks()];
}

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
    // Update existing block
    await updateBlock(existing.documentId, block);
    return "updated";
  } else {
    // Create new block
    await createBlock(block);
    return "created";
  }
}

async function main() {
  console.log("Generating block variants...");
  const blocks = generateBlocks();
  console.log(`Generated ${blocks.length} blocks to create/update`);
  console.log(`Using Strapi URL: ${STRAPI_URL}`);
  console.log("");

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const block of blocks) {
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
