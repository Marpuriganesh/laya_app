/**
 * Core Pixel Brush Engine
 * Procedurally stamps anti-aliased Gaussian and circular dabs along stroke paths.
 * Evaluates pressure and sensor dynamics curves and manages uniform dab spacing.
 * 100% pure, side-effect free algorithmic engine.
 */

import type { BlendMode, DirtyRect, IRasterTarget } from "../../types/raster";
import type { PixelBrushParameters } from "../../types/brush";
import type { CubicBezierSegment, StrokePoint } from "../../types/stroke";
import { clampScalar, evaluateDynamicsCurve } from "../math/dynamics_curve";
import { DabSpacingCalculator, type InterpolatedDabPoint } from "../stroke/dab_spacing_calculator";

/**
 * Configuration options for procedural dab stamp generation.
 */
export interface DabStampOptions {
  readonly diameter: number;
  readonly hardness: number; // 0.0 (Gaussian soft) to 1.0 (hard edge)
  readonly colorR: number; // 0 to 255
  readonly colorG: number; // 0 to 255
  readonly colorB: number; // 0 to 255
  readonly colorA: number; // 0.0 to 1.0 (or 0 to 255)
  readonly flow: number; // 0.0 to 1.0
  readonly aspectRatio?: number; // 1.0 = circular; < 1.0 = elliptical
  readonly angleRadians?: number; // tip rotation angle
}

/**
 * Creates default PixelBrushParameters adhering to Krita/Photoshop conventions.
 */
export function createDefaultPixelBrushParameters(
  overrides?: Partial<PixelBrushParameters>
): PixelBrushParameters {
  return {
    engineId: "pixelbrush",
    brushTip: {
      tipType: "generated",
      diameter: 20,
      hardness: 0.8,
      aspectRatio: 1.0,
      angleRadians: 0.0,
    },
    spacingFraction: 0.15,
    baseOpacity: 1.0,
    baseFlow: 1.0,
    baseSizePx: 20,
    softness: 0.0,
    scatterAmplitude: 0.0,
    isAirbrushMode: false,
    sizeDynamics: {
      sensorInput: "pressure",
      curvePoints: [
        { inputValue: 0.0, outputValue: 0.1 },
        { inputValue: 1.0, outputValue: 1.0 },
      ],
      isEnabled: true,
    },
    opacityDynamics: null,
    flowDynamics: null,
    angleDynamics: null,
    scatterDynamics: null,
    ...overrides,
  };
}

/**
 * Generates an RGBA8 dab stamp buffer using procedural circular/Gaussian falloff math.
 *
 * Mathematical falloff formulation:
 * - For Hardness = 1.0: Constant intensity inside radius R, anti-aliased at edge.
 * - For Hardness = 0.0: Pure Gaussian bell curve:
 *     sigma = R / 3.0 (where 3*sigma = R)
 *     Intensity(r) = (exp(-r^2 / (2*sigma^2)) - exp(-4.5)) / (1 - exp(-4.5))
 * - For Hardness in (0, 1): Flat core of radius (R * hardness), transitioning
 *   to Gaussian decay between the core radius and R.
 *
 * @param options Dab stamp configuration
 * @returns Uint8ClampedArray of size (D * D * 4) with RGBA8 pixels
 */
