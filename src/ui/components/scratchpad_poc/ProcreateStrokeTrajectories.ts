/**
 * Procreate-style Stroke Trajectories for Live Brush Preview & Scratchpad Testing
 * Provides compact, high-performance stroke trajectories with authentic
 * physical stylus sensor profiles (varying pressure ramps, tilt arcs, velocities, and barrel angles).
 * Uses bounded point counts (~50-65 points) matching Procreate Brush Studio.
 */

import type { StrokePoint } from "@/types/stroke";

export type TrajectoryType =
  "s-curve" | "taper-flick" | "ribbon-wave" | "hatching";

export interface TrajectoryOption {
  readonly id: TrajectoryType;
  readonly label: string;
  readonly description: string;
}

export const TRAJECTORY_OPTIONS: readonly TrajectoryOption[] = [
  {
    id: "s-curve",
    label: "Procreate S-Curve",
    description:
      "Authentic double-bend curve with pressure swell and tapered flick",
  },
  {
    id: "taper-flick",
    label: "Dynamic Whip & Flick",
    description:
      "Fast accelerating stroke testing streamline, tip taper, and falloff",
  },
  {
    id: "ribbon-wave",
    label: "Undulating Ribbon",
    description:
      "Flowing horizontal wave showcasing tip rotation, aspect ratio, and grain",
  },
  {
    id: "hatching",
    label: "Pencil Hatching",
    description:
      "Series of angled parallel strokes testing textural buildup and jitter",
  },
];

/**
 * Generates the classic Procreate Brush Studio S-Curve stroke.
 * Compact ~60 points for sub-millisecond real-time slider evaluation.
 */
export function generateProcreateSCurve(
  width: number,
  height: number,
  steps = 60,
): StrokePoint[] {
  const points: StrokePoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    // Organic S-curve path through canvas center
    const x = width * (0.22 + 0.56 * t + Math.sin(t * Math.PI * 2) * 0.16);
    const y = height * (0.16 + 0.68 * t);

    // Dynamic stylus pressure ramp: starts delicate, swells in center, tapers gracefully
    const pressure = Math.pow(Math.sin(t * Math.PI), 0.75) * 0.88 + 0.12;

    // Gradual tilt change simulating hand rotation
    const tiltX = Math.sin(t * Math.PI) * 35; // -35 to +35 degrees
    const tiltY = Math.cos(t * Math.PI * 2) * 20; // -20 to +20 degrees

    const speed = 400 + Math.sin(t * Math.PI) * 850;
    const timeMs = i * 16.66;

    points.push({
      canvasX: x,
      canvasY: y,
      pressure,
      tiltX,
      tiltY,
      rotation: t * 180,
      speed,
      timeMs,
    });
  }

  return points;
}

/**
 * Generates a fast accelerating whip & flick stroke.
 */
export function generateTaperFlick(
  width: number,
  height: number,
  steps = 48,
): StrokePoint[] {
  const points: StrokePoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    // Accelerating curved flick
    const easeT = Math.pow(t, 1.4);
    const x = width * (0.15 + 0.7 * easeT);
    const y =
      height *
      (0.65 -
        0.45 * Math.sin(t * Math.PI * 0.85) +
        (t * 0.1 * height) / height);

    // Initial heavy pressure tapering down sharply at the end
    let pressure = 0.95;
    if (t < 0.15) {
      pressure = 0.3 + (t / 0.15) * 0.65;
    } else if (t > 0.5) {
      const taperT = (t - 0.5) / 0.5;
      pressure = 0.95 * Math.pow(1 - taperT, 1.8) + 0.03;
    }

    const tiltX = 15 + t * 25;
    const tiltY = 10;
    const speed = 300 + Math.pow(t, 2) * 1600;

    points.push({
      canvasX: x,
      canvasY: y,
      pressure: Math.max(0.02, Math.min(1.0, pressure)),
      tiltX,
      tiltY,
      rotation: t * 90,
      speed,
      timeMs: i * 14.0,
    });
  }

  return points;
}

/**
 * Generates an undulating horizontal wave to test tip angle, aspect ratio, and grain alignment.
 */
export function generateRibbonWave(
  width: number,
  height: number,
  steps = 64,
): StrokePoint[] {
  const points: StrokePoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    const x = width * (0.12 + 0.76 * t);
    const y = height * 0.5 + Math.sin(t * Math.PI * 4) * (height * 0.2);

    // Gentle pulsing pressure across wave peaks
    const pressure = 0.5 + Math.sin(t * Math.PI * 4) * 0.35;
    const tiltX = Math.cos(t * Math.PI * 4) * 30;
    const tiltY = 15;
    const speed = 600;

    points.push({
      canvasX: x,
      canvasY: y,
      pressure: Math.max(0.05, Math.min(1.0, pressure)),
      tiltX,
      tiltY,
      rotation: (t * 360) % 360,
      speed,
      timeMs: i * 16.66,
    });
  }

  return points;
}

/**
 * Returns stroke points for the requested trajectory type.
 */
export function getTrajectoryPoints(
  type: TrajectoryType,
  width: number,
  height: number,
): StrokePoint[][] {
  switch (type) {
    case "taper-flick":
      return [generateTaperFlick(width, height)];
    case "ribbon-wave":
      return [generateRibbonWave(width, height)];
    case "hatching": {
      // 3 parallel strokes at 45 degree angle
      const strokeList: StrokePoint[][] = [];
      const lines = 4;
      for (let l = 0; l < lines; l++) {
        const linePts: StrokePoint[] = [];
        const xOffset = width * (0.25 + l * 0.15);
        const steps = 28;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = xOffset + (t - 0.5) * (width * 0.2);
          const y = height * (0.25 + t * 0.5);
          const pressure = Math.sin(t * Math.PI) * 0.8 + 0.15;
          linePts.push({
            canvasX: x,
            canvasY: y,
            pressure,
            tiltX: 20,
            tiltY: 10,
            rotation: 45,
            speed: 800,
            timeMs: i * 12.0,
          });
        }
        strokeList.push(linePts);
      }
      return strokeList;
    }
    case "s-curve":
    default:
      return [generateProcreateSCurve(width, height)];
  }
}
