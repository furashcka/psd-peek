# PSD Peek

**[Try it now →](https://furashcka.github.io/psd-peek/)**

Open-source browser-based PSD file inspector — a free alternative to Avocode, Figma Dev Mode, and Figpea for working with Photoshop files. Inspect layers, measure distances, and explore your designs directly in your browser. No uploads, no servers, completely private and open source.

## Features

- 🎨 Load PSD files via drag & drop or file selection
- 🖼️ Canvas preview with zoom and pan controls
- 📁 Layer tree with hierarchy and groups
- 👁️ Show/hide layers with visibility toggle (with dynamic re-rendering)
- 🎯 Click layers on canvas to select them (including vector layers)
- 📏 Measure distances between layers
- 📋 View layer properties (size, position, opacity, blend mode, effects)
- 💅 Generate CSS code for layers (like CSS Hat or Avocode)
  - Complete CSS properties: size, colors, fonts, shadows, borders, etc.
  - HEX color format for all colors
  - Absolute positioning separated at the end for easy copying
  - Select text to copy specific properties
  - One-click copy buttons for CSS and text content
- 📤 Export layers to PNG, JPG, SVG
  - Multiple export scales (1x, 2x, 3x, 4x)
  - High-quality SVG rendering for vector Smart Objects
  - Preview with checkerboard background
  - SVG export for vector shape layers
  - Smart Objects: embedded SVG files exported directly, AI/PDF exported as raw files
- ⌨️ Keyboard shortcuts (S - select, H - hand tool, L - toggle layers panel, Space - pan)
- 🔒 100% client-side, your files never leave your browser
- 🆓 Completely free and open source

## Known Limitations

⚠️ **Layer Effects Not Rendered**: The application currently uses Photoshop's pre-rendered composite image by default, which includes all effects (gradients, shadows, etc.). However, this means:
- Layer visibility toggling is disabled in composite mode (toggle 🔧 icon to enable dynamic rendering without effects)
- Dynamic rendering mode (🔧) does not render layer effects like Gradient Overlay, Drop Shadow, etc.
- Effects metadata is available for CSS generation, but visual rendering requires manual implementation

**Why?** ag-psd provides layer effect metadata but doesn't render them. Implementing effect rendering (gradients, shadows, bevels, etc.) is a complex task that requires recreating Photoshop's rendering engine.

**Workaround**: Use the 🎨/🔧 toggle button to switch between:
- 🎨 Photoshop composite (with effects, no layer control)
- 🔧 Dynamic rendering (layer control, no effects)

## Technologies

- Vue 3 + TypeScript
- ag-psd - PSD file parsing with extended compositor for dynamic rendering
- Vite

## Architecture

- **ag-psd** - Parses PSD files and provides layer metadata
- **Custom Compositor** (`src/utils/psdCompositor.ts`) - Dynamic layer compositing with:
  - Layer visibility toggling
  - Blend mode support (via Canvas API)
  - Performance optimizations (caching, viewport culling)
  - Group rendering with proper opacity/blend modes

## Installation and Running

```bash
npm install
npm run dev
```

## Usage

1. Open the application in your browser
2. Drag and drop a PSD file into the upload area or click to select
3. Browse layers in the left panel
4. Click on a layer to view its properties in the right panel
5. Use mouse wheel to zoom, Space+drag to pan
6. Click on canvas to select layers
