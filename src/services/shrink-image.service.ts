import type { ResizeFormat, ResizeOptions } from "../types/index.js";

const DEFAULT_QUALITY = 0.92;
const SUPPORTED_FORMATS: ResizeFormat[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

type Canvas2D = HTMLCanvasElement | OffscreenCanvas;
type SourceImage = ImageBitmap | HTMLImageElement;
type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Resize and encode an image Blob to a target size.
 *
 * @params {Blob} input: source image blob
 * @params {ResizeOptions} options: resize configuration
 * @returns {Promise<Blob>}
 */
export async function shrinkImage(
  input: Blob,
  options: ResizeOptions,
): Promise<Blob> {
  const fit = options.fit ?? "cover";
  const outputType = resolveOutputType(options.format, input.type);
  const quality = normalizeQuality(options.quality);

  const image = await loadImage(input);
  try {
    const { width: srcWidth, height: srcHeight } = getImageSize(image);
    const { width: targetWidth, height: targetHeight } = resolveTargetSize(
      options.width,
      options.height,
      srcWidth,
      srcHeight,
    );
    if (targetWidth > srcWidth || targetHeight > srcHeight) {
      throw new Error(
        `Target size ${targetWidth}x${targetHeight} exceeds source ${srcWidth}x${srcHeight}.`,
      );
    }

    const canvas = createCanvas(targetWidth, targetHeight);
    const ctx = get2dContext(canvas);
    if (!ctx) {
      throw new Error("Canvas 2D context is not available.");
    }

    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) {
      ctx.imageSmoothingQuality = "high";
    }

    if (fit === "contain") {
      const bg =
        options.background ??
        (outputType === "image/jpeg" ? "#ffffff" : "transparent");

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      const scale = Math.min(targetWidth / srcWidth, targetHeight / srcHeight);
      const destWidth = Math.round(srcWidth * scale);
      const destHeight = Math.round(srcHeight * scale);
      const dx = Math.round((targetWidth - destWidth) / 2);
      const dy = Math.round((targetHeight - destHeight) / 2);

      ctx.drawImage(
        image,
        0,
        0,
        srcWidth,
        srcHeight,
        dx,
        dy,
        destWidth,
        destHeight,
      );
    } else {
      const { sx, sy, sWidth, sHeight } = getCoverSourceRect(
        srcWidth,
        srcHeight,
        targetWidth,
        targetHeight,
      );
      ctx.drawImage(
        image,
        sx,
        sy,
        sWidth,
        sHeight,
        0,
        0,
        targetWidth,
        targetHeight,
      );
    }

    return await canvasToBlob(canvas, outputType, quality);
  } finally {
    cleanupImage(image);
  }
}

/**
 * Normalize a dimension value and round to an integer.
 *
 * @params {number} value: raw dimension value
 * @params {string} name: dimension label for error messages
 * @returns {number}
 */
function normalizeDimension(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  const normalized = Math.round(value);
  if (normalized <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return normalized;
}

/**
 * Resolve target size based on inputs and source aspect ratio.
 *
 * @params {number | undefined} width: requested width
 * @params {number | undefined} height: requested height
 * @params {number} srcWidth: source image width
 * @params {number} srcHeight: source image height
 * @returns {{ width: number; height: number }}
 */
function resolveTargetSize(
  width: number | undefined,
  height: number | undefined,
  srcWidth: number,
  srcHeight: number,
): { width: number; height: number } {
  if (width === undefined && height === undefined) {
    throw new Error("width or height must be provided.");
  }

  const normalizedWidth =
    width === undefined ? undefined : normalizeDimension(width, "width");
  const normalizedHeight =
    height === undefined ? undefined : normalizeDimension(height, "height");

  if (normalizedWidth !== undefined && normalizedHeight !== undefined) {
    return { width: normalizedWidth, height: normalizedHeight };
  }

  const ratio = srcWidth / srcHeight;
  if (normalizedWidth !== undefined) {
    const computedHeight = Math.max(1, Math.round(normalizedWidth / ratio));
    return { width: normalizedWidth, height: computedHeight };
  }

  const computedWidth = Math.max(1, Math.round(normalizedHeight! * ratio));
  return { width: computedWidth, height: normalizedHeight! };
}

/**
 * Normalize output quality when encoder supports it.
 *
 * @params {number | undefined} quality: requested quality value
 * @returns {number | undefined}
 */
function normalizeQuality(quality?: number): number | undefined {
  if (quality === undefined) {
    return DEFAULT_QUALITY;
  }
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
    throw new Error("quality must be between 0 and 1.");
  }
  return quality;
}

