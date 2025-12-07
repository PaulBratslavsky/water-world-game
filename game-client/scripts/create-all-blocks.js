/**
 * Script to create all blocks in Strapi from scratch
 *
 * Block types:
 * - Regular: standard matte blocks
 * - Metal: shiny metallic blocks (high metalness, low roughness)
 * - Glow: emissive blocks that glow
 * - Glass: transparent blocks
 *
 * Usage: node scripts/create-all-blocks.js
 */

const STRAPI_URL = process.env.STRAPI_URL || "https://mindful-growth-1d34faa3a8.strapiapp.com";
const STRAPI_TOKEN = process.env.STRAPI_TOKEN || "a540115ccdfd6053d1db78a2e9d17ec1c8bd85b7be20d400765b25a51f3866f136541591bbc728e4248419c44ad6bb35940e340416135f75ab85d24622edba58867515f5648ed7969239b9dbbdca9c37e91b4dc7f8a1785e7ba2650566076c6e309931fab26d6cb5097891025cdd9d76222a378c97fe661d3e079d13bb94abb6";

// Base colors
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

/**
 * Material presets matching THREE.MeshStandardMaterial properties:
 * - color: base color (hex string)
 * - emissive: self-glow color (hex string, default "#000000")
 * - emissiveIntensity: strength of glow (default 1)
 * - metalness: 0-1, how metallic (default 0)
 * - roughness: 0-1, how rough/matte (default 0.7)
 * - opacity: 0-1, transparency (default 1)
 * - transparent: boolean, enable transparency (default false)
 */

