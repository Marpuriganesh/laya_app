import { describe, it, expect } from "vitest";
import {
  calculatePointDistance,
  calculateMidpoint,
  calculateFocalZoom,
  calculateFitToScreen,
  calculateTwoFingerTransform,
} from "../canvas_transform";

describe("Canvas Viewport Transform Math", () => {
  it("calculates point distance and midpoint accurately", () => {
    const p1 = { x: 100, y: 100 };
    const p2 = { x: 400, y: 500 };

    expect(calculatePointDistance(p1, p2)).toBe(500); // 300-400-500 triangle
    expect(calculateMidpoint(p1, p2)).toEqual({ x: 250, y: 300 });
  });

  it("calculates focal zoom keeping the focal point invariant in canvas coordinates", () => {
    const initialTransform = { scale: 1.0, panX: 50, panY: 50 };
    const focalX = 200;
    const focalY = 300;

    // Canvas coordinate under focal point before zoom:
    // C_x = (200 - 50) / 1.0 = 150
    // C_y = (300 - 50) / 1.0 = 250
    const newTransform = calculateFocalZoom(initialTransform, focalX, focalY, 2.0);
    expect(newTransform.scale).toBe(2.0);

    // Canvas coordinate under focal point after zoom should be identical:
    // C_x_after = (200 - newPanX) / 2.0 = (200 - (-100)) / 2 = 150
    // C_y_after = (300 - newPanY) / 2.0 = (300 - (-200)) / 2 = 250
    const canvasXAfter = (focalX - newTransform.panX) / newTransform.scale;
    const canvasYAfter = (focalY - newTransform.panY) / newTransform.scale;

    expect(canvasXAfter).toBeCloseTo(150);
    expect(canvasYAfter).toBeCloseTo(250);
  });

  it("clamps zoom scale within [minScale, maxScale] boundaries", () => {
    const initialTransform = { scale: 1.0, panX: 0, panY: 0 };
    const zoomedIn = calculateFocalZoom(initialTransform, 100, 100, 50.0, 0.05, 32.0);
    expect(zoomedIn.scale).toBe(32.0);

    const zoomedOut = calculateFocalZoom(initialTransform, 100, 100, 0.001, 0.05, 32.0);
    expect(zoomedOut.scale).toBe(0.05);
  });

  it("calculates fit-to-screen centering the document with margins", () => {
    const containerWidth = 1000;
    const containerHeight = 800;
    const docWidth = 2000;
    const docHeight = 1000;

    // scaleX = (1000 * 0.8) / 2000 = 0.4
    // scaleY = (800 * 0.8) / 1000 = 0.64
    // min is 0.4
    const fit = calculateFitToScreen(containerWidth, containerHeight, docWidth, docHeight, 0.8);
    expect(fit.scale).toBeCloseTo(0.4);

    // Centered pan:
    // panX = (1000 - 2000 * 0.4) / 2 = (1000 - 800) / 2 = 100
    // panY = (800 - 1000 * 0.4) / 2 = (800 - 400) / 2 = 200
    expect(fit.panX).toBeCloseTo(100);
    expect(fit.panY).toBeCloseTo(200);
  });

  it("calculates two-finger pinch-to-zoom and pan transform", () => {
    const initialGesture = {
      initialDistance: 200,
      initialScale: 1.0,
      initialCentroid: { x: 300, y: 300 },
      initialPan: { x: 50, y: 50 },
    };

    // Fingers spread apart from 200px to 400px (2x zoom) and moved +50px in X and Y
    const currentTouch1 = { x: 150 + 50, y: 300 + 50 };
    const currentTouch2 = { x: 550 + 50, y: 300 + 50 };

    const result = calculateTwoFingerTransform(initialGesture, currentTouch1, currentTouch2);
    expect(result.scale).toBeCloseTo(2.0);
    // Centroid moved from (300, 300) to (400, 350)
    // Canvas coordinate under initial centroid was (300 - 50) / 1 = 250, (300 - 50) / 1 = 250
    // At new centroid (400, 350): canvas coord should still be 250: (400 - panX) / 2 = 250 => panX = -100
    // (350 - panY) / 2 = 250 => panY = -150
    expect(result.panX).toBeCloseTo(-100);
    expect(result.panY).toBeCloseTo(-150);
  });
});
