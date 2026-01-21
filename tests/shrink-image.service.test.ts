import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { __test__, shrinkImage } from "../src/services/shrink-image.service";

const {
  normalizeDimension,
  resolveTargetSize,
  normalizeQuality,
  resolveOutputType,
  getCoverSourceRect,
  createCanvas,
  loadImage,
  getImageSize,
  cleanupImage,
  canvasToBlob,
} = __test__;

type MockContext = {
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: string;
  fillStyle: string;
  fillRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
};

const createMockContext = (): MockContext => ({
  imageSmoothingEnabled: false,
  imageSmoothingQuality: "low",
  fillStyle: "",
  fillRect: vi.fn(),
  drawImage: vi.fn(),
});

const ensureBlob = (): void => {
  if (typeof Blob === "undefined") {
    class MockBlob {
      public readonly size: number;
      public readonly type: string;

      public constructor(parts: Array<string | ArrayBuffer>, options?: { type?: string }) {
        const text = parts
          .map((part) =>
            typeof part === "string" ? part : Buffer.from(part).toString("utf8"),
          )
          .join("");
        this.size = text.length;
        this.type = options?.type ?? "";
      }
    }

    vi.stubGlobal("Blob", MockBlob as unknown as typeof Blob);
  }
};

beforeAll(() => {
  ensureBlob();
});

beforeEach(() => {
  ensureBlob();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("normalizeDimension", () => {
  it("rounds and validates values", () => {
    expect(normalizeDimension(10.4, "width")).toBe(10);
    expect(normalizeDimension(10.6, "width")).toBe(11);
  });

  it("throws on invalid values", () => {
    expect(() => normalizeDimension(0, "width")).toThrow();
    expect(() => normalizeDimension(-1, "width")).toThrow();
    expect(() => normalizeDimension(Number.NaN, "width")).toThrow();
  });
});

describe("resolveTargetSize", () => {
  it("throws when both dimensions are missing", () => {
    expect(() => resolveTargetSize(undefined, undefined, 100, 50)).toThrow(
      "width or height must be provided.",
    );
  });

  it("uses provided width and height", () => {
    expect(resolveTargetSize(100.2, 50.7, 200, 100)).toEqual({
      width: 100,
      height: 51,
    });
  });

  it("computes height from width", () => {
    expect(resolveTargetSize(100, undefined, 200, 100)).toEqual({
      width: 100,
      height: 50,
    });
  });

  it("computes width from height", () => {
    expect(resolveTargetSize(undefined, 50, 200, 100)).toEqual({
      width: 100,
      height: 50,
    });
  });
});

describe("normalizeQuality", () => {
  it("returns default quality when undefined", () => {
    expect(normalizeQuality()).toBe(0.92);
  });

  it("returns provided quality in range", () => {
    expect(normalizeQuality(0.5)).toBe(0.5);
  });

  it("throws on invalid quality", () => {
    expect(() => normalizeQuality(-0.1)).toThrow();
    expect(() => normalizeQuality(1.1)).toThrow();
  });
});

describe("resolveOutputType", () => {
  it("prefers explicit format", () => {
    expect(resolveOutputType("image/webp", "image/png")).toBe("image/webp");
  });

  it("uses input type when supported", () => {
    expect(resolveOutputType(undefined, "image/png")).toBe("image/png");
  });

  it("falls back to jpeg when unsupported", () => {
    expect(resolveOutputType(undefined, "image/gif")).toBe("image/jpeg");
  });
});

describe("getCoverSourceRect", () => {
  it("crops width when source is wider", () => {
    expect(getCoverSourceRect(200, 100, 100, 100)).toEqual({
      sx: 50,
      sy: 0,
      sWidth: 100,
      sHeight: 100,
    });
  });

  it("crops height when source is taller", () => {
    expect(getCoverSourceRect(100, 200, 200, 100)).toEqual({
      sx: 0,
      sy: 75,
      sWidth: 100,
      sHeight: 50,
    });
  });
});

describe("createCanvas", () => {
  it("uses OffscreenCanvas when available", () => {
    const created: MockOffscreenCanvas[] = [];

    class MockOffscreenCanvas {
      public width: number;
      public height: number;
      public ctx = createMockContext();

      public constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        created.push(this);
      }

      public getContext(type: string): MockContext | null {
        return type === "2d" ? this.ctx : null;
      }

      public convertToBlob(): Promise<Blob> {
        return Promise.resolve(new Blob(["ok"], { type: "image/png" }));
      }
    }

    vi.stubGlobal(
      "OffscreenCanvas",
      MockOffscreenCanvas as unknown as typeof OffscreenCanvas,
    );

    const canvas = createCanvas(10, 20);
    expect(canvas).toBe(created[0]);
  });

  it("falls back to document canvas when OffscreenCanvas is missing", () => {
    vi.stubGlobal("OffscreenCanvas", undefined);

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => createMockContext()),
    };
    const mockDocument = {
      createElement: vi.fn(() => mockCanvas),
    };
    vi.stubGlobal("document", mockDocument);

    const canvas = createCanvas(5, 6);
    expect(mockDocument.createElement).toHaveBeenCalledWith("canvas");
    expect(mockCanvas.width).toBe(5);
    expect(mockCanvas.height).toBe(6);
    expect(canvas).toBe(mockCanvas);
  });

  it("throws when no canvas API is available", () => {
    vi.stubGlobal("OffscreenCanvas", undefined);
    vi.stubGlobal("document", undefined);

    expect(() => createCanvas(1, 1)).toThrow(
      "Canvas is not available in this environment.",
    );
  });
});

