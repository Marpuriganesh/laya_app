/**
 * Brush Stroke Preview
 * Renders an authentic Procreate-style S-curve brush preview thumbnail.
 * Reflects the brush preset's exact diameter, softness/hardness, opacity,
 * tip geometry, and pressure/scattering dynamics along a natural hand-painted S-curve trajectory.
 */

import { useRef, useEffect, type FC } from "react";
import type { BrushPreset } from "@/types/brush";
import { useTheme } from "@/ui/theme/ThemeProvider";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import { globalDrawingEngine } from "@/engine/drawing_engine_instance";

export interface BrushStrokePreviewProps {
  preset: BrushPreset;
  width?: number;
  height?: number;
  className?: string;
}

export const BrushStrokePreview: FC<BrushStrokePreviewProps> = ({
  preset,
  width = 170,
  height = 36,
  className = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const brushSettingsRevision = useDocumentStore((s) => s.brushSettingsRevision);
  const activePresetId = useDocumentStore((s) => s.activePresetId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // If this preset is the active brush, pull live tweaked parameters from drawing engine
    const isLiveActive = preset.presetId === activePresetId;
    const activeBrush = isLiveActive ? globalDrawingEngine.getActiveBrush?.() ?? preset : preset;

    // Extract parameters from preset
    const params = activeBrush.engineParameters;
    let baseSize = 16;
    let softness = 0.45;
    let baseOpacity = 1.0;
    let spacingFraction = 0.08;
    let sizeByPressure = true;
    let opacityByPressure = false;
    let scatterAmp = 0;
    let hasScatter = false;
    let aspectRatio = 1.0;
    let angleRadians = 0;

    if (params && params.engineId === "pixelbrush") {
      baseSize = typeof params.baseSizePx === "number" ? params.baseSizePx : 16;
      softness = typeof params.softness === "number" ? params.softness : 0.45;
      baseOpacity = typeof params.baseOpacity === "number" ? params.baseOpacity : 1.0;
      spacingFraction = typeof params.spacingFraction === "number" ? params.spacingFraction : 0.08;
      sizeByPressure = params.sizeDynamics?.isEnabled ?? true;
      opacityByPressure = params.opacityDynamics?.isEnabled ?? false;
      scatterAmp = typeof params.scatterAmplitude === "number" ? params.scatterAmplitude : 0;
      hasScatter = (params.scatterDynamics && params.scatterDynamics.isEnabled) || scatterAmp > 0.01;

      if (params.brushTip && params.brushTip.tipType === "generated") {
        aspectRatio = typeof params.brushTip.aspectRatio === "number" ? params.brushTip.aspectRatio : 1.0;
        angleRadians = typeof params.brushTip.angleRadians === "number" ? params.brushTip.angleRadians : 0;
      }
    }

    // Scale brush size to comfortably fit inside preview strip
    const previewScale = Math.min(1.0, 22 / Math.max(1, baseSize));
    const effectiveDiameter = Math.max(2.5, Math.min(22, baseSize * previewScale));

    // Pure white in dark mode, pure black in light mode
    const strokeRgb: [number, number, number] = resolvedTheme === "dark" ? [255, 255, 255] : [0, 0, 0];

    // Generate smooth parametric S-curve stroke points with pressure ramp
    const totalDabs = Math.max(40, Math.min(180, Math.round(width / Math.max(1.5, effectiveDiameter * spacingFraction))));
    const dabs: { x: number; y: number; radius: number; alpha: number }[] = [];

    for (let i = 0; i <= totalDabs; i++) {
      const t = i / totalDabs;
      let x = width * (0.08 + 0.84 * t);
      let y = height * 0.5 - Math.sin(2 * Math.PI * t) * (height * 0.22);

      // Stylus pressure curve: starts thin, swells in center, tapers gracefully at tail
      const pressure = Math.pow(Math.sin(Math.PI * t), 0.85) * 0.85 + 0.15;
      const radius = sizeByPressure ? Math.max(0.75, (effectiveDiameter * pressure) * 0.5) : effectiveDiameter * 0.5;
      const alpha = opacityByPressure ? baseOpacity * pressure : baseOpacity;

      // Apply scattering / jitter displacement if active
      if (hasScatter) {
        const maxScatter = Math.max(scatterAmp * effectiveDiameter * 1.5, effectiveDiameter * 0.75);
        const seed = Math.sin(i * 12.9898 + t * 78.233) * 43758.5453;
        const angle = (seed - Math.floor(seed)) * Math.PI * 2;
        const dist = Math.abs(Math.sin(i * 39.34 + t * 11.73)) * maxScatter;
        x += Math.cos(angle) * dist;
        y += Math.sin(angle) * dist;
      }

      dabs.push({ x, y, radius, alpha });
    }

    // Draw dabs with soft radial gradients matching brush softness and aspect ratio
    for (const dab of dabs) {
      const r = dab.radius;
      if (r <= 0) continue;

      ctx.save();
      ctx.translate(dab.x, dab.y);
      if (angleRadians !== 0) ctx.rotate(angleRadians);
      if (aspectRatio < 0.99) ctx.scale(1.0, aspectRatio);

      if (softness <= 0.05) {
        // Hard-edge dab
        ctx.fillStyle = `rgba(${strokeRgb[0]}, ${strokeRgb[1]}, ${strokeRgb[2]}, ${dab.alpha})`;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Soft-edge dab with radial falloff
        const innerRadius = Math.max(0, r * (1.0 - softness));
        const gradient = ctx.createRadialGradient(0, 0, innerRadius, 0, 0, r);
        gradient.addColorStop(0, `rgba(${strokeRgb[0]}, ${strokeRgb[1]}, ${strokeRgb[2]}, ${dab.alpha})`);
        gradient.addColorStop(1, `rgba(${strokeRgb[0]}, ${strokeRgb[1]}, ${strokeRgb[2]}, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    ctx.restore();
  }, [preset, width, height, resolvedTheme, brushSettingsRevision, activePresetId]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: `${width}px`, height: `${height}px` }}
      className={`rounded pointer-events-none select-none ${className}`}
    />
  );
};
