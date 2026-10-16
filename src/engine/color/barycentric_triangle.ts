/**
 * Barycentric Triangle Mathematics for Color Pickers (Krita / Photoshop geometry)
 * Maps 2D canvas coordinates (x, y) <-> (Saturation, Value) with perimeter clamping.
 * 1:1 Translatable to C++ / Rust.
 */

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface TriangleVertices {
  readonly hueVertex: Point2D;   // Pure Hue (S=1, V=1)
  readonly whiteVertex: Point2D; // Pure White (S=0, V=1)
  readonly blackVertex: Point2D; // Pure Black (V=0)
}

/**
 * Projects a point P onto a line segment [A, B] and returns the closest point on the segment.
 */
function projectPointOnSegment(p: Point2D, a: Point2D, b: Point2D): Point2D {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const abLengthSq = abX * abX + abY * abY;

  if (abLengthSq === 0) return a;

  // Projection scalar t = ((P - A) . (B - A)) / |B - A|^2
  const apX = p.x - a.x;
  const apY = p.y - a.y;
  const t = Math.max(0, Math.min(1, (apX * abX + apY * abY) / abLengthSq));

  return {
    x: a.x + t * abX,
    y: a.y + t * abY,
  };
}

/**
 * Computes barycentric weights (wHue, wWhite, wBlack) of point P relative to triangle vertices.
 */
export function calculateBarycentricWeights(
  point: Point2D,
  vertices: TriangleVertices
): [number, number, number] {
  const { hueVertex, whiteVertex, blackVertex } = vertices;

  const det =
    (whiteVertex.y - blackVertex.y) * (hueVertex.x - blackVertex.x) +
    (blackVertex.x - whiteVertex.x) * (hueVertex.y - blackVertex.y);

  if (Math.abs(det) < 1e-9) {
    return [1 / 3, 1 / 3, 1 / 3];
  }

  const wHue =
    ((whiteVertex.y - blackVertex.y) * (point.x - blackVertex.x) +
      (blackVertex.x - whiteVertex.x) * (point.y - blackVertex.y)) /
    det;

  const wWhite =
    ((blackVertex.y - hueVertex.y) * (point.x - blackVertex.x) +
      (hueVertex.x - blackVertex.x) * (point.y - blackVertex.y)) /
    det;

  const wBlack = 1 - wHue - wWhite;

  return [wHue, wWhite, wBlack];
}

/**
 * Clamps a point to the inside or perimeter of a triangle.
 */
export function clampPointToTriangle(
  point: Point2D,
  vertices: TriangleVertices
): Point2D {
  const [wHue, wWhite, wBlack] = calculateBarycentricWeights(point, vertices);

  // If already inside or on boundary, return as is
  if (wHue >= 0 && wWhite >= 0 && wBlack >= 0) {
    return point;
  }

  // Otherwise, project onto all 3 edges and find the closest point
  const proj1 = projectPointOnSegment(point, vertices.hueVertex, vertices.whiteVertex);
  const proj2 = projectPointOnSegment(point, vertices.whiteVertex, vertices.blackVertex);
  const proj3 = projectPointOnSegment(point, vertices.blackVertex, vertices.hueVertex);

  const d1 = Math.hypot(point.x - proj1.x, point.y - proj1.y);
  const d2 = Math.hypot(point.x - proj2.x, point.y - proj2.y);
  const d3 = Math.hypot(point.x - proj3.x, point.y - proj3.y);

  if (d1 <= d2 && d1 <= d3) return proj1;
  if (d2 <= d1 && d2 <= d3) return proj2;
  return proj3;
}

/**
 * Converts a 2D canvas point (x, y) to Saturation and Value [0.0..1.0] within the triangle.
 */
export function pointToSaturationValue(
  point: Point2D,
  vertices: TriangleVertices
): [number, number] {
  const clampedPoint = clampPointToTriangle(point, vertices);
  const [wHue, wWhite] = calculateBarycentricWeights(clampedPoint, vertices);

  // Value is total luminance contribution (Hue + White)
  const value = Math.max(0, Math.min(1, wHue + wWhite));

  // Saturation is the ratio of Pure Hue relative to total non-black
  const saturation = value > 1e-6 ? Math.max(0, Math.min(1, wHue / value)) : 0;

  return [saturation, value];
}

/**
 * Converts Saturation and Value [0.0..1.0] to a 2D canvas handle position (x, y).
 */
export function saturationValueToPoint(
  saturation: number,
  value: number,
  vertices: TriangleVertices
): Point2D {
  const s = Math.max(0, Math.min(1, saturation));
  const v = Math.max(0, Math.min(1, value));

  const wHue = s * v;
  const wWhite = v * (1 - s);
  const wBlack = 1 - v;

  return {
    x:
      wHue * vertices.hueVertex.x +
      wWhite * vertices.whiteVertex.x +
      wBlack * vertices.blackVertex.x,
    y:
      wHue * vertices.hueVertex.y +
      wWhite * vertices.whiteVertex.y +
      wBlack * vertices.blackVertex.y,
  };
}