export function generateCircularDabStamp(options: DabStampOptions): Uint8ClampedArray {
  const dabDimension = Math.max(1, Math.round(options.diameter));
  const dabRadius = dabDimension * 0.5;

  const stampBuffer = new Uint8ClampedArray(dabDimension * dabDimension * 4);
  const centerX = (dabDimension - 1) * 0.5;
  const centerY = (dabDimension - 1) * 0.5;

  const clampedHardness = clampScalar(options.hardness, 0.0, 1.0);
  const normalizedColorAlpha =
    options.colorA > 1.0 ? clampScalar(options.colorA / 255, 0.0, 1.0) : clampScalar(options.colorA, 0.0, 1.0);
  const normalizedFlow = clampScalar(options.flow, 0.0, 1.0);

  const aspectRatio = Math.max(0.01, options.aspectRatio ?? 1.0);
  const angleRadians = options.angleRadians ?? 0.0;
  const hasTransformation = aspectRatio !== 1.0 || angleRadians !== 0.0;
  const cosAngle = hasTransformation ? Math.cos(-angleRadians) : 1.0;
  const sinAngle = hasTransformation ? Math.sin(-angleRadians) : 0.0;

  // Anti-aliasing boundary band: 1.0 to 1.25 pixels transition at the perimeter.
  // Guarantees sub-pixel anti-aliased stroke edges without jagged cutoffs.
  const aaBandWidth = Math.min(1.25, Math.max(0.75, dabRadius * 0.25));

  // Solid core radius: inside coreRadius, intensity is 1.0.
  // For hardness = 1.0, coreRadius reaches (dabRadius - aaBandWidth).
  // For hardness = 0.0, coreRadius is 0.0 (smooth falloff across the entire radius).
  const coreRadius = Math.max(0.0, (dabRadius - aaBandWidth) * clampedHardness);
  const falloffSpan = Math.max(1e-4, dabRadius - coreRadius);

  // Gaussian edge threshold exp(-4.5) for pure soft mode (hardness = 0)
  const gaussianPerimeterConstant = Math.exp(-4.5);
  const gaussianPerimeterDenominator = 1.0 - gaussianPerimeterConstant;

  for (let pixelY = 0; pixelY < dabDimension; pixelY++) {
    const deltaY = pixelY - centerY;
    const rowOffset = pixelY * dabDimension;

    for (let pixelX = 0; pixelX < dabDimension; pixelX++) {
      const deltaX = pixelX - centerX;

      let distance: number;
      if (hasTransformation) {
        const transformedX = deltaX * cosAngle - deltaY * sinAngle;
        const transformedY = (deltaX * sinAngle + deltaY * cosAngle) / aspectRatio;
        distance = Math.sqrt(transformedX * transformedX + transformedY * transformedY);
      } else {
        distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      }

      if (distance >= dabRadius) {
        continue;
      }

      let maskIntensity: number;
      if (distance <= coreRadius) {
        maskIntensity = 1.0;
      } else {
        // Normalized position within falloff zone: 0.0 at coreRadius, 1.0 at dabRadius
        const normalizedDistance = (distance - coreRadius) / falloffSpan;

        if (clampedHardness === 0.0) {
          // Pure Gaussian bell curve with smooth zero boundary at perimeter
          const gaussianExponent = -(normalizedDistance * normalizedDistance) * 4.5;
          const rawGaussian = Math.exp(gaussianExponent);
          maskIntensity = (rawGaussian - gaussianPerimeterConstant) / gaussianPerimeterDenominator;
        } else {
          // Smooth Hermite cubic curve: 1 - (3*u^2 - 2*u^3)
          // Derivative is 0 at both u = 0 (core exit) and u = 1 (outer boundary)
          maskIntensity = 1.0 - normalizedDistance * normalizedDistance * (3.0 - 2.0 * normalizedDistance);
        }
      }

      const pixelAlphaNormalized = clampScalar(maskIntensity, 0.0, 1.0) * normalizedColorAlpha * normalizedFlow;
      const pixelAlphaByte = Math.round(pixelAlphaNormalized * 255);

      if (pixelAlphaByte > 0) {
        const byteOffset = (rowOffset + pixelX) * 4;
        stampBuffer[byteOffset] = options.colorR;
        stampBuffer[byteOffset + 1] = options.colorG;
        stampBuffer[byteOffset + 2] = options.colorB;
        stampBuffer[byteOffset + 3] = pixelAlphaByte;
      }
    }
  }

  return stampBuffer;
}

export class PixelBrushEngine {
  private rasterTarget: IRasterTarget;
  private parameters: PixelBrushParameters;
  private foregroundColor: [number, number, number, number] = [0, 0, 0, 1.0]; // [R, G, B, A] with A in [0, 1]
  private baseBrushSize: number;
  private baseBrushOpacity: number;
  private blendMode: BlendMode = "normal";
  private readonly spacingCalculator: DabSpacingCalculator;
  private isStrokeActive = false;

