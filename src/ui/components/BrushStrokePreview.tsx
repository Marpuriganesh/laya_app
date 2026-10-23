/**
 * Brush Stroke Preview
 * Renders an authentic Procreate-style S-curve brush preview thumbnail.
 * Reflects the brush preset's exact diameter, softness/hardness, opacity,
 * and pressure dynamics along a natural hand-painted S-curve trajectory.
 */

import { useRef, useEffect, type FC } from "react";
import type { BrushPreset } from "@/types/brush";
import { useTheme } from "@/ui/theme/ThemeProvider";

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

    // Extract parameters from preset
    const params = preset.engineParameters;
    let baseSize = 16;
    let softness = 0.45;
    let baseOpacity = 1.0;
    let spacingFraction = 0.08;
    let sizeByPressure = true;
    let opacityByPressure = false;

    if (params && params.engineId === "pixelbrush") {
      baseSize = typeof params.baseSizePx === "number" ? params.baseSizePx : 16;
      softness = typeof params.softness === "number" ? params.softness : 0.45;
      baseOpacity = typeof params.baseOpacity === "number" ? params.baseOpacity : 1.0;
      spacingFraction = typeof params.spacingFraction === "number" ? params.spacingFraction : 0.08;
      sizeByPressure = params.sizeDynamics?.isEnabled ?? true;
      opacityByPressure = params.opacityDynamics?.isEnabled ?? false;
    }

    // Scale brush size to comfortably fit inside the 36px preview strip
    const previewScale = Math.min(1.0, 22 / Math.max(1, baseSize));
    const effectiveDiameter = Math.max(2.5, Math.min(22, baseSize * previewScale));

    // Pure white in dark mode, pure black in light mode (independent of selected activeColor)
    const strokeRgb: [number, number, number] = resolvedTheme === "dark" ? [255, 255, 255] : [0, 0, 0];

    // Generate smooth parametric S-curve stroke points with pressure ramp
    // S-curve: x(t) = w * (0.08 + 0.84 * t)
    //          y(t) = h/2 - sin(2 * PI * t) * (h * 0.22)
    // Pressure: p(t) = sin(PI * t)^0.85 * 0.85 + 0.15
    const totalDabs = Math.max(40, Math.min(180, Math.round(width / Math.max(1.5, effectiveDiameter * spacingFraction))));
    const dabs: { x: number; y: number; radius: number; alpha: number }[] = [];

    for (let i = 0; i <= totalDabs; i++) {
      const t = i / totalDabs;
      const x = width * (0.08 + 0.84 * t);
      const y = height * 0.5 - Math.sin(2 * Math.PI * t) * (height * 0.22);

      // Stylus pressure curve: starts thin, swells in center, tapers gracefully at tail
      const pressure = Math.pow(Math.sin(Math.PI * t), 0.85) * 0.85 + 0.15;
      const radius = sizeByPressure ? Math.max(0.75, (effectiveDiameter * pressure) * 0.5) : effectiveDiameter * 0.5;
      const alpha = opacityByPressure ? baseOpacity * pressure : baseOpacity;

      dabs.push({ x, y, radius, alpha });
    }

    // Draw dabs with soft radial gradients matching brush softness
    for (const dab of dabs) {
      const r = dab.radius;
      if (r <= 0) continue;

      if (softness <= 0.05) {
        // Hard-edge dab
        ctx.fillStyle = `rgba(${strokeRgb[0]}, ${strokeRgb[1]}, ${strokeRgb[2]}, ${dab.alpha})`;
        ctx.beginPath();
        ctx.arc(dab.x, dab.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Soft-edge dab with radial falloff
        const innerRadius = Math.max(0, r * (1.0 - softness));
        const gradient = ctx.createRadialGradient(dab.x, dab.y, innerRadius, dab.x, dab.y, r);
        gradient.addColorStop(0, `rgba(${strokeRgb[0]}, ${strokeRgb[1]}, ${strokeRgb[2]}, ${dab.alpha})`);
        gradient.addColorStop(1, `rgba(${strokeRgb[0]}, ${strokeRgb[1]}, ${strokeRgb[2]}, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(dab.x, dab.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }, [preset, width, height, resolvedTheme]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: `${width}px`, height: `${height}px` }}
      className={`rounded pointer-events-none select-none ${className}`}
    />
  );
};