function generateAllBlocks() {
  const blocks = [];
  let sortOrder = 1;

  // === COLOR BLOCKS (grouped by color: regular, metal, glow, glass) ===
  // Each color gets 4 variants grouped together
  for (const color of COLORS) {
    // Regular - standard matte block
    blocks.push({
      blockId: `block_${color.id}`,
      name: `${color.name} Block`,
      description: `Basic ${color.name.toLowerCase()} building block`,
      cells: [{ x: 0, z: 0 }],
      color: color.hex,
      height: 1,
      category: "basic",
      sortOrder: sortOrder++,
      isActive: true,
      material: {
        metalness: 0,
        roughness: 0.7,
      },
      metadata: {},
    });

    // Metal - highly reflective chrome-like surface
    blocks.push({
      blockId: `block_${color.id}_metal`,
      name: `${color.name} Metal`,
      description: `Shiny metallic ${color.name.toLowerCase()} block`,
      cells: [{ x: 0, z: 0 }],
      color: color.hex,
      height: 1,
      category: "basic",
      sortOrder: sortOrder++,
      isActive: true,
      material: {
        metalness: 1.0,
        roughness: 0.05,
      },
      metadata: {},
    });

    // Glow - strongly emissive block for bloom effect
    blocks.push({
      blockId: `block_${color.id}_glow`,
      name: `${color.name} Glow`,
      description: `Glowing ${color.name.toLowerCase()} block`,
      cells: [{ x: 0, z: 0 }],
      color: color.hex,
      height: 1,
      category: "basic",
      sortOrder: sortOrder++,
      isActive: true,
      material: {
        metalness: 0.0,
        roughness: 0.3,
        emissive: color.hex,
        emissiveIntensity: 2.5,
      },
      metadata: {},
    });

    // Glass - transparent block
    blocks.push({
      blockId: `block_${color.id}_glass`,
      name: `${color.name} Glass`,
      description: `Transparent ${color.name.toLowerCase()} glass block`,
      cells: [{ x: 0, z: 0 }],
      color: color.hex,
      height: 1,
      category: "basic",
      sortOrder: sortOrder++,
      isActive: true,
      material: {
        metalness: 0.1,
        roughness: 0.1,
        opacity: 0.5,
        transparent: true,
      },
      metadata: {},
    });
  }

  // === NATURE BLOCKS ===
  const natureBlocks = [
    { id: "grass", name: "Grass", hex: "#4a7c23", roughness: 0.9 },
    { id: "dirt", name: "Dirt", hex: "#6b4423", roughness: 0.95 },
    { id: "sand", name: "Sand", hex: "#e6d5a8", roughness: 0.9 },
    { id: "stone", name: "Stone", hex: "#7a7a7a", roughness: 0.8 },
    { id: "cobblestone", name: "Cobblestone", hex: "#5a5a5a", roughness: 0.95 },
    { id: "wood", name: "Wood", hex: "#b5651d", roughness: 0.85 },
    { id: "log", name: "Log", hex: "#654321", roughness: 0.9 },
    { id: "snow", name: "Snow", hex: "#fffafa", roughness: 0.95 },
  ];

  for (const block of natureBlocks) {
    blocks.push({
      blockId: `block_${block.id}`,
      name: block.name,
      description: `Natural ${block.name.toLowerCase()} block`,
      cells: [{ x: 0, z: 0 }],
      color: block.hex,
      height: 1,
      category: "nature",
      sortOrder: sortOrder++,
      isActive: true,
      material: {
        metalness: 0,
        roughness: block.roughness,
      },
      metadata: {},
    });
  }

  // Nature blocks with transparency
  blocks.push({
    blockId: "block_leaves",
    name: "Leaves",
    description: "Tree leaves block",
    cells: [{ x: 0, z: 0 }],
    color: "#228b22",
    height: 1,
    category: "nature",
    sortOrder: sortOrder++,
    isActive: true,
    material: {
      metalness: 0,
      roughness: 0.9,
      opacity: 0.9,
      transparent: true,
    },
    metadata: {},
  });

  blocks.push({
    blockId: "block_water",
    name: "Water",
    description: "Transparent water block",
    cells: [{ x: 0, z: 0 }],
    color: "#1e90ff",
    height: 1,
    category: "nature",
    sortOrder: sortOrder++,
    isActive: true,
    material: {
      metalness: 0.3,
      roughness: 0.1,
      opacity: 0.6,
      transparent: true,
    },
    metadata: {},
  });

  blocks.push({
    blockId: "block_ice",
    name: "Ice",
    description: "Slippery ice block",
    cells: [{ x: 0, z: 0 }],
    color: "#b0e0e6",
    height: 1,
    category: "nature",
    sortOrder: sortOrder++,
    isActive: true,
    material: {
      metalness: 0.2,
      roughness: 0.05,
      opacity: 0.7,
      transparent: true,
    },
    metadata: {},
  });

  // Nature block with glow - lava glows intensely
  blocks.push({
    blockId: "block_lava",
    name: "Lava",
    description: "Hot glowing lava block",
    cells: [{ x: 0, z: 0 }],
    color: "#ff4500",
    height: 1,
    category: "nature",
    sortOrder: sortOrder++,
    isActive: true,
    material: {
      metalness: 0,
      roughness: 0.4,
      emissive: "#ff4500",
      emissiveIntensity: 3.0,
    },
    metadata: {},
  });

  // === INDUSTRIAL BLOCKS ===
  const industrialBlocks = [
    { id: "brick", name: "Brick", hex: "#cb4154", roughness: 0.85 },
    { id: "concrete", name: "Concrete", hex: "#95a5a6", roughness: 0.8 },
    { id: "marble", name: "Marble", hex: "#f5f5f5", roughness: 0.15, metalness: 0.2 },
    { id: "obsidian", name: "Obsidian", hex: "#1a1a2e", roughness: 0.02, metalness: 0.6 },
  ];

  for (const block of industrialBlocks) {
    blocks.push({
      blockId: `block_${block.id}`,
      name: block.name,
      description: `${block.name} building block`,
      cells: [{ x: 0, z: 0 }],
      color: block.hex,
      height: 1,
      category: "industrial",
      sortOrder: sortOrder++,
      isActive: true,
      material: {
        metalness: block.metalness || 0,
        roughness: block.roughness,
      },
      metadata: {},
    });
  }

  // === PRECIOUS/METAL MATERIALS ===
  // Polished metals - very high metalness, very low roughness for mirror-like reflections
  const preciousBlocks = [
    { id: "gold", name: "Gold", hex: "#ffd700", metalness: 1.0, roughness: 0.1 },
    { id: "silver", name: "Silver", hex: "#e8e8e8", metalness: 1.0, roughness: 0.02 },
    { id: "copper", name: "Copper", hex: "#b87333", metalness: 1.0, roughness: 0.1 },
    { id: "bronze", name: "Bronze", hex: "#cd7f32", metalness: 1.0, roughness: 0.15 },
  ];

  for (const block of preciousBlocks) {
    blocks.push({
      blockId: `block_${block.id}`,
      name: block.name,
      description: `Shiny ${block.name.toLowerCase()} block`,
      cells: [{ x: 0, z: 0 }],
      color: block.hex,
      height: 1,
      category: "materials",
      sortOrder: sortOrder++,
      isActive: true,
      material: {
        metalness: block.metalness,
        roughness: block.roughness,
      },
      metadata: {},
    });
  }

  // === GEMS (transparent + slight glow) ===
  const gemBlocks = [
    { id: "diamond", name: "Diamond", hex: "#b9f2ff" },
    { id: "emerald", name: "Emerald", hex: "#50c878" },
    { id: "ruby", name: "Ruby", hex: "#e0115f" },
    { id: "sapphire", name: "Sapphire", hex: "#0f52ba" },
  ];

  for (const block of gemBlocks) {
    blocks.push({
      blockId: `block_${block.id}`,
      name: block.name,
      description: `Precious ${block.name.toLowerCase()} block`,
      cells: [{ x: 0, z: 0 }],
      color: block.hex,
      height: 1,
      category: "materials",
      sortOrder: sortOrder++,
      isActive: true,
      material: {
        metalness: 0.3,
        roughness: 0.05,
        opacity: 0.8,
        transparent: true,
      },
      metadata: {},
    });
  }

  // === TECH/NEON BLOCKS (intense glow) ===
  const techBlocks = [
    { id: "neon_blue", name: "Neon Blue", hex: "#00ffff" },
    { id: "neon_pink", name: "Neon Pink", hex: "#ff00ff" },
    { id: "neon_green", name: "Neon Green", hex: "#00ff00" },
  ];

  for (const block of techBlocks) {
    blocks.push({
      blockId: `block_${block.id}`,
      name: block.name,
      description: `Bright ${block.name.toLowerCase()} light`,
      cells: [{ x: 0, z: 0 }],
      color: block.hex,
      height: 1,
      category: "industrial",
      sortOrder: sortOrder++,
      isActive: true,
      material: {
        metalness: 0.0,
        roughness: 0.2,
        emissive: block.hex,
        emissiveIntensity: 3.5,
      },
      metadata: {},
    });
  }

  // Hologram - transparent + glow (enhanced for bloom)
  blocks.push({
    blockId: "block_hologram",
    name: "Hologram",
    description: "Translucent holographic block",
    cells: [{ x: 0, z: 0 }],
    color: "#00ff88",
    height: 1,
    category: "industrial",
    sortOrder: sortOrder++,
    isActive: true,
    material: {
      metalness: 0.6,
      roughness: 0.2,
      opacity: 0.4,
      transparent: true,
      emissive: "#00ff88",
      emissiveIntensity: 2.0,
    },
    metadata: {},
  });

  // Energy - transparent + strong glow (enhanced for bloom)
  blocks.push({
    blockId: "block_energy",
    name: "Energy",
    description: "Pulsing energy block",
    cells: [{ x: 0, z: 0 }],
    color: "#7b68ee",
    height: 1,
    category: "industrial",
    sortOrder: sortOrder++,
    isActive: true,
    material: {
      metalness: 0.4,
      roughness: 0.2,
      opacity: 0.7,
      transparent: true,
      emissive: "#7b68ee",
      emissiveIntensity: 2.5,
    },
    metadata: {},
  });

  return blocks;
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
    await updateBlock(existing.documentId, block);
    return "updated";
  } else {
    await createBlock(block);
    return "created";
  }
}

async function main() {
  console.log("Creating all blocks from scratch...");
  const blocks = generateAllBlocks();
  console.log(`Generated ${blocks.length} blocks`);
  console.log(`Using Strapi URL: ${STRAPI_URL}`);
  console.log("");

  // Group by category for summary
  const categories = {};
  for (const block of blocks) {
    categories[block.category] = (categories[block.category] || 0) + 1;
  }
  console.log("Block counts by category:");
  for (const [cat, count] of Object.entries(categories)) {
    console.log(`  ${cat}: ${count}`);
  }
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