  // Cached dab stamp to avoid recomputing procedural pixels when parameters are constant
  private cachedStamp: {
    diameter: number;
    hardness: number;
    colorR: number;
    colorG: number;
    colorB: number;
    colorA: number;
    flow: number;
    aspectRatio: number;
    angleRadians: number;
    pixels: Uint8ClampedArray;
  } | null = null;

  constructor(rasterTarget: IRasterTarget, initialParameters?: PixelBrushParameters) {
    this.rasterTarget = rasterTarget;
    this.parameters = initialParameters ?? createDefaultPixelBrushParameters();
    this.baseBrushSize = this.parameters.baseSizePx;
    this.baseBrushOpacity = this.parameters.baseOpacity;
    this.spacingCalculator = new DabSpacingCalculator();
  }

  // --- Target & State Getters/Setters ---

  public setRasterTarget(target: IRasterTarget): void {
    this.rasterTarget = target;
  }

  public getRasterTarget(): IRasterTarget {
    return this.rasterTarget;
  }

  public setForegroundColor(red: number, green: number, blue: number, alpha = 1.0): void {
    this.foregroundColor = [
      Math.max(0, Math.min(255, Math.round(red))),
      Math.max(0, Math.min(255, Math.round(green))),
      Math.max(0, Math.min(255, Math.round(blue))),
      clampScalar(alpha, 0.0, 1.0),
    ];
  }

  public getForegroundColor(): readonly [number, number, number, number] {
    return this.foregroundColor;
  }

  public setBrushSize(sizePx: number): void {
    this.baseBrushSize = Math.max(1.0, sizePx);
  }

  public getBrushSize(): number {
    return this.baseBrushSize;
  }

  public setBrushOpacity(opacityNormalized: number): void {
    this.baseBrushOpacity = clampScalar(opacityNormalized, 0.0, 1.0);
  }

  public getBrushOpacity(): number {
    return this.baseBrushOpacity;
  }

  public setParameters(parameters: PixelBrushParameters): void {
    this.parameters = parameters;
    this.baseBrushSize = parameters.baseSizePx;
    this.baseBrushOpacity = parameters.baseOpacity;
    this.cachedStamp = null;
  }

  public getParameters(): PixelBrushParameters {
    return this.parameters;
  }

  public setHardness(hardness: number): void {
    if (this.parameters.brushTip.tipType === "generated") {
      this.parameters = {
        ...this.parameters,
        brushTip: {
          ...this.parameters.brushTip,
          hardness: clampScalar(hardness, 0.0, 1.0),
        },
      };
      this.cachedStamp = null;
    }
  }

  public getHardness(): number {
    return this.parameters.brushTip.tipType === "generated" ? this.parameters.brushTip.hardness : 0.8;
  }

  public setSpacingFraction(fraction: number): void {
    this.parameters = {
      ...this.parameters,
      spacingFraction: Math.max(0.01, Math.min(2.0, fraction)),
    };
  }

  public getSpacingFraction(): number {
    return this.parameters.spacingFraction;
  }

  public setFlow(flow: number): void {
    this.parameters = {
      ...this.parameters,
      baseFlow: clampScalar(flow, 0.0, 1.0),
    };
    this.cachedStamp = null;
  }

  public getFlow(): number {
    return this.parameters.baseFlow;
  }

  public setAspectRatio(aspectRatio: number): void {
    if (this.parameters.brushTip.tipType === "generated") {
      this.parameters = {
        ...this.parameters,
        brushTip: {
          ...this.parameters.brushTip,
          aspectRatio: Math.max(0.01, Math.min(1.0, aspectRatio)),
        },
      };
      this.cachedStamp = null;
    }
  }

  public getAspectRatio(): number {
    return this.parameters.brushTip.tipType === "generated" ? this.parameters.brushTip.aspectRatio : 1.0;
  }

