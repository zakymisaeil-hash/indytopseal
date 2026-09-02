# Photo Editor

A standalone desktop photo editor for Windows, built with Electron + Fabric.js.

## Features

- Open/save PNG, JPG, BMP, GIF, WEBP images (drag & drop supported)
- Crop, rotate (90°), resize, flip horizontal/vertical
- Adjustments: brightness, contrast, saturation, hue, gamma, sharpen, blur, noise, vignette
- One-click filters: grayscale, sepia, invert, vintage, polaroid, technicolor, black & white
- Freehand drawing, rectangle/circle/line shapes, text tool with font/size/color/bold
- Object eraser, delete, move/resize/select tool
- Undo/redo history
- Zoom in/out

## Requirements

- [Node.js](https://nodejs.org) 18+ (includes npm)

## Setup (run on your Windows PC)

```
cd photo-editor
npm install
npm start
```

This launches the app in development mode.

## Build a Windows installer / portable .exe

```
npm run dist
```

This produces both an NSIS installer and a portable `.exe` in the `dist/` folder.
To build only the portable version:

```
npm run dist:portable
```

> Building the Windows package must be done on Windows (or Linux/macOS with
> Wine installed) since `electron-builder` needs the Windows toolchain for
> the installer target.

## Usage

- **File > Open Image** (Ctrl+O) to load a photo, or drag an image onto the canvas.
- Use the toolbar to switch tools: Select, Crop, Draw, Erase, Text, Rectangle, Circle, Line.
- Use the right-hand panel for adjustment sliders, one-click filters, resize/crop, and
  draw/text styling.
- **File > Save** (Ctrl+S) or **Save As** (Ctrl+Shift+S) to export as PNG or JPEG.
- Ctrl+Z / Ctrl+Shift+Z to undo/redo.
