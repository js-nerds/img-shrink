# img-shrink

[![npm version](https://img.shields.io/npm/v/@skivuha/img-shrink)](https://www.npmjs.com/package/@skivuha/img-shrink)
[![npm downloads](https://img.shields.io/npm/dm/@skivuha/img-shrink)](https://www.npmjs.com/package/@skivuha/img-shrink)
[![coverage](https://codecov.io/gh/js-nerds/img-shrink/branch/main/graph/badge.svg)](https://codecov.io/gh/js-nerds/img-shrink)

Tiny browser-first image resizer with sane defaults. Pass a `File`/`Blob`, get back a resized `Blob` with optional crop/contain behavior.

## Features
- Works with `File` and `Blob`
- `cover` (crop) and `contain` (fit) modes
- Preserve aspect ratio when only width or height is provided
- Output format selection (`jpeg`, `png`, `webp`)
- Throws on upscale (target size must not exceed source)

## Install

```bash
npm install @skivuha/img-shrink
```

```bash
pnpm add @skivuha/img-shrink
```

```bash
yarn add @skivuha/img-shrink
```

## Usage

### Basic (cover crop)

```ts
import { shrinkImage } from "@skivuha/img-shrink";

const file = input.files?.[0];
if (!file) {
  return;
}

const resized = await shrinkImage(file, {
  width: 100,
  height: 100,
  fit: "cover",
  format: "image/webp",
  quality: 0.9,
});
```

### Fit into a box (contain)

```ts
const resized = await shrinkImage(file, {
  width: 360,
  height: 440,
  fit: "contain",
  background: "#ffffff",
});
```

### Only width or height

```ts
// Height is computed using source aspect ratio
const resizedByWidth = await shrinkImage(file, { width: 800 });

// Width is computed using source aspect ratio
const resizedByHeight = await shrinkImage(file, { height: 600 });
```

## API

### `shrinkImage(input, options)`

Resizes and re-encodes the input image.

**Params**
- `input: Blob` — source image
- `options: ResizeOptions` — resize config

**Returns**
- `Promise<Blob>` — resized image

### `ResizeOptions`

```ts
type ResizeOptions =
  | { width: number; height?: number }
  | { width?: number; height: number };

type ResizeFit = "cover" | "contain";
type ResizeFormat = "image/jpeg" | "image/png" | "image/webp";

type ResizeOptions = ResizeSize & {
  fit?: ResizeFit;
  format?: ResizeFormat;
  quality?: number;
  background?: string;
};
```

**Notes**
- If both `width` and `height` are passed, exact size is used.
- If only one dimension is passed, the other is computed from the source aspect ratio.
- Upscale is not allowed. If target size exceeds source size, an error is thrown.
- Default `fit` is `"cover"`.
- Default `quality` is `0.92`.
- If `format` is not provided, the input type is used when possible, otherwise `image/jpeg`.

## Runtime requirements

`img-shrink` uses Canvas (`OffscreenCanvas` when available) and image decoding APIs. It is intended for browser environments. Node.js is not supported without a DOM/canvas polyfill.

## Coverage

```bash
pnpm run test:coverage
```

Generates a text summary in the terminal and an HTML report in `coverage/`.

## License

MIT
