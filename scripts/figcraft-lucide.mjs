#!/usr/bin/env node

/**
 * figcraft-lucide.mjs
 * 
 * Tooling to extract, download, and convert Lucide icons into FigCraft vector nodes.
 * Works both offline (from local `lucide-react`) and online (from CDN/UNPKG).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/lucide-static/icon-nodes.json',
  'https://unpkg.com/lucide-static/icon-nodes.json'
];

const LOCAL_LUCIDE_ICONS_DIR = path.join(ROOT_DIR, 'node_modules/lucide-react/dist/esm/icons');
const ASSETS_DIR = path.join(ROOT_DIR, 'src/figcraft/assets');

/**
 * Convert any SVG primitive tag + attributes to an SVG path data `d` string.
 */
export function nodeToSvgPath(tag, attrs) {
  if (!attrs) return '';

  if (tag === 'path') {
    let d = attrs.d || '';
    if (d.startsWith('m')) {
      // In SVG: "m x y dx dy" treats coordinates after the initial pair as relative linetos ('l').
      // When capitalizing to absolute 'M', an explicit 'l' must be inserted before subsequent coordinate pairs.
      d = d.replace(/^m\s*([+-]?\d*\.?\d+(?:e[+-]?\d+)?)[,\s]+([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s*(?=[+-]?\d)/i, 'M$1 $2 l ');
      if (d.startsWith('m')) {
        d = 'M' + d.slice(1);
      }
    }
    return d;
  }

  if (tag === 'line') {
    return `M ${attrs.x1} ${attrs.y1} L ${attrs.x2} ${attrs.y2}`;
  }

  if (tag === 'polyline' || tag === 'polygon') {
    const raw = attrs.points || '';
    const pts = raw.trim().split(/[\s,]+/);
    if (pts.length < 2) return '';
    let d = `M ${pts[0]} ${pts[1]}`;
    for (let i = 2; i < pts.length; i += 2) {
      if (pts[i] !== undefined && pts[i + 1] !== undefined) {
        d += ` L ${pts[i]} ${pts[i + 1]}`;
      }
    }
    if (tag === 'polygon') d += ' Z';
    return d;
  }

  if (tag === 'circle') {
    const cx = parseFloat(attrs.cx || 0);
    const cy = parseFloat(attrs.cy || 0);
    const r = parseFloat(attrs.r || 0);
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy}`;
  }

  if (tag === 'ellipse') {
    const cx = parseFloat(attrs.cx || 0);
    const cy = parseFloat(attrs.cy || 0);
    const rx = parseFloat(attrs.rx || 0);
    const ry = parseFloat(attrs.ry || 0);
    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`;
  }

  if (tag === 'rect') {
    const x = parseFloat(attrs.x || 0);
    const y = parseFloat(attrs.y || 0);
    const w = parseFloat(attrs.width || 0);
    const h = parseFloat(attrs.height || 0);
    const rx = parseFloat(attrs.rx || 0);
    const ry = parseFloat(attrs.ry || attrs.rx || 0);

    if (rx <= 0 && ry <= 0) {
      return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
    }

    return `M ${x + rx} ${y} H ${x + w - rx} A ${rx} ${ry} 0 0 1 ${x + w} ${y + ry} V ${y + h - ry} A ${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} H ${x + rx} A ${rx} ${ry} 0 0 1 ${x} ${y + h - ry} V ${y + ry} A ${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`;
  }

  return '';
}

/**
 * Combine all nodes of a Lucide icon into a single SVG path string.
 */
export function lucideNodesToCombinedPath(nodes) {
  if (!Array.isArray(nodes)) return '';
  return nodes
    .map(([tag, attrs]) => nodeToSvgPath(tag, attrs))
    .filter(Boolean)
    .join(' ');
}

/**
 * Load icons from local installed `lucide-react` package.
 */
export function loadFromLocalPackage() {
  if (!fs.existsSync(LOCAL_LUCIDE_ICONS_DIR)) {
    return null;
  }

  const files = fs.readdirSync(LOCAL_LUCIDE_ICONS_DIR).filter(f => f.endsWith('.mjs'));
  const icons = {};

  for (const file of files) {
    const iconName = file.replace(/\.mjs$/, '');
    const content = fs.readFileSync(path.join(LOCAL_LUCIDE_ICONS_DIR, file), 'utf8');
    const match = content.match(/node:\s*(\[[\s\S]*?\])\s*};/);
    if (match) {
      try {
        // eslint-disable-next-line no-eval
        const parsedNodes = eval(match[1]);
        icons[iconName] = parsedNodes;
      } catch {
        // Ignore parsing errors for edge cases
      }
    }
  }

  return icons;
}

/**
 * Fetch icons from remote CDN endpoints.
 */
export async function fetchFromRemote() {
  for (const url of CDN_URLS) {
    try {
      console.log(`Attempting to fetch Lucide icons from: ${url}`);
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        console.log(`Successfully fetched ${Object.keys(data).length} icons from CDN.`);
        return data;
      }
    } catch {
      // Continue to next URL
    }
  }
  return null;
}

/**
 * Obtain icons using either remote fetch or local package fallback.
 */
export async function getIconDataset() {
  // First try remote if network is available
  try {
    const remoteData = await fetchFromRemote();
    if (remoteData && Object.keys(remoteData).length > 0) {
      return { data: remoteData, source: 'remote-cdn' };
    }
  } catch {}

  // Fallback to local installed package
  console.log('Falling back to local node_modules/lucide-react dataset...');
  const localData = loadFromLocalPackage();
  if (localData && Object.keys(localData).length > 0) {
    return { data: localData, source: 'local-lucide-react' };
  }

  throw new Error('Unable to obtain Lucide icon dataset from remote CDN or local node_modules.');
}

