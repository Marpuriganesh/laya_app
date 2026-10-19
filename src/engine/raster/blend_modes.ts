/**
 * Raster Blend Modes & Porter-Duff Compositing Math
 * 100% pure, side-effect free algorithmic module.
 * 1:1 translatable to C++, Rust, or WGSL shaders.
 * Compliant with W3C Compositing and Blending Level 1 specifications.
 */

import type { BlendMode } from "../../types/raster";

/**
 * Clamps a numerical value to an integer within the byte range [0, 255].
 */
export function clampByte(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return Math.round(value);
}

/**
 * Calculates the luminosity of an RGB triplet according to standard Rec. 601 coefficients.
 * Formula: Lum = 0.299 * R + 0.587 * G + 0.114 * B (approximated as 0.30 R + 0.59 G + 0.11 B in W3C spec)
 */
export function calculateLuminosity(red: number, green: number, blue: number): number {
  return 0.3 * red + 0.59 * green + 0.11 * blue;
}

/**
 * Calculates the saturation of an RGB triplet.
 * Formula: Sat = max(R, G, B) - min(R, G, B)
 */
export function calculateSaturation(red: number, green: number, blue: number): number {
  return Math.max(red, green, blue) - Math.min(red, green, blue);
}

/**
 * Clips color channels to [0, 255] while preserving luminosity.
 * Defined in W3C Compositing and Blending Section 10.3.3.
 */
export function clipColor(red: number, green: number, blue: number): [number, number, number] {
  const luminosity = calculateLuminosity(red, green, blue);
  const minChannel = Math.min(red, green, blue);
  const maxChannel = Math.max(red, green, blue);

  let outputRed = red;
  let outputGreen = green;
  let outputBlue = blue;

  if (minChannel < 0) {
    const scale = luminosity / (luminosity - minChannel);
    outputRed = luminosity + (outputRed - luminosity) * scale;
    outputGreen = luminosity + (outputGreen - luminosity) * scale;
    outputBlue = luminosity + (outputBlue - luminosity) * scale;
  }

  if (maxChannel > 255) {
    const scale = (255 - luminosity) / (maxChannel - luminosity);
    outputRed = luminosity + (outputRed - luminosity) * scale;
    outputGreen = luminosity + (outputGreen - luminosity) * scale;
    outputBlue = luminosity + (outputBlue - luminosity) * scale;
  }

  return [
    clampByte(outputRed),
    clampByte(outputGreen),
    clampByte(outputBlue),
  ];
}

/**
 * Sets the luminosity of an RGB triplet while preserving hue and saturation.
 */
export function setLuminosity(
  red: number,
  green: number,
  blue: number,
  targetLuminosity: number
): [number, number, number] {
  const delta = targetLuminosity - calculateLuminosity(red, green, blue);
  return clipColor(red + delta, green + delta, blue + delta);
}

/**
 * Sets the saturation of an RGB triplet while preserving hue and luminosity.
 */
export function setSaturation(
  red: number,
  green: number,
  blue: number,
  targetSaturation: number
): [number, number, number] {
  const channels: [number, number, number] = [red, green, blue];
  const sortedIndices = [0, 1, 2].sort((firstIndex, secondIndex) => channels[firstIndex] - channels[secondIndex]);

  const minIndex = sortedIndices[0];
  const midIndex = sortedIndices[1];
  const maxIndex = sortedIndices[2];

  const currentSaturation = channels[maxIndex] - channels[minIndex];
  if (currentSaturation > 1e-4) {
    channels[midIndex] =
      ((channels[midIndex] - channels[minIndex]) * targetSaturation) / currentSaturation;
    channels[maxIndex] = targetSaturation;
  } else {
    channels[midIndex] = 0;
    channels[maxIndex] = 0;
  }
  channels[minIndex] = 0;

  return [channels[0], channels[1], channels[2]];
}

/**
 * Blends a single channel under Soft Light (W3C Pegtop formula).
 */
function blendSoftLightChannel(destination: number, source: number): number {
  const normDest = destination / 255;
  const normSource = source / 255;

  let blendedNormalized: number;
  if (normSource <= 0.5) {
    blendedNormalized = normDest - (1 - 2 * normSource) * normDest * (1 - normDest);
  } else {
    const factorD =
      normDest <= 0.25
        ? ((16 * normDest - 12) * normDest + 4) * normDest
        : Math.sqrt(normDest);
    blendedNormalized = normDest + (2 * normSource - 1) * (factorD - normDest);
  }

  return clampByte(blendedNormalized * 255);
}

/**
 * Evaluates the pure RGB color blend function B(destination, source) for the requested mode.
 * Does NOT incorporate alpha compositing; handles full-intensity color interaction.
 */