/**
 * Resolve output MIME type from options or input.
 *
 * @params {ResizeFormat | undefined} explicit: explicit output type
 * @params {string} inputType: input blob type
 * @returns {ResizeFormat}
 */
function resolveOutputType(
  explicit: ResizeFormat | undefined,
  inputType: string,
): ResizeFormat {
  if (explicit && SUPPORTED_FORMATS.indexOf(explicit) !== -1) {
    return explicit;
  }
  const normalizedInput = inputType.toLowerCase() as ResizeFormat;
  if (SUPPORTED_FORMATS.indexOf(normalizedInput) !== -1) {
    return normalizedInput;
  }
  return "image/jpeg";
}

/**
 * Compute source rectangle for "cover" crop.
 *
 * @params {number} srcWidth: source width
 * @params {number} srcHeight: source height
 * @params {number} targetWidth: target width
 * @params {number} targetHeight: target height
 * @returns {{ sx: number; sy: number; sWidth: number; sHeight: number }}
 */
function getCoverSourceRect(
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number,
): { sx: number; sy: number; sWidth: number; sHeight: number } {
  const srcRatio = srcWidth / srcHeight;
  const targetRatio = targetWidth / targetHeight;

  if (srcRatio > targetRatio) {
    const sWidth = srcHeight * targetRatio;
    const sx = (srcWidth - sWidth) / 2;
    return { sx, sy: 0, sWidth, sHeight: srcHeight };
  }

  const sHeight = srcWidth / targetRatio;
  const sy = (srcHeight - sHeight) / 2;
  return { sx: 0, sy, sWidth: srcWidth, sHeight };
}

/**
 * Create a 2D canvas instance.
 *
 * @params {number} width: canvas width
 * @params {number} height: canvas height
 * @returns {Canvas2D}
 */
function createCanvas(width: number, height: number): Canvas2D {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document === "undefined") {
    throw new Error("Canvas is not available in this environment.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Get a 2D rendering context from a canvas.
 *
 * @params {Canvas2D} canvas: target canvas
 * @returns {Canvas2DContext | null}
 */
function get2dContext(canvas: Canvas2D): Canvas2DContext | null {
  return canvas.getContext("2d") as Canvas2DContext | null;
}

/**
 * Decode a Blob into a drawable image source.
 *
 * @params {Blob} input: source image blob
 * @returns {Promise<SourceImage>}
 */
async function loadImage(input: Blob): Promise<SourceImage> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(input, { imageOrientation: "from-image" });
  }
  if (typeof Image === "undefined") {
    throw new Error("Image decoding is not available in this environment.");
  }

  const url = URL.createObjectURL(input);
  const image = new Image();
  image.decoding = "async";
  image.src = url;

  try {
    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Failed to load image."));
      });
    }
  } finally {
    URL.revokeObjectURL(url);
  }

  return image;
}

/**
 * Get the intrinsic size of an image source.
 *
 * @params {SourceImage} image: decoded image
 * @returns {{ width: number; height: number }}
 */
function getImageSize(image: SourceImage): { width: number; height: number } {
  if ("naturalWidth" in image) {
    return { width: image.naturalWidth, height: image.naturalHeight };
  }
  return { width: image.width, height: image.height };
}

/**
 * Release resources used by an image source.
 *
 * @params {SourceImage} image: decoded image
 * @returns {void}
 */
function cleanupImage(image: SourceImage): void {
  if ("close" in image) {
    image.close();
  }
}

/**
 * Encode a canvas into a Blob.
 *
 * @params {Canvas2D} canvas: source canvas
 * @params {ResizeFormat} type: output MIME type
 * @params {number | undefined} quality: encoder quality
 * @returns {Promise<Blob>}
 */
async function canvasToBlob(
  canvas: Canvas2D,
  type: ResizeFormat,
  quality: number | undefined,
): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type, quality });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to create image blob."));
        }
      },
      type,
      quality,
    );
  });
}

export const __test__ = {
  normalizeDimension,
  resolveTargetSize,
  normalizeQuality,
  resolveOutputType,
  getCoverSourceRect,
  createCanvas,
  get2dContext,
  loadImage,
  getImageSize,
  cleanupImage,
  canvasToBlob,
};