/**
 * Build and save asset bundles.
 */
export async function buildAssets() {
  const { data, source } = await getIconDataset();
  const iconNames = Object.keys(data).sort();
  console.log(`Processing ${iconNames.length} icons (source: ${source})...`);

  // Compute combined SVG paths for all icons
  const pathMap = {};
  for (const name of iconNames) {
    pathMap[name] = lucideNodesToCombinedPath(data[name]);
  }

  // Ensure assets directory exists
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  // 1. Save ./src/figcraft/assets/lucide-vectors.js
  const jsContent = `/**
 * Pre-bundled Lucide icon structural node data for FigCraft.
 * Total icons: ${iconNames.length}
 * Generated: ${new Date().toISOString()}
 */
export const LucideVectors = ${JSON.stringify(data, null, 2)};
`;
  const jsPath = path.join(ASSETS_DIR, 'lucide-vectors.js');
  fs.writeFileSync(jsPath, jsContent, 'utf8');

  // 2. Save ./src/figcraft/assets/lucide-vectors.json
  const jsonPath = path.join(ASSETS_DIR, 'lucide-vectors.json');
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');

  // 3. Save ./src/figcraft/assets/lucide-paths.json (high-speed lookup for FigCraft vectors)
  const pathsJsonPath = path.join(ASSETS_DIR, 'lucide-paths.json');
  fs.writeFileSync(pathsJsonPath, JSON.stringify(pathMap, null, 2), 'utf8');

  console.log(`Saved ${iconNames.length} icons to:`);
  console.log(` - ${jsPath}`);
  console.log(` - ${jsonPath}`);
  console.log(` - ${pathsJsonPath}`);
}

/**
 * Retrieve icon information and FigCraft payload.
 */
export function getIconInfo(iconName, options = {}) {
  const pathsJsonPath = path.join(ASSETS_DIR, 'lucide-paths.json');
  const jsonPath = path.join(ASSETS_DIR, 'lucide-vectors.json');

  let paths = {};
  let vectors = {};

  if (fs.existsSync(pathsJsonPath) && fs.existsSync(jsonPath)) {
    paths = JSON.parse(fs.readFileSync(pathsJsonPath, 'utf8'));
    vectors = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } else {
    // If assets not built yet, extract on the fly
    const local = loadFromLocalPackage();
    if (local && local[iconName]) {
      vectors[iconName] = local[iconName];
      paths[iconName] = lucideNodesToCombinedPath(local[iconName]);
    }
  }

  const normalized = iconName.toLowerCase().trim();
  const nodes = vectors[normalized];
  const svgPath = paths[normalized];

  if (!nodes || !svgPath) {
    return null;
  }

  const {
    x = 0,
    y = 0,
    size = 24,
    stroke = '#000000',
    strokeWeight = 2,
    parent = null
  } = options;

  return {
    name: normalized,
    size: 24,
    nodes,
    path: svgPath,
    figcraft: {
      vectorNodePayload: {
        type: 'vector',
        name: `lucide/${normalized}`,
        x,
        y,
        width: size,
        height: size,
        path: svgPath,
        parent: parent || undefined,
        props: {
          fills: [],
          stroke,
          strokeWeight,
          strokeAlign: 'center'
        }
      },
      frameContainerPayload: {
        type: 'frame',
        name: `icon/${normalized}`,
        x,
        y,
        width: size,
        height: size,
        parent: parent || undefined,
        props: {
          fills: [],
          clip: false
        }
      }
    }
  };
}

/**
 * List icons matching an optional search term.
 */
export function listIcons(filter = '') {
  let iconNames = [];
  const pathsJsonPath = path.join(ASSETS_DIR, 'lucide-paths.json');

  if (fs.existsSync(pathsJsonPath)) {
    const paths = JSON.parse(fs.readFileSync(pathsJsonPath, 'utf8'));
    iconNames = Object.keys(paths);
  } else {
    const local = loadFromLocalPackage();
    if (local) iconNames = Object.keys(local);
  }

  const query = filter.toLowerCase().trim();
  const matches = query ? iconNames.filter(name => name.includes(query)) : iconNames;
  return matches;
}

// CLI Execution handler
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'build':
    case 'fetch':
    case 'generate':
      await buildAssets();
      break;

    case 'list': {
      const term = args[1] || '';
      const list = listIcons(term);
      console.log(`Found ${list.length} icons matching "${term}":`);
      console.log(list.slice(0, 50).join(', '));
      if (list.length > 50) {
        console.log(`... and ${list.length - 50} more.`);
      }
      break;
    }

    case 'get': {
      const name = args[1];
      if (!name) {
        console.error('Usage: node scripts/figcraft-lucide.mjs get <icon-name>');
        process.exit(1);
      }
      const info = getIconInfo(name);
      if (!info) {
        console.error(`Icon "${name}" not found.`);
        process.exit(1);
      }
      console.log(JSON.stringify(info, null, 2));
      break;
    }

    default:
      console.log(`
FigCraft Lucide Icon Utility

Usage:
  node scripts/figcraft-lucide.mjs build          # Fetch/extract and generate all asset files
  node scripts/figcraft-lucide.mjs list [filter]  # Search available icons
  node scripts/figcraft-lucide.mjs get <name>     # Get SVG path and FigCraft payloads for an icon
`);
      break;
  }
}

if (process.argv[1] && process.argv[1].endsWith('figcraft-lucide.mjs')) {
  main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}