export function blendPixelColor(
  destinationRed: number,
  destinationGreen: number,
  destinationBlue: number,
  sourceRed: number,
  sourceGreen: number,
  sourceBlue: number,
  blendMode: BlendMode = "normal"
): [number, number, number] {
  switch (blendMode) {
    case "normal":
    case "erase":
      return [sourceRed, sourceGreen, sourceBlue];

    case "multiply":
      return [
        (destinationRed * sourceRed) / 255,
        (destinationGreen * sourceGreen) / 255,
        (destinationBlue * sourceBlue) / 255,
      ];

    case "screen":
      return [
        255 - ((255 - destinationRed) * (255 - sourceRed)) / 255,
        255 - ((255 - destinationGreen) * (255 - sourceGreen)) / 255,
        255 - ((255 - destinationBlue) * (255 - sourceBlue)) / 255,
      ];

    case "overlay":
      return [
        destinationRed < 128
          ? (2 * destinationRed * sourceRed) / 255
          : 255 - (2 * (255 - destinationRed) * (255 - sourceRed)) / 255,
        destinationGreen < 128
          ? (2 * destinationGreen * sourceGreen) / 255
          : 255 - (2 * (255 - destinationGreen) * (255 - sourceGreen)) / 255,
        destinationBlue < 128
          ? (2 * destinationBlue * sourceBlue) / 255
          : 255 - (2 * (255 - destinationBlue) * (255 - sourceBlue)) / 255,
      ];

    case "darken":
      return [
        Math.min(destinationRed, sourceRed),
        Math.min(destinationGreen, sourceGreen),
        Math.min(destinationBlue, sourceBlue),
      ];

    case "lighten":
      return [
        Math.max(destinationRed, sourceRed),
        Math.max(destinationGreen, sourceGreen),
        Math.max(destinationBlue, sourceBlue),
      ];

    case "colorDodge":
      return [
        sourceRed >= 255 ? 255 : Math.min(255, (destinationRed * 255) / (255 - sourceRed)),
        sourceGreen >= 255 ? 255 : Math.min(255, (destinationGreen * 255) / (255 - sourceGreen)),
        sourceBlue >= 255 ? 255 : Math.min(255, (destinationBlue * 255) / (255 - sourceBlue)),
      ];

    case "colorBurn":
      return [
        sourceRed <= 0 ? 0 : Math.max(0, 255 - ((255 - destinationRed) * 255) / sourceRed),
        sourceGreen <= 0 ? 0 : Math.max(0, 255 - ((255 - destinationGreen) * 255) / sourceGreen),
        sourceBlue <= 0 ? 0 : Math.max(0, 255 - ((255 - destinationBlue) * 255) / sourceBlue),
      ];

    case "hardLight":
      return [
        sourceRed < 128
          ? (2 * destinationRed * sourceRed) / 255
          : 255 - (2 * (255 - destinationRed) * (255 - sourceRed)) / 255,
        sourceGreen < 128
          ? (2 * destinationGreen * sourceGreen) / 255
          : 255 - (2 * (255 - destinationGreen) * (255 - sourceGreen)) / 255,
        sourceBlue < 128
          ? (2 * destinationBlue * sourceBlue) / 255
          : 255 - (2 * (255 - destinationBlue) * (255 - sourceBlue)) / 255,
      ];

    case "softLight":
      return [
        blendSoftLightChannel(destinationRed, sourceRed),
        blendSoftLightChannel(destinationGreen, sourceGreen),
        blendSoftLightChannel(destinationBlue, sourceBlue),
      ];

    case "difference":
      return [
        Math.abs(destinationRed - sourceRed),
        Math.abs(destinationGreen - sourceGreen),
        Math.abs(destinationBlue - sourceBlue),
      ];

    case "exclusion":
      return [
        destinationRed + sourceRed - (2 * destinationRed * sourceRed) / 255,
        destinationGreen + sourceGreen - (2 * destinationGreen * sourceGreen) / 255,
        destinationBlue + sourceBlue - (2 * destinationBlue * sourceBlue) / 255,
      ];

    case "hue": {
      const destSat = calculateSaturation(destinationRed, destinationGreen, destinationBlue);
      const destLum = calculateLuminosity(destinationRed, destinationGreen, destinationBlue);
      const satPreserved = setSaturation(sourceRed, sourceGreen, sourceBlue, destSat);
      return setLuminosity(satPreserved[0], satPreserved[1], satPreserved[2], destLum);
    }

    case "saturation": {
      const srcSat = calculateSaturation(sourceRed, sourceGreen, sourceBlue);
      const destLum = calculateLuminosity(destinationRed, destinationGreen, destinationBlue);
      const satPreserved = setSaturation(destinationRed, destinationGreen, destinationBlue, srcSat);
      return setLuminosity(satPreserved[0], satPreserved[1], satPreserved[2], destLum);
    }

    case "color": {
      const destLum = calculateLuminosity(destinationRed, destinationGreen, destinationBlue);
      return setLuminosity(sourceRed, sourceGreen, sourceBlue, destLum);
    }

    case "luminosity": {
      const srcLum = calculateLuminosity(sourceRed, sourceGreen, sourceBlue);
      return setLuminosity(destinationRed, destinationGreen, destinationBlue, srcLum);
    }

    default:
      return [sourceRed, sourceGreen, sourceBlue];
  }
}

