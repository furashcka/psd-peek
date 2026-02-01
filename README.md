# PSD Peek

**[Try it now →](https://furashcka.github.io/psd-peek/)**

Open-source browser-based PSD file inspector — a free alternative to Avocode, Figma Dev Mode, and Figpea for working with Photoshop files. Inspect layers, measure distances, and explore your designs directly in your browser. No uploads, no servers, completely private and open source.

## Features

- 🎨 Load PSD files via drag & drop or file selection
- 🖼️ Canvas preview with zoom and pan controls
- 📁 Layer tree with hierarchy and groups
- 👁️ Show/hide layers with visibility toggle
- 🎯 Click layers on canvas to select them
- 📏 Measure distances between layers
- 📋 View layer properties (size, position, opacity, blend mode, effects)
- ⌨️ Keyboard shortcuts (S - select, H - hand tool, Space - pan)
- 🔒 100% client-side, your files never leave your browser
- 🆓 Completely free and open source

## Technologies

- Vue 3 + TypeScript
- @webtoon/psd - PSD file parsing
- Vite

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