  public setAngleRadians(angleRadians: number): void {
    if (this.parameters.brushTip.tipType === "generated") {
      this.parameters = {
        ...this.parameters,
        brushTip: {
          ...this.parameters.brushTip,
          angleRadians,
        },
      };
      this.cachedStamp = null;
    }
  }

  public getAngleRadians(): number {
    return this.parameters.brushTip.tipType === "generated" ? this.parameters.brushTip.angleRadians : 0.0;
  }

  public setSizeDynamicsEnabled(enabled: boolean): void {
    if (this.parameters.sizeDynamics) {
      this.parameters = {
        ...this.parameters,
        sizeDynamics: {
          ...this.parameters.sizeDynamics,
          isEnabled: enabled,
        },
      };
    }
  }

  public setOpacityDynamicsEnabled(enabled: boolean): void {
    if (this.parameters.opacityDynamics) {
      this.parameters = {
        ...this.parameters,
        opacityDynamics: {
          ...this.parameters.opacityDynamics,
          isEnabled: enabled,
        },
      };
    }
  }

  public setBlendMode(blendMode: BlendMode): void {
    this.blendMode = blendMode;
  }

  public getBlendMode(): BlendMode {
    return this.blendMode;
  }

  // --- Stroke Lifecycle & Dab Blitting ---

  /**
   * Begins a new stroke from an initial smoothed StrokePoint.
   * Emits the starting dab stamp at origin and resets spacing distance.
   */
  public beginStroke(point: StrokePoint): DirtyRect[] {
    this.isStrokeActive = true;
    const initialDabs = this.spacingCalculator.beginStroke(point);
    const affectedRegions: DirtyRect[] = [];

    for (const dab of initialDabs) {
      const dirtyRect = this.renderDabAt(dab);
      if (dirtyRect.width > 0 && dirtyRect.height > 0) {
        affectedRegions.push(dirtyRect);
      }
    }

    return affectedRegions;
  }

  /**
   * Extends the active stroke to a new smoothed StrokePoint.
   * Calculates dab spacing and blits procedural stamps along the linear segment.
   */
  public paintTo(point: StrokePoint): DirtyRect[] {
    if (!this.isStrokeActive) {
      return this.beginStroke(point);
    }

    const currentDiameter = this.evaluateBrushDiameter(point.pressure);
    const stepDistancePx = Math.max(1.0, currentDiameter * this.parameters.spacingFraction);

    const interpolatedDabs = this.spacingCalculator.processLinearSegment(point, stepDistancePx);
    const affectedRegions: DirtyRect[] = [];

    for (const dab of interpolatedDabs) {
      const dirtyRect = this.renderDabAt(dab);
      if (dirtyRect.width > 0 && dirtyRect.height > 0) {
        affectedRegions.push(dirtyRect);
      }
    }

    return affectedRegions;
  }

  /**
   * Alias for paintTo for engine facade compatibility.
   */
  public extendStroke(point: StrokePoint): DirtyRect[] {
    return this.paintTo(point);
  }

  /**
   * Emits and blits dabs along a smooth Cubic Bézier curve segment.
   */
  public paintBezierSegment(segment: CubicBezierSegment): DirtyRect[] {
    const averagePressure = (segment.startPressure + segment.endPressure) * 0.5;
    const currentDiameter = this.evaluateBrushDiameter(averagePressure);
    const stepDistancePx = Math.max(1.0, currentDiameter * this.parameters.spacingFraction);

    const interpolatedDabs = this.spacingCalculator.processBezierSegment(segment, stepDistancePx);
    const affectedRegions: DirtyRect[] = [];

    for (const dab of interpolatedDabs) {
      const dirtyRect = this.renderDabAt(dab);
      if (dirtyRect.width > 0 && dirtyRect.height > 0) {
        affectedRegions.push(dirtyRect);
      }
    }

    return affectedRegions;
  }

  /**
   * Finalizes the active stroke and resets internal spacing accumulator.
   */
  public endStroke(): void {
    this.spacingCalculator.endStroke();
    this.isStrokeActive = false;
  }