/**
 * Composites a source RGBA pixel over a destination RGBA pixel.
 * Uses standard Porter-Duff 'Source Over Destination' alpha compositing with blend mode support.
 *
 * Formula:
 *  outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha)
 *  outColor = (sourceAlpha * (1 - destAlpha) * sourceColor +
 *              destAlpha * (1 - sourceAlpha) * destColor +
 *              sourceAlpha * destAlpha * Blend(destColor, sourceColor)) / outAlpha
 *
 * @param destinationRed Destination Red in [0, 255]
 * @param destinationGreen Destination Green in [0, 255]
 * @param destinationBlue Destination Blue in [0, 255]
 * @param destinationAlpha Destination Alpha in [0, 255]
 * @param sourceRed Source Red in [0, 255]
 * @param sourceGreen Source Green in [0, 255]
 * @param sourceBlue Source Blue in [0, 255]
 * @param sourceAlpha Source Alpha in [0, 255]
 * @param blendMode Selected blend mode
 * @returns Resulting RGBA tuple in [0, 255]
 */
export function compositePixelOver(
  destinationRed: number,
  destinationGreen: number,
  destinationBlue: number,
  destinationAlpha: number,
  sourceRed: number,
  sourceGreen: number,
  sourceBlue: number,
  sourceAlpha: number,
  blendMode: BlendMode = "normal"
): [number, number, number, number] {
  // If source is fully transparent, destination is unchanged
  if (sourceAlpha <= 0) {
    return [destinationRed, destinationGreen, destinationBlue, destinationAlpha];
  }

  const normalizedSourceAlpha = sourceAlpha / 255;
  const normalizedDestAlpha = destinationAlpha / 255;

  // Erase blend mode: reduces destination alpha without adding source color
  if (blendMode === "erase") {
    const resultingAlphaNormalized = normalizedDestAlpha * (1.0 - normalizedSourceAlpha);
    const resultingAlphaByte = clampByte(resultingAlphaNormalized * 255);
    if (resultingAlphaByte <= 0) {
      return [0, 0, 0, 0];
    }
    return [destinationRed, destinationGreen, destinationBlue, resultingAlphaByte];
  }

  // If destination is completely transparent, result is simply the source pixel
  if (destinationAlpha <= 0) {
    return [sourceRed, sourceGreen, sourceBlue, sourceAlpha];
  }

  // Standard Porter-Duff over operator alpha calculation
  const resultingAlphaNormalized =
    normalizedSourceAlpha + normalizedDestAlpha * (1.0 - normalizedSourceAlpha);

  if (resultingAlphaNormalized <= 1e-6) {
    return [0, 0, 0, 0];
  }

  // Evaluate the underlying color blend function
  const [blendedRed, blendedGreen, blendedBlue] = blendPixelColor(
    destinationRed,
    destinationGreen,
    destinationBlue,
    sourceRed,
    sourceGreen,
    sourceBlue,
    blendMode
  );

  // Weight each component according to non-premultiplied straight alpha compositing
  const sourceWeight = normalizedSourceAlpha * (1.0 - normalizedDestAlpha);
  const destinationWeight = normalizedDestAlpha * (1.0 - normalizedSourceAlpha);
  const blendedWeight = normalizedSourceAlpha * normalizedDestAlpha;

  const outputRed =
    (sourceWeight * sourceRed + destinationWeight * destinationRed + blendedWeight * blendedRed) /
    resultingAlphaNormalized;
  const outputGreen =
    (sourceWeight * sourceGreen + destinationWeight * destinationGreen + blendedWeight * blendedGreen) /
    resultingAlphaNormalized;
  const outputBlue =
    (sourceWeight * sourceBlue + destinationWeight * destinationBlue + blendedWeight * blendedBlue) /
    resultingAlphaNormalized;

  return [
    clampByte(outputRed),
    clampByte(outputGreen),
    clampByte(outputBlue),
    clampByte(resultingAlphaNormalized * 255),
  ];
}
