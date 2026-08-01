// Simple GLB binary parser to extract mesh names
const fs = require('fs');
const buf = fs.readFileSync('arabamodel.glb');

// GLB Header: magic (4), version (4), length (4)
const magic = buf.readUInt32LE(0);
const version = buf.readUInt32LE(4);
const length = buf.readUInt32LE(8);
console.log('GLB Header: magic=0x' + magic.toString(16) + ', version=' + version + ', length=' + length);

let offset = 12;
let jsonChunk = null;

while (offset < buf.length) {
  const chunkLen = buf.readUInt32LE(offset);
  const chunkType = buf.readUInt32LE(offset + 4);
  const chunkData = buf.slice(offset + 8, offset + 8 + chunkLen);
  
  if (chunkType === 0x4E4F534A) { // JSON
    jsonChunk = JSON.parse(chunkData.toString('utf8'));
    console.log('\n=== GLTF JSON ===');
    break;
  }
  offset += 8 + chunkLen;
}

if (!jsonChunk) {
  console.log('No JSON chunk found!');
  process.exit(1);
}

// Print meshes
console.log('\nMeshes:');
for (const mesh of jsonChunk.meshes || []) {
  console.log(`  Mesh: "${mesh.name || '(unnamed)'}"`);
  for (const prim of mesh.primitives || []) {
    const matIndex = prim.material;
    const matName = jsonChunk.materials && jsonChunk.materials[matIndex] ? jsonChunk.materials[matIndex].name : '(no material)';
    console.log(`    Primitive: material="${matName}", attributes=${Object.keys(prim.attributes).join(', ')}`);
  }
}

// Print nodes
console.log('\nNodes:');
function printNode(nodeIndex, depth) {
  const node = jsonChunk.nodes[nodeIndex];
  if (!node) return;
  const indent = '  '.repeat(depth);
  console.log(`${indent}Node[${nodeIndex}]: "${node.name || '(unnamed)'}" [mesh=${node.mesh !== undefined ? jsonChunk.meshes[node.mesh].name : '-'}]`);
  if (node.children) {
    node.children.forEach(c => printNode(c, depth + 1));
  }
}

if (jsonChunk.scenes && jsonChunk.scenes[0]) {
  console.log('\nScene 0 nodes:');
  for (const nodeIndex of jsonChunk.scenes[0].nodes || []) {
    printNode(nodeIndex, 1);
  }
}

// Print materials
console.log('\nMaterials:');
for (let i = 0; i < (jsonChunk.materials || []).length; i++) {
  const mat = jsonChunk.materials[i];
  console.log(`  [${i}] "${mat.name}"`);
}

// Check for extension KHR_materials_variants (for multi-material parts)
console.log('\nExtensions used:', JSON.stringify(jsonChunk.extensionsUsed || []));
console.log('Extensions required:', JSON.stringify(jsonChunk.extensionsRequired || []));