  /**
   * Stamps a single isolated dab directly at specified canvas coordinates.
   */
  public stampDabAt(
    canvasX: number,
    canvasY: number,
    pressure = 1.0,
    tiltX = 0,
    tiltY = 0,
    speed = 0
  ): DirtyRect {
    const dabPoint: InterpolatedDabPoint = {
      canvasX,
      canvasY,
      pressure,
      tiltX,
      tiltY,
      speed,
      timeMs: 0,
    };
    return this.renderDabAt(dabPoint);
  }

  // --- Internal Dynamics & Rendering Helpers ---

  /**
   * Evaluates brush tip diameter after applying sensor dynamics curves.
   */
  public evaluateBrushDiameter(pressure: number): number {
    const sizeScale = evaluateDynamicsCurve(this.parameters.sizeDynamics, pressure, 1.0);
    return Math.max(1.0, this.baseBrushSize * sizeScale);
  }

  /**
   * Evaluates effective opacity after applying sensor dynamics curves.
   */
  public evaluateBrushOpacity(pressure: number): number {
    const opacityScale = evaluateDynamicsCurve(this.parameters.opacityDynamics, pressure, 1.0);
    return clampScalar(this.baseBrushOpacity * opacityScale, 0.0, 1.0);
  }

  /**
   * Evaluates effective flow after applying sensor dynamics curves.
   */
  public evaluateBrushFlow(pressure: number): number {
    const flowScale = evaluateDynamicsCurve(this.parameters.flowDynamics, pressure, 1.0);
    return clampScalar(this.parameters.baseFlow * flowScale, 0.0, 1.0);
  }

  /**
   * Renders a single dab point onto the target raster surface.
   */
  private renderDabAt(dabPoint: InterpolatedDabPoint): DirtyRect {
    const diameter = this.evaluateBrushDiameter(dabPoint.pressure);
    const opacity = this.evaluateBrushOpacity(dabPoint.pressure);
    const flow = this.evaluateBrushFlow(dabPoint.pressure);

    const tipHardness =
      this.parameters.brushTip.tipType === "generated"
        ? this.parameters.brushTip.hardness
        : 0.8;
    const aspectRatio =
      this.parameters.brushTip.tipType === "generated"
        ? this.parameters.brushTip.aspectRatio
        : 1.0;
    const angleRadians =
      this.parameters.brushTip.tipType === "generated"
        ? this.parameters.brushTip.angleRadians
        : 0.0;

    const [colorR, colorG, colorB, baseAlpha] = this.foregroundColor;
    const effectiveColorAlpha = baseAlpha * opacity;

    const roundedDiameter = Math.max(1, Math.round(diameter));

    // Check stamp cache
    let stampPixels: Uint8ClampedArray;
    if (
      this.cachedStamp &&
      this.cachedStamp.diameter === roundedDiameter &&
      this.cachedStamp.hardness === tipHardness &&
      this.cachedStamp.colorR === colorR &&
      this.cachedStamp.colorG === colorG &&
      this.cachedStamp.colorB === colorB &&
      this.cachedStamp.colorA === effectiveColorAlpha &&
      this.cachedStamp.flow === flow &&
      this.cachedStamp.aspectRatio === aspectRatio &&
      this.cachedStamp.angleRadians === angleRadians
    ) {
      stampPixels = this.cachedStamp.pixels;
    } else {
      stampPixels = generateCircularDabStamp({
        diameter: roundedDiameter,
        hardness: tipHardness,
        colorR,
        colorG,
        colorB,
        colorA: effectiveColorAlpha,
        flow,
        aspectRatio,
        angleRadians,
      });

      this.cachedStamp = {
        diameter: roundedDiameter,
        hardness: tipHardness,
        colorR,
        colorG,
        colorB,
        colorA: effectiveColorAlpha,
        flow,
        aspectRatio,
        angleRadians,
        pixels: stampPixels,
      };
    }

    return this.rasterTarget.blitDab(
      stampPixels,
      dabPoint.canvasX,
      dabPoint.canvasY,
      roundedDiameter,
      this.blendMode
    );
  }
}
