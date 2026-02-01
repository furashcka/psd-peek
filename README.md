# PSD Viewer - MVP

Browser-based PSD file viewer, similar to Figma Dev Mode or Avocode.

## MVP Features

- ✅ Load PSD files via drag & drop or file selection
- ✅ Display PSD preview
- ✅ Layer tree with hierarchy
- ✅ View layer properties (size, position, opacity, blend mode)
- ✅ Text layer support
- ✅ Works entirely in browser, no server required

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

## Future Plans

- [ ] Export layers to PNG/SVG
- [ ] Measure distances between elements
- [ ] Copy CSS properties
- [ ] Search through layers
- [ ] Canvas zoom and pan
- [ ] Select layer by clicking on canvas
- [ ] Show/hide layers
- [ ] Export specifications for developers
