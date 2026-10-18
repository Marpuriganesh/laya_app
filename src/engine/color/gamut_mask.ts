/**
 * Gamut Mask Mathematics (Krita / James Gurney Artistic Color System)
 *
 * A Gamut Mask constrains the color wheel to a geometric sub-gamut, creating
 * harmonious atmospheric palettes. Outside the mask, colors are disabled.
 *
 * Pure mathematical routines, 1:1 translatable to C++ / Rust.
 */

export type GamutMaskType =
  | "triad"
  | "complementary"
  | "split-complementary"
  | "analogous"
  | "muted-accent";

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface GamutMaskPreset {
  readonly id: GamutMaskType;
  readonly name: string;
  readonly description: string;
  // Polar vertices defined as [normalizedRadius (0..1), angleDegrees (0..360)] at rotation 0°
  readonly polarVertices: readonly (readonly [number, number])[];
}

/**
 * Standard James Gurney / Krita Gamut Mask Presets.
 * Defined in normalized polar coordinates [radius (0..1), angleDeg (0..360)]:
 * - angle 0° points UP (North)
 * - angle 90° points RIGHT (East)
 * - angle 180° points DOWN (South)
 * - angle 270° points LEFT (West)
 */
export const GAMUT_MASK_PRESETS: readonly GamutMaskPreset[] = [
  {
    id: "triad",
    name: "Atmospheric Triad",
    description: "Dominant triad with desaturated neutral mixtures across the center.",
    polarVertices: [
      [0.92, 0],     // Primary dominant hue (North)
      [0.85, 120],   // Secondary hue (Southeast)
      [0.80, 230],   // Tertiary accent hue (Southwest)
    ],
  },
  {
    id: "complementary",
    name: "Complementary Gamut",
    description: "Warm-Cool dual dominant axis with rich neutral transitions.",
    polarVertices: [
      [0.95, 0],     // Dominant pole (North)
      [0.35, 90],    // Narrow waist right
      [0.90, 180],   // Opposite complement pole (South)
      [0.35, 270],   // Narrow waist left
    ],
  },
  {
    id: "split-complementary",
    name: "Split Complementary",
    description: "High-contrast kite gamut balancing one key hue against two split accents.",
    polarVertices: [
      [0.95, 0],     // Key hue apex (North)
      [0.40, 80],    // Waist right
      [0.88, 150],   // Split accent 1 (Southeast)
      [0.30, 180],   // Inward bridge
      [0.88, 210],   // Split accent 2 (Southwest)
      [0.40, 280],   // Waist left
    ],
  },
  {
    id: "analogous",
    name: "Analogous Sector",
    description: "Clustered mood gamut restricted to a harmonic 90° wedge of adjacent hues.",
    polarVertices: [
      [0.10, 0],     // Near center core
      [0.95, -45],   // Left boundary (Northwest)
      [0.95, -22.5], // Intermediate perimeter arc
      [0.95, 0],     // North apex
      [0.95, 22.5],  // Intermediate perimeter arc
      [0.95, 45],    // Right boundary (Northeast)
    ],
  },
  {
    id: "muted-accent",
    name: "Muted Core + Accent",
    description: "Low-saturation atmospheric core with a single intense color accent.",
    polarVertices: [
      [0.95, 0],     // High-chroma accent tip (North)
      [0.35, 60],    // Blend into core
      [0.35, 120],   // Core boundary
      [0.35, 180],   // Core bottom
      [0.35, 240],   // Core boundary
      [0.35, 300],   // Core left
    ],
  },
];

/**
 * Normalizes an angle in degrees to [0..360).
 */
export function normalizeAngleDeg(angleDeg: number): number {
  return ((angleDeg % 360) + 360) % 360;
}

/**
 * Computes 2D canvas pixel coordinates for a gamut mask preset under a given rotation.
 *
 * @param presetId Gamut mask preset identifier
 * @param rotationDeg Rotation of the mask in degrees (0..360)
 * @param maxRadius Outer radius of the wheel on canvas in pixels
 * @param center Canvas center coordinate (X and Y) in pixels
 * @returns Array of 2D canvas points forming the mask polygon
 */
export function getGamutMaskVertices(
  presetId: GamutMaskType,
  rotationDeg: number,
  maxRadius: number,
  center: number
): readonly Point2D[] {
  const preset = GAMUT_MASK_PRESETS.find((p) => p.id === presetId) || GAMUT_MASK_PRESETS[0];
  const rotRad = (rotationDeg * Math.PI) / 180;

  return preset.polarVertices.map(([normRadius, angleDeg]) => {
    // angle 0 is North (-Y), 90 is East (+X)
    const totalAngleRad = (angleDeg * Math.PI) / 180 + rotRad - Math.PI / 2;
    const r = normRadius * maxRadius;
    return {
      x: center + Math.cos(totalAngleRad) * r,
      y: center + Math.sin(totalAngleRad) * r,
    };
  });
}

/**
 * Determines whether a 2D point lies inside a polygon using ray-casting.
 */
export function isPointInPolygon(point: Point2D, polygon: readonly Point2D[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Projects a point P onto a line segment [A, B] and returns the closest point on the segment.
 */
export function projectPointOnSegment(point: Point2D, a: Point2D, b: Point2D): Point2D {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const abLengthSq = abX * abX + abY * abY;

  if (abLengthSq === 0) return a;

  const apX = point.x - a.x;
  const apY = point.y - a.y;
  const t = Math.max(0, Math.min(1, (apX * abX + apY * abY) / abLengthSq));

  return {
    x: a.x + t * abX,
    y: a.y + t * abY,
  };
}

/**
 * Clamps a 2D point to the interior or boundary of a gamut mask polygon.
 * If the point is inside, it is returned unchanged.
 * If outside, it is projected to the closest point along the perimeter.
 */
export function clampPointToGamutMask(
  point: Point2D,
  polygon: readonly Point2D[]
): Point2D {
  if (polygon.length < 3) return point;
  if (isPointInPolygon(point, polygon)) return point;

  let closestPoint = polygon[0];
  let minDistanceSq = Number.POSITIVE_INFINITY;

  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const proj = projectPointOnSegment(point, polygon[j], polygon[i]);
    const dx = point.x - proj.x;
    const dy = point.y - proj.y;
    const distSq = dx * dx + dy * dy;

    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      closestPoint = proj;
    }
  }

  return closestPoint;
}
