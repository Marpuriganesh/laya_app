---
name: lucide-figcraft
description: Search, retrieve, and insert Lucide vector icons into FigCraft designs using the figcraft MCP server.
---

# Lucide Icons in FigCraft

This skill enables agents to look up, generate, and insert crisp vector Lucide icons directly into active FigCraft canvas documents.

---

## 1. Quick Tooling & Scripts

A dedicated zero-dependency utility script is provided at `scripts/figcraft-lucide.mjs`.

### Available Commands:
```bash
# 1. Search for available icons
node scripts/figcraft-lucide.mjs list <filter>
# Example: node scripts/figcraft-lucide.mjs list cart

# 2. Get SVG path & FigCraft payload for an icon
node scripts/figcraft-lucide.mjs get <icon-name>
# Example: node scripts/figcraft-lucide.mjs get shopping-cart

# 3. Rebuild / update local asset bundle (downloads or syncs from package)
node scripts/figcraft-lucide.mjs build
```

Pre-built assets are located at:
- `src/figcraft/assets/lucide-vectors.js`: Full Lucide node definitions (`export const LucideVectors = ...`).
- `src/figcraft/assets/lucide-paths.json`: Direct mapping of icon name to combined SVG path data `d`.
- `src/figcraft/assets/lucide-vectors.json`: Complete JSON dataset of icon nodes.

---

## 2. Inserting an Icon into FigCraft

To insert an icon into FigCraft, use the `call_mcp_tool` with `ServerName: "figcraft"`.

### Recipe A: Standalone Vector Node
Directly creates a 24x24 vector element on the page or inside a parent frame:

```json
{
  "ServerName": "figcraft",
  "ToolName": "create_node",
  "Arguments": {
    "type": "vector",
    "name": "lucide/shopping-cart",
    "parent": "<parent-frame-id-or-omit-for-current-page>",
    "x": 40,
    "y": 40,
    "width": 24,
    "height": 24,
    "path": "<SVG_PATH_FROM_SCRIPT>",
    "props": {
      "fills": [],
      "stroke": "#1E293B",
      "strokeWeight": 2,
      "strokeAlign": "center"
    }
  }
}
```

### Recipe B: Icon Container (Frame + Child Vector)
For design systems, buttons, and navigation items where an icon needs a fixed boundary:

1. **Create the Icon Frame (24x24 px)**:
```json
{
  "ServerName": "figcraft",
  "ToolName": "create_node",
  "Arguments": {
    "type": "frame",
    "name": "icon/shopping-cart",
    "parent": "<parent-container-id>",
    "x": 16,
    "y": 16,
    "width": 24,
    "height": 24,
    "props": {
      "fills": [],
      "clip": false
    }
  }
}
```

2. **Create the Vector Inside the Frame**:
```json
{
  "ServerName": "figcraft",
  "ToolName": "create_node",
  "Arguments": {
    "type": "vector",
    "name": "vector",
    "parent": "<frame-id-from-step-1>",
    "x": 0,
    "y": 0,
    "width": 24,
    "height": 24,
    "path": "<SVG_PATH_FROM_SCRIPT>",
    "props": {
      "fills": [],
      "stroke": "#000000",
      "strokeWeight": 2,
      "strokeAlign": "center"
    }
  }
}
```

---

## 3. Best Practices for Agents

1. **Stroke Weight**: Standard Lucide icons use `strokeWeight: 2` at 24×24. Scale proportionally if rendering larger sizes.
2. **Transparent Fill**: Always pass `"fills": []` in `props` for vector layers, otherwise FigCraft may apply default solid fills (`#D9D9D9`).
3. **Naming**: Use clear layer names like `lucide/<name>` or `icon/<name>` so the document remains organized.
4. **Verification**: Always run `screenshot` (or `inspect_document`) via `call_mcp_tool` after inserting or positioning layers to verify layout accuracy.
