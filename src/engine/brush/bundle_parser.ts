/**
 * Krita Resource Bundle (.bundle) Parser
 * Deserializes standard Krita brush resource bundles (.bundle = ZIP archive containing
 * meta.xml, paintoppresets/*.kpp, brushes/*, patterns/*).
 * 100% pure TypeScript, zero npm dependencies, runs in browser and headless Node tests.
 */

import type { BrushPreset } from "../../types/brush";
import { parseKritaPreset } from "./kpp_parser";
import { readZipArchive } from "./zip_reader";

export interface KritaBundleMetadata {
  readonly bundleName: string;
  readonly author: string;
  readonly description: string;
  readonly version: string;
}

export interface ParsedKritaBundle {
  readonly metadata: KritaBundleMetadata;
  readonly presets: readonly BrushPreset[];
  readonly warnings: readonly string[];
}

/**
 * Extracts inner text content of an XML tag (case-insensitive, handles namespaces like <dc:title>).
 */
function extractTagContent(xml: string, tagNames: string[]): string {
  for (const tag of tagNames) {
    const regex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${tag}>`, "i");
    const match = xml.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return "";
}

/**
 * Parses bundle metadata from meta.xml content.
 */
export function parseBundleMetadata(metaXml: string, fallbackName = "Krita Bundle"): KritaBundleMetadata {
  const bundleName =
    extractTagContent(metaXml, ["name", "title", "bundleName", "PackageName"]) ||
    fallbackName;

  const author =
    extractTagContent(metaXml, ["author", "creator", "artist", "user"]) || "Unknown Author";

  const description =
    extractTagContent(metaXml, ["description", "comment", "abstract"]) || "";

  const version =
    extractTagContent(metaXml, ["version", "revision"]) || "1.0";

  return {
    bundleName,
    author,
    description,
    version,
  };
}

/**
 * Filters out macOS metadata artifacts and temporary files.
 */
function isUserContentEntry(filename: string): boolean {
  if (filename.startsWith("__MACOSX/") || filename.includes("/__MACOSX/")) {
    return false;
  }
  const baseName = filename.split("/").pop() || "";
  if (baseName.startsWith("._") || baseName === ".DS_Store") {
    return false;
  }
  return true;
}

/**
 * Primary deserializer: extracts and parses all brush presets from a Krita .bundle file buffer.
 *
 * @param bundleBuffer ArrayBuffer or Uint8Array representing the .bundle ZIP archive
 * @param fallbackName Name to use if meta.xml is absent (e.g. from file name)
 * @returns Promise resolving to ParsedKritaBundle with all presets ready for DrawingAppEngine
 */
export async function parseKritaBundle(
  bundleBuffer: ArrayBuffer | Uint8Array,
  fallbackName = "Krita Bundle"
): Promise<ParsedKritaBundle> {
  const archive = await readZipArchive(bundleBuffer);
  const warnings: string[] = [];

  // 1. Extract metadata from meta.xml if available
  let metadata: KritaBundleMetadata = {
    bundleName: fallbackName,
    author: "Unknown Author",
    description: "",
    version: "1.0",
  };

  const metaEntry = archive.entries.find(
    (e) => isUserContentEntry(e.filename) && (e.filename === "meta.xml" || e.filename.endsWith("/meta.xml"))
  );

  if (metaEntry) {
    try {
      const metaXml = await metaEntry.getText();
      metadata = parseBundleMetadata(metaXml, fallbackName);
    } catch {
      warnings.push("Failed to parse bundle meta.xml metadata.");
    }
  }

  // 2. Discover all .kpp brush presets inside the bundle
  const presetEntries = archive.entries.filter((entry) => {
    if (!isUserContentEntry(entry.filename)) return false;
    const lower = entry.filename.toLowerCase();
    return lower.endsWith(".kpp") && (lower.startsWith("paintoppresets/") || lower.includes("/paintoppresets/"));
  });

  if (presetEntries.length === 0) {
    // If no presets in paintoppresets/, check if any .kpp exist anywhere in the archive
    const anyKppEntries = archive.entries.filter(
      (entry) => isUserContentEntry(entry.filename) && entry.filename.toLowerCase().endsWith(".kpp")
    );
    presetEntries.push(...anyKppEntries);
  }

  // 3. Parse each .kpp preset in parallel
  const parsedPresets: BrushPreset[] = [];

  for (const entry of presetEntries) {
    try {
      const kppBuffer = await entry.getData();
      const rawPreset = await parseKritaPreset(kppBuffer);

      // Attach bundle name and categories to tags
      const tags = [...rawPreset.tags];
      if (!tags.includes(metadata.bundleName)) {
        tags.push(metadata.bundleName);
      }
      if (!tags.includes("Imported")) {
        tags.push("Imported");
      }
      if (!tags.includes("Krita")) {
        tags.push("Krita");
      }

      parsedPresets.push({
        ...rawPreset,
        tags,
      });
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
      warnings.push(`Failed to parse preset '${entry.filename}': ${errorMsg}`);
    }
  }

  return {
    metadata,
    presets: parsedPresets,
    warnings,
  };
}