describe("loadImage", () => {
  it("uses createImageBitmap when available", async () => {
    const bitmap = { width: 120, height: 80, close: vi.fn() };
    const createImageBitmapMock = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);

    const blob = new Blob(["data"], { type: "image/png" });
    const result = await loadImage(blob);

    expect(createImageBitmapMock).toHaveBeenCalledWith(blob, {
      imageOrientation: "from-image",
    });
    expect(result).toBe(bitmap);
  });

  it("falls back to Image decoding when createImageBitmap is missing", async () => {
    vi.stubGlobal("createImageBitmap", undefined);

    const createObjectURL = vi.fn().mockReturnValue("blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      { createObjectURL, revokeObjectURL } as unknown as typeof URL,
    );

    class MockImage {
      public decoding = "async";
      public src = "";
      public naturalWidth = 320;
      public naturalHeight = 240;
      public decode = vi.fn().mockResolvedValue(undefined);
    }

    vi.stubGlobal("Image", MockImage as unknown as typeof Image);

    const blob = new Blob(["data"], { type: "image/png" });
    const result = await loadImage(blob);

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    expect(result).toBeInstanceOf(MockImage);
  });
});

describe("getImageSize", () => {
  it("reads naturalWidth/naturalHeight from HTMLImageElement", () => {
    const image = { naturalWidth: 640, naturalHeight: 480 } as HTMLImageElement;
    expect(getImageSize(image)).toEqual({ width: 640, height: 480 });
  });

  it("reads width/height from ImageBitmap", () => {
    const bitmap = { width: 320, height: 240 } as ImageBitmap;
    expect(getImageSize(bitmap)).toEqual({ width: 320, height: 240 });
  });
});

describe("cleanupImage", () => {
  it("calls close when supported", () => {
    const image = { close: vi.fn() } as unknown as ImageBitmap;
    cleanupImage(image);
    expect(image.close).toHaveBeenCalled();
  });

  it("does nothing when close is not available", () => {
    const image = { width: 10, height: 10 } as ImageBitmap;
    expect(() => cleanupImage(image)).not.toThrow();
  });
});

describe("canvasToBlob", () => {
  it("uses convertToBlob when available", async () => {
    const blob = new Blob(["data"], { type: "image/png" });
    const canvas = {
      convertToBlob: vi.fn().mockResolvedValue(blob),
    } as unknown as OffscreenCanvas;

    await expect(canvasToBlob(canvas, "image/png", 0.8)).resolves.toBe(blob);
  });

  it("falls back to toBlob when convertToBlob is missing", async () => {
    const blob = new Blob(["data"], { type: "image/jpeg" });
    const canvas = {
      toBlob: vi.fn((callback: (value: Blob | null) => void) => callback(blob)),
    } as unknown as HTMLCanvasElement;

    await expect(canvasToBlob(canvas, "image/jpeg", 0.9)).resolves.toBe(blob);
  });
});

describe("shrinkImage", () => {
  it("throws when target size exceeds source", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 100, height: 100, close: vi.fn() }),
    );
    vi.stubGlobal("OffscreenCanvas", undefined);

    const blob = new Blob(["data"], { type: "image/png" });
    await expect(
      shrinkImage(blob, { width: 200, height: 200 }),
    ).rejects.toThrow("Target size 200x200 exceeds source 100x100.");
  });

  it("draws contain image with background fill", async () => {
    const created: MockOffscreenCanvas[] = [];

    class MockOffscreenCanvas {
      public width: number;
      public height: number;
      public ctx = createMockContext();

      public constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        created.push(this);
      }

      public getContext(type: string): MockContext | null {
        return type === "2d" ? this.ctx : null;
      }

      public convertToBlob(): Promise<Blob> {
        return Promise.resolve(new Blob(["ok"], { type: "image/jpeg" }));
      }
    }

    vi.stubGlobal(
      "OffscreenCanvas",
      MockOffscreenCanvas as unknown as typeof OffscreenCanvas,
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 200, height: 100, close: vi.fn() }),
    );

    const blob = new Blob(["data"], { type: "image/jpeg" });
    await shrinkImage(blob, { width: 100, height: 100, fit: "contain" });

    const ctx = created[0].ctx;
    expect(ctx.fillStyle).toBe("#ffffff");
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 100);

    const drawCall = ctx.drawImage.mock.calls[0];
    expect(drawCall[5]).toBe(0);
    expect(drawCall[6]).toBe(25);
    expect(drawCall[7]).toBe(100);
    expect(drawCall[8]).toBe(50);
  });

  it("draws cover image with crop", async () => {
    const created: MockOffscreenCanvas[] = [];

    class MockOffscreenCanvas {
      public width: number;
      public height: number;
      public ctx = createMockContext();

      public constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        created.push(this);
      }

      public getContext(type: string): MockContext | null {
        return type === "2d" ? this.ctx : null;
      }

      public convertToBlob(): Promise<Blob> {
        return Promise.resolve(new Blob(["ok"], { type: "image/png" }));
      }
    }

    vi.stubGlobal(
      "OffscreenCanvas",
      MockOffscreenCanvas as unknown as typeof OffscreenCanvas,
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 200, height: 100, close: vi.fn() }),
    );

    const blob = new Blob(["data"], { type: "image/png" });
    await shrinkImage(blob, { width: 100, height: 100 });

    const drawCall = created[0].ctx.drawImage.mock.calls[0];
    expect(drawCall[1]).toBe(50);
    expect(drawCall[2]).toBe(0);
    expect(drawCall[3]).toBe(100);
    expect(drawCall[4]).toBe(100);
  });
});
