export type ResizeFit = "cover" | "contain";

export type ResizeFormat = "image/jpeg" | "image/png" | "image/webp";

type ResizeSize =
  | { width: number; height?: number }
  | { width?: number; height: number };

export type ResizeOptions = ResizeSize & {
  fit?: ResizeFit;
  format?: ResizeFormat;
  quality?: number;
  background?: string;
};
