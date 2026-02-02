<template>
  <div class="home">
    <div class="upload-area" v-if="!psdData" @drop.prevent="handleDrop" @dragover.prevent>
      <input type="file" ref="fileInput" @change="handleFileSelect" accept=".psd" style="display: none" />
      <div class="upload-content" @click="$refs.fileInput.click()">
        <div class="upload-icon">📁</div>
        <h2>Upload PSD file</h2>
        <p>Drag and drop file here or click to select</p>
      </div>
      
      <!-- Loading overlay -->
      <div v-if="isLoading" class="loading-overlay">
        <div class="loading-spinner"></div>
        <div class="loading-text">{{ loadingStatus }}</div>
      </div>
    </div>

    <div v-else class="viewer">
      <!-- Canvas fullscreen -->
      <div 
        class="canvas-area" 
        ref="canvasContainer"
        :class="{ 'tool-hand': isSpacePressed || currentTool === 'hand', 'tool-select': !isSpacePressed && currentTool === 'select' }"
        @wheel.prevent="handleWheel"
        @mousedown="handleMouseDown"
        @mousemove="handleMouseMove"
        @mouseup="handleMouseUp"
        @mouseleave="handleMouseUp"
      >
        <canvas ref="canvas"></canvas>
      </div>

      <!-- Toolbar with tools -->
      <div class="toolbar">
        <button 
          @click="showLeftPanel = !showLeftPanel"
          title="Toggle Layers Panel (L)"
        >
          <span class="tool-icon">☰</span>
          <span class="tool-key">L</span>
        </button>
        <div class="toolbar-separator"></div>
        <button 
          :class="{ active: currentTool === 'select' }" 
          @click="currentTool = 'select'"
          title="Select (S)"
        >
          <span class="tool-icon">➤</span>
          <span class="tool-key">S</span>
        </button>
        <button 
          :class="{ active: currentTool === 'hand' }" 
          @click="currentTool = 'hand'"
          title="Hand (H)"
        >
          <span class="tool-icon">✋</span>
          <span class="tool-key">H</span>
        </button>
      </div>

      <!-- Floating left panel -->
      <div v-if="showLeftPanel" class="sidebar floating">
        <div class="sidebar-header">
          <h3>Layers</h3>
          <button @click="resetViewer" class="btn-reset">✕</button>
        </div>
        <LayerTree 
          :layers="reversedLayers" 
          :expanded-groups="expandedGroups"
          :layer-visibility="layerVisibility"
          @layer-select="selectLayer" 
          @toggle-visibility="toggleLayerVisibility"
          :selected-layer="selectedLayer" 
        />
      </div>

      <!-- Right panel with properties -->
      <div class="properties-panel floating" v-if="selectedLayer">
        <LayerProperties :layer="selectedLayer" :psd="psdData" />
      </div>

      <!-- Zoom controls -->
      <div class="zoom-controls">
        <button @click="zoomOut" title="Zoom Out">−</button>
        <span>{{ Math.round(zoom * 100) }}%</span>
        <button @click="zoomIn" title="Zoom In">+</button>
        <button @click="fitToScreen" title="Fit to Screen">⛶</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, computed, onMounted, onUnmounted } from 'vue'
import { readPsd, initializeCanvas } from 'ag-psd'
import LayerTree from '@/components/LayerTree.vue'
import LayerProperties from '@/components/LayerProperties.vue'
import type { Psd, Layer } from 'ag-psd'
import { compositePsd, clearCompositorCache } from '@/utils/psdCompositor'

// Initialize canvas for ag-psd
if (typeof document !== 'undefined') {
  initializeCanvas((width: number, height: number) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  })
}

const fileInput = ref<HTMLInputElement>()
const canvas = ref<HTMLCanvasElement>()
const canvasContainer = ref<HTMLDivElement>()
const psdData = ref<Psd | null>(null)
const selectedLayer = ref<Layer | null>(null)
const isLoading = ref(false)
const loadingStatus = ref('')

// Reactive storage for layer visibility (key - layer __uniqueId)
const layerVisibility = ref<Map<number, boolean>>(new Map())

// Zoom and pan
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const isDragging = ref(false)
const lastMouseX = ref(0)
const lastMouseY = ref(0)

// Tools
type Tool = 'select' | 'hand'
const currentTool = ref<Tool>('select')
const isSpacePressed = ref(false)
const showLeftPanel = ref(true)

// Hover layer for measurements
const hoverLayer = ref<Node | null>(null)

// Calculate bounding box for a group from all its children
const calculateGroupBounds = (group: any): { left: number, top: number, right: number, bottom: number } => {
  let minLeft = Infinity
  let minTop = Infinity
  let maxRight = -Infinity
  let maxBottom = -Infinity
  
  const processLayer = (layer: any) => {
    // Skip hidden layers
    const visible = layerVisibility.value.get(layer.__uniqueId)
    if (visible === false) return
    if (layer.hidden && visible === undefined) return
    
    if (layer.children) {
      // Recursively process children
      for (const child of layer.children) {
        processLayer(child)
      }
    } else {
      // Leaf layer - use its bounds
      const left = layer.left || 0
      const top = layer.top || 0
      const right = layer.right || 0
      const bottom = layer.bottom || 0
      
      minLeft = Math.min(minLeft, left)
      minTop = Math.min(minTop, top)
      maxRight = Math.max(maxRight, right)
      maxBottom = Math.max(maxBottom, bottom)
    }
  }
  
  if (group.children) {
    for (const child of group.children) {
      processLayer(child)
    }
  }
  
  // Fallback if no visible children
  if (minLeft === Infinity) {
    return {
      left: group.left || 0,
      top: group.top || 0,
      right: group.right || 0,
      bottom: group.bottom || 0
    }
  }
  
  return {
    left: minLeft,
    top: minTop,
    right: maxRight,
    bottom: maxBottom
  }
}

// Calculate tight bounding box from actual canvas pixels (excluding transparent)
const calculateTightBounds = (layer: any): { left: number, top: number, right: number, bottom: number } | null => {
  if (!layer.canvas) return null
  
  const canvas = layer.canvas
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  
  let minX = canvas.width
  let minY = canvas.height
  let maxX = 0
  let maxY = 0
  
  // Scan all pixels to find non-transparent bounds
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const alpha = data[(y * canvas.width + x) * 4 + 3]
      if (alpha > 0) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }
  
  // No opaque pixels found
  if (minX > maxX) return null
  
  const layerLeft = layer.left || 0
  const layerTop = layer.top || 0
  
  return {
    left: layerLeft + minX,
    top: layerTop + minY,
    right: layerLeft + maxX + 1,
    bottom: layerTop + maxY + 1
  }
}

// Get layer bounds (with tight bounds for regular layers)
const getLayerBounds = (layer: any): { left: number, top: number, right: number, bottom: number } => {
  let left = layer.left || 0
  let top = layer.top || 0
  let right = layer.right || 0
  let bottom = layer.bottom || 0
  
  // For groups, calculate bounding box from children
  if (layer.children && layer.children.length > 0) {
    const bbox = calculateGroupBounds(layer)
    left = bbox.left
    top = bbox.top
    right = bbox.right
    bottom = bbox.bottom
  }
  // For vector layers, use bounding box from vectorOrigination
  else if (layer.vectorOrigination?.keyDescriptorList?.[0]?.keyOriginShapeBoundingBox) {
    const bbox = layer.vectorOrigination.keyDescriptorList[0].keyOriginShapeBoundingBox
    left = bbox.left.value
    top = bbox.top.value
    right = bbox.right.value
    bottom = bbox.bottom.value
  }
  // For regular layers with canvas, try to get tight bounds
  else if (layer.canvas) {
    const tightBounds = calculateTightBounds(layer)
    if (tightBounds) {
      left = tightBounds.left
      top = tightBounds.top
      right = tightBounds.right
      bottom = tightBounds.bottom
    }
  }
  
  return { left, top, right, bottom }
}

const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    await loadPsdFile(file)
  }
}

const handleDrop = async (event: DragEvent) => {
  const file = event.dataTransfer?.files[0]
  if (file && file.name.endsWith('.psd')) {
    await loadPsdFile(file)
  }
}

const loadPsdFile = async (file: File) => {
  try {
    isLoading.value = true
    loadingStatus.value = 'Reading file...'
    
    // Очистить кэш композитора
    clearCompositorCache()
    
    const arrayBuffer = await file.arrayBuffer()
    
    loadingStatus.value = 'Parsing PSD structure...'
    await new Promise(resolve => setTimeout(resolve, 100)) // Give UI time to update
    
    const psd = readPsd(arrayBuffer, { 
      skipLayerImageData: false,
      skipThumbnail: true,
      useImageData: false,
      skipLinkedFilesData: false, // Enable linked files data
      // Enable vector data loading
      skipVectorData: false
    })
    
    // Debug: log linkedFiles if available
    if (psd.linkedFiles && psd.linkedFiles.length > 0) {
      console.log('🔗 Found linkedFiles:', psd.linkedFiles.length)
    }
    
    loadingStatus.value = 'Processing layers...'
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Add unique IDs to all layers
    let idCounter = 0
    const addUniqueIds = (node: any) => {
      node.__uniqueId = idCounter++
      if (node.children) {
        node.children.forEach((child: any) => addUniqueIds(child))
      }
    }
    addUniqueIds(psd)
    
    loadingStatus.value = 'Initializing visibility...'
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Initialize layer visibility from PSD
    const initVisibility = (node: any) => {
      const isHidden = node.hidden === true
      layerVisibility.value.set(node.__uniqueId, !isHidden)
      
      if (node.children) {
        node.children.forEach((child: any) => initVisibility(child))
      }
    }
    initVisibility(psd)
    
    psdData.value = psd
    
    loadingStatus.value = 'Rendering canvas...'
    await nextTick()
    await renderPsd(psd)
    
    await nextTick()
    fitToScreen()
    
    isLoading.value = false
    loadingStatus.value = ''
  } catch (error) {
    console.error('Error loading PSD:', error)
    alert('Failed to load PSD file')
    isLoading.value = false
    loadingStatus.value = ''
  }
}

const renderPsd = async (psd: any) => {
  if (!canvas.value || !canvasContainer.value) {
    console.error('Canvas or container ref is null!')
    return
  }
  
  const ctx = canvas.value.getContext('2d')
  
  if (!ctx) {
    console.error('Cannot get 2d context!')
    return
  }

  // Canvas size matching browser window
  canvas.value.width = window.innerWidth
  canvas.value.height = window.innerHeight

  // ag-psd already provides canvas with composite image
  if (psd.canvas) {
    // Save PSD canvas for rendering
    ;(canvas.value as any).__psdCanvas = psd.canvas
  }
  
  // Also render individual layers
  const renderLayers = (layers: any[] | undefined) => {
    if (!layers) return
    
    for (const layer of layers) {
      if (layer.children && layer.children.length > 0) {
        renderLayers(layer.children)
      }
      
      // ag-psd already provides canvas for each layer
      if (layer.canvas) {
        ;(layer as any).__canvas = layer.canvas
      }
    }
  }
  
  renderLayers(psd.children)
  
  // Save PSD data
  ;(canvas.value as any).__psdData = psd
}

const drawCanvas = () => {
  if (!canvas.value) return
  
  const ctx = canvas.value.getContext('2d')
  if (!ctx) return
  
  const psd = (canvas.value as any).__psdData
  if (!psd) return
  
  // Clear canvas
  ctx.fillStyle = '#2c2c2c'
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height)
  
  // Apply transformations
  ctx.save()
  ctx.translate(canvas.value.width / 2 + panX.value, canvas.value.height / 2 + panY.value)
  ctx.scale(zoom.value, zoom.value)
  ctx.translate(-psd.width / 2, -psd.height / 2)
  
  // 🎯 Используем наш композитор с кэшированием!
  const compositeCanvas = compositePsd(psd, {
    layerVisibility: layerVisibility.value,
    applyBlendModes: true
  })
  
  console.log('🖼️ Composite canvas:', compositeCanvas.width, 'x', compositeCanvas.height)
  console.log('🎨 Main canvas:', canvas.value.width, 'x', canvas.value.height)
  console.log('🔍 Zoom:', zoom.value, 'Pan:', panX.value, panY.value)
  
  ctx.drawImage(compositeCanvas, 0, 0)
  
  // Draw overlays (selection, measurements) - это быстро
  drawOverlays(ctx, psd)
  
  ctx.restore()
}

// Отдельная функция для рисования overlay (selection, measurements)
const drawOverlays = (ctx: CanvasRenderingContext2D, psd: any) => {
  // Draw selection of selected layer
  if (selectedLayer.value) {
    const layer = selectedLayer.value as any
    const { left, top, right, bottom } = getLayerBounds(layer)
    const width = right - left
    const height = bottom - top
    
    ctx.save()
    ctx.strokeStyle = '#42b983'
    ctx.lineWidth = 2 / zoom.value
    
    // Рисуем прямоугольник по точным координатам из PSD
    ctx.strokeRect(left, top, width, height)
    ctx.restore()
  }
  
  // Draw measurements between selected and hover layer
  if (selectedLayer.value && hoverLayer.value && selectedLayer.value !== hoverLayer.value) {
    const selected = selectedLayer.value
    const hover = hoverLayer.value
    
    const sBounds = getLayerBounds(selected)
    const sLeft = sBounds.left
    const sTop = sBounds.top
    const sRight = sBounds.right
    const sBottom = sBounds.bottom
    const sWidth = sRight - sLeft
    const sHeight = sBottom - sTop
    
    const hBounds = getLayerBounds(hover)
    const hLeft = hBounds.left
    const hTop = hBounds.top
    const hRight = hBounds.right
    const hBottom = hBounds.bottom
    const hWidth = hRight - hLeft
    const hHeight = hBottom - hTop
    
    ctx.strokeStyle = '#ff6b6b'
    ctx.fillStyle = '#ff6b6b'
    ctx.lineWidth = 1 / zoom.value
    ctx.font = `${12 / zoom.value}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    // Check if layers overlap
    const isOverlapping = !(sRight < hLeft || hRight < sLeft || sBottom < hTop || hBottom < sTop)
    
    if (isOverlapping) {
      // Layers overlap - show distances to hover layer edges
      
      // Left distance
      if (sLeft > hLeft) {
        const distance = Math.round(sLeft - hLeft)
        const y = (sTop + sBottom) / 2
        ctx.beginPath()
        ctx.moveTo(hLeft, y)
        ctx.lineTo(sLeft, y)
        ctx.stroke()
        ctx.fillText(`${distance}px`, (hLeft + sLeft) / 2, y - 8 / zoom.value)
      }
      
      // Right distance
      if (sRight < hRight) {
        const distance = Math.round(hRight - sRight)
        const y = (sTop + sBottom) / 2
        ctx.beginPath()
        ctx.moveTo(sRight, y)
        ctx.lineTo(hRight, y)
        ctx.stroke()
        ctx.fillText(`${distance}px`, (sRight + hRight) / 2, y - 8 / zoom.value)
      }
      
      // Top distance
      if (sTop > hTop) {
        const distance = Math.round(sTop - hTop)
        const x = (sLeft + sRight) / 2
        ctx.beginPath()
        ctx.moveTo(x, hTop)
        ctx.lineTo(x, sTop)
        ctx.stroke()
        ctx.save()
        ctx.translate(x + 8 / zoom.value, (hTop + sTop) / 2)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText(`${distance}px`, 0, 0)
        ctx.restore()
      }
      
      // Bottom distance
      if (sBottom < hBottom) {
        const distance = Math.round(hBottom - sBottom)
        const x = (sLeft + sRight) / 2
        ctx.beginPath()
        ctx.moveTo(x, sBottom)
        ctx.lineTo(x, hBottom)
        ctx.stroke()
        ctx.save()
        ctx.translate(x + 8 / zoom.value, (sBottom + hBottom) / 2)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText(`${distance}px`, 0, 0)
        ctx.restore()
      }
    } else {
      // Layers don't overlap - show distances between them
      
      // Horizontal distance
      if (sRight < hLeft) {
        const distance = Math.round(hLeft - sRight)
        const y = (sTop + sBottom) / 2
        ctx.beginPath()
        ctx.moveTo(sRight, y)
        ctx.lineTo(hLeft, y)
        ctx.stroke()
        ctx.fillText(`${distance}px`, (sRight + hLeft) / 2, y - 8 / zoom.value)
      } else if (hRight < sLeft) {
        const distance = Math.round(sLeft - hRight)
        const y = (sTop + sBottom) / 2
        ctx.beginPath()
        ctx.moveTo(hRight, y)
        ctx.lineTo(sLeft, y)
        ctx.stroke()
        ctx.fillText(`${distance}px`, (hRight + sLeft) / 2, y - 8 / zoom.value)
      }
      
      // Vertical distance
      if (sBottom < hTop) {
        const distance = Math.round(hTop - sBottom)
        const x = (sLeft + sRight) / 2
        ctx.beginPath()
        ctx.moveTo(x, sBottom)
        ctx.lineTo(x, hTop)
        ctx.stroke()
        ctx.save()
        ctx.translate(x + 8 / zoom.value, (sBottom + hTop) / 2)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText(`${distance}px`, 0, 0)
        ctx.restore()
      } else if (hBottom < sTop) {
        const distance = Math.round(sTop - hBottom)
        const x = (sLeft + sRight) / 2
        ctx.beginPath()
        ctx.moveTo(x, hBottom)
        ctx.lineTo(x, sTop)
        ctx.stroke()
        ctx.save()
        ctx.translate(x + 8 / zoom.value, (hBottom + sTop) / 2)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText(`${distance}px`, 0, 0)
        ctx.restore()
      }
    }
    
    // Draw hover layer border
    ctx.strokeStyle = '#ff6b6b'
    ctx.setLineDash([4 / zoom.value, 4 / zoom.value])
    ctx.strokeRect(hLeft, hTop, hWidth, hHeight)
    ctx.setLineDash([])
  }
}

const toggleLayerVisibility = (layer: any) => {
  const currentVisibility = layerVisibility.value.get(layer.__uniqueId)
  layerVisibility.value.set(layer.__uniqueId, !currentVisibility)
  
  // Перерисовать canvas с новой видимостью
  drawCanvas()
}

const selectLayer = (layer: any) => {
  selectedLayer.value = layer
  
  // Expand all parent groups
  expandParentGroups(layer)
  
  // Scroll to layer in next tick after expanding groups
  nextTick(() => {
    scrollToLayer(layer)
  })
  
  drawCanvas()
}

const expandParentGroups = (layer: any) => {
  if (!psdData.value) return
  
  // Find path from root to layer
  const findPath = (node: any, target: any, path: any[] = []): any[] | null => {
    if (node.__uniqueId === target.__uniqueId) {
      return [...path, node]
    }
    
    if (node.children) {
      for (const child of node.children) {
        const result = findPath(child, target, [...path, node])
        if (result) return result
      }
    }
    
    return null
  }
  
  const path = findPath(psdData.value, layer)
  if (path) {
    // Emit event to expand groups
    expandedGroups.value = new Set(path.map((n: any) => n.__uniqueId))
  }
}

const scrollToLayer = (layer: Node) => {
  // Find layer DOM element
  const layerId = (layer as any).__uniqueId
  const layerElement = document.querySelector(`[data-layer-id="${layerId}"]`)
  
  if (layerElement) {
    layerElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}

// Storage for expanded groups
const expandedGroups = ref<Set<number>>(new Set())

// Reversed layers for correct display order (top to bottom)
const reversedLayers = computed(() => {
  if (!psdData.value?.children) return []
  return [...psdData.value.children].reverse()
})

const handleWheel = (event: WheelEvent) => {
  if (!canvas.value) return
  
  const delta = event.deltaY > 0 ? 0.9 : 1.1
  const newZoom = Math.max(0.1, Math.min(10, zoom.value * delta))
  
  // Get cursor position relative to canvas
  const rect = canvas.value.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top
  
  // Calculate point in PSD coordinates before zoom
  const worldX = (mouseX - canvas.value.width / 2 - panX.value) / zoom.value
  const worldY = (mouseY - canvas.value.height / 2 - panY.value) / zoom.value
  
  // Apply new zoom
  zoom.value = newZoom
  
  // Adjust pan so point under cursor stays in place
  panX.value = mouseX - canvas.value.width / 2 - worldX * newZoom
  panY.value = mouseY - canvas.value.height / 2 - worldY * newZoom
  
  drawCanvas()
}

const handleMouseDown = (event: MouseEvent) => {
  if (event.button === 0) {
    const activeTool = isSpacePressed.value ? 'hand' : currentTool.value
    
    if (activeTool === 'hand') {
      isDragging.value = true
      lastMouseX.value = event.clientX
      lastMouseY.value = event.clientY
    } else if (activeTool === 'select') {
      selectLayerAtPoint(event.clientX, event.clientY)
    }
  }
}

// Cache for parent visibility checks
const parentVisibilityCache = new Map<number, boolean>()

const isLayerVisible = (layer: Node, debug: boolean = false): boolean => {
  if (!psdData.value) return false
  
  const layerId = (layer as any).__uniqueId
  
  // Check layer visibility from reactive storage
  if (layerVisibility.value.get(layerId) === false) {
    return false
  }
  
  // Check cache first
  if (parentVisibilityCache.has(layerId)) {
    return parentVisibilityCache.get(layerId)!
  }
  
  // Check visibility of all parent groups
  const findParent = (node: Node, target: Node): Node | null => {
    if (node.children) {
      for (const child of node.children) {
        if ((child as any).__uniqueId === (target as any).__uniqueId) {
          return node
        }
        const found = findParent(child, target)
        if (found) return found
      }
    }
    return null
  }
  
  let current = layer
  let parent = findParent(psdData.value, current)
  
  while (parent && parent !== psdData.value) {
    const parentId = (parent as any).__uniqueId
    const parentVisible = layerVisibility.value.get(parentId)
    
    if (parentVisible === false) {
      parentVisibilityCache.set(layerId, false)
      return false
    }
    
    current = parent
    parent = findParent(psdData.value, current)
  }
  
  parentVisibilityCache.set(layerId, true)
  return true
}

const selectLayerAtPoint = (clientX: number, clientY: number) => {
  if (!canvas.value || !psdData.value) return
  
  const rect = canvas.value.getBoundingClientRect()
  const canvasCenterX = canvas.value.width / 2
  const canvasCenterY = canvas.value.height / 2
  
  const psdCanvas = (canvas.value as any).__psdCanvas
  if (!psdCanvas) return
  
  const canvasX = clientX - rect.left
  const canvasY = clientY - rect.top
  
  const transformedX = (canvasX - canvasCenterX - panX.value) / zoom.value + psdCanvas.width / 2
  const transformedY = (canvasY - canvasCenterY - panY.value) / zoom.value + psdCanvas.height / 2
  
  const candidateLayers: Array<{ layer: Node; area: number }> = []
  
  const collectLayersAtPoint = (layers: any[] | undefined, x: number, y: number) => {
    if (!layers) return
    
    for (const layer of layers) {
      if (layer.children && layer.children.length > 0) {
        collectLayersAtPoint(layer.children, x, y)
      }
      
      if (layer.opacity !== undefined && layer.opacity > 0) {
        let left = layer.left ?? 0
        let top = layer.top ?? 0
        let right = layer.right ?? 0
        let bottom = layer.bottom ?? 0
        
        // For vector layers, use bounding box from vectorOrigination
        if (layer.vectorOrigination?.keyDescriptorList?.[0]?.keyOriginShapeBoundingBox) {
          const bbox = layer.vectorOrigination.keyDescriptorList[0].keyOriginShapeBoundingBox
          left = bbox.left.value
          top = bbox.top.value
          right = bbox.right.value
          bottom = bbox.bottom.value
        }
        
        const width = right - left
        const height = bottom - top
        
        if (width > 0 && height > 0 && x >= left && x <= right && y >= top && y <= bottom) {
          if (isLayerVisible(layer)) {
            const area = width * height
            candidateLayers.push({ layer, area })
          }
        }
      }
    }
  }
  
  collectLayersAtPoint(psdData.value.children, transformedX, transformedY)
  
  if (candidateLayers.length > 0) {
    candidateLayers.sort((a, b) => a.area - b.area)
    const foundLayer = candidateLayers[0].layer
    selectLayer(foundLayer)
  }
}

const updateHoverLayer = (clientX: number, clientY: number) => {
  if (!canvas.value || !psdData.value) return
  
  const rect = canvas.value.getBoundingClientRect()
  const canvasCenterX = canvas.value.width / 2
  const canvasCenterY = canvas.value.height / 2
  
  const psdCanvas = (canvas.value as any).__psdCanvas
  if (!psdCanvas) return
  
  const canvasX = clientX - rect.left
  const canvasY = clientY - rect.top
  
  const transformedX = (canvasX - canvasCenterX - panX.value) / zoom.value + psdCanvas.width / 2
  const transformedY = (canvasY - canvasCenterY - panY.value) / zoom.value + psdCanvas.height / 2
  
  const candidateLayers: Array<{ layer: Node; area: number }> = []
  
  const collectLayersAtPoint = (layers: any[] | undefined, x: number, y: number) => {
    if (!layers) return
    
    for (const layer of layers) {
      if (layer.children && layer.children.length > 0) {
        collectLayersAtPoint(layer.children, x, y)
      }
      
      if (layer.opacity !== undefined && layer.opacity > 0 && isLayerVisible(layer)) {
        let left = layer.left ?? 0
        let top = layer.top ?? 0
        let right = layer.right ?? 0
        let bottom = layer.bottom ?? 0
        
        // For vector layers, use bounding box from vectorOrigination
        if (layer.vectorOrigination?.keyDescriptorList?.[0]?.keyOriginShapeBoundingBox) {
          const bbox = layer.vectorOrigination.keyDescriptorList[0].keyOriginShapeBoundingBox
          left = bbox.left.value
          top = bbox.top.value
          right = bbox.right.value
          bottom = bbox.bottom.value
        }
        
        const width = right - left
        const height = bottom - top
        
        if (width > 0 && height > 0 && x >= left && x <= right && y >= top && y <= bottom) {
          const area = width * height
          candidateLayers.push({ layer, area })
        }
      }
    }
  }
  
  collectLayersAtPoint(psdData.value.children, transformedX, transformedY)
  
  if (candidateLayers.length > 0) {
    candidateLayers.sort((a, b) => a.area - b.area)
    const foundLayer = candidateLayers[0].layer
    
    // Не устанавливаем hover если это тот же слой что и выбранный
    if (foundLayer !== selectedLayer.value) {
      hoverLayer.value = foundLayer
      drawCanvas()
    } else if (hoverLayer.value) {
      hoverLayer.value = null
      drawCanvas()
    }
  } else if (hoverLayer.value) {
    hoverLayer.value = null
    drawCanvas()
  }
}

// Throttle for hover updates
let hoverUpdateTimeout: number | null = null

const handleMouseMove = (event: MouseEvent) => {
  if (isDragging.value) {
    const deltaX = event.clientX - lastMouseX.value
    const deltaY = event.clientY - lastMouseY.value
    panX.value += deltaX
    panY.value += deltaY
    lastMouseX.value = event.clientX
    lastMouseY.value = event.clientY
    drawCanvas()
  } else if (currentTool.value === 'select' && selectedLayer.value && !isSpacePressed.value) {
    // Throttle hover updates to improve performance
    if (hoverUpdateTimeout === null) {
      hoverUpdateTimeout = window.setTimeout(() => {
        updateHoverLayer(event.clientX, event.clientY)
        hoverUpdateTimeout = null
      }, 50) // Update every 50ms max
    }
  }
}

const handleMouseUp = () => {
  isDragging.value = false
}

const handleKeyDown = (event: KeyboardEvent) => {
  // Only handle if viewer is open
  if (!psdData.value) return
  
  if (event.code === 'Space' && !isSpacePressed.value) {
    event.preventDefault()
    isSpacePressed.value = true
  } else if (event.code === 'KeyS') {
    event.preventDefault()
    currentTool.value = 'select'
  } else if (event.code === 'KeyH') {
    event.preventDefault()
    currentTool.value = 'hand'
  } else if (event.code === 'KeyL') {
    event.preventDefault()
    showLeftPanel.value = !showLeftPanel.value
  }
}

const handleKeyUp = (event: KeyboardEvent) => {
  // Only handle if viewer is open
  if (!psdData.value) return
  
  if (event.code === 'Space') {
    event.preventDefault()
    isSpacePressed.value = false
  }
}

// Setup global keyboard handlers
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})

const zoomIn = () => {
  zoom.value = Math.min(10, zoom.value * 1.2)
  drawCanvas()
}

const zoomOut = () => {
  zoom.value = Math.max(0.1, zoom.value / 1.2)
  drawCanvas()
}

const resetZoom = () => {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
  drawCanvas()
}

const fitToScreen = () => {
  if (!canvas.value) return
  
  const psdCanvas = (canvas.value as any).__psdCanvas
  if (!psdCanvas) return
  
  const containerWidth = window.innerWidth
  const containerHeight = window.innerHeight
  const psdWidth = psdCanvas.width
  const psdHeight = psdCanvas.height
  
  // Calculate scale with padding
  const scaleX = (containerWidth * 0.8) / psdWidth
  const scaleY = (containerHeight * 0.8) / psdHeight
  const scale = Math.min(scaleX, scaleY)
  
  zoom.value = scale
  panX.value = 0
  panY.value = 0
  drawCanvas()
}

const updateCanvasTransform = () => {
  drawCanvas()
}

const resetViewer = () => {
  psdData.value = null
  selectedLayer.value = null
  layerVisibility.value.clear()
  zoom.value = 1
  panX.value = 0
  panY.value = 0
  currentTool.value = 'select'
  isSpacePressed.value = false
}
</script>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.home {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.upload-area {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  position: relative;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(66, 185, 131, 0.2);
  border-top-color: #42b983;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  margin-top: 20px;
  color: white;
  font-size: 14px;
  font-weight: 500;
}

.upload-content {
  text-align: center;
  padding: 60px;
  border: 3px dashed #ccc;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
}

.upload-content:hover {
  border-color: #42b983;
  background: white;
}

.upload-icon {
  font-size: 64px;
  margin-bottom: 20px;
}

.viewer {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #2c2c2c;
}

.canvas-area {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  outline: none;
}

.canvas-area.tool-select {
  cursor: default;
}

.canvas-area.tool-select canvas {
  pointer-events: auto;
  cursor: default;
}

.canvas-area.tool-hand {
  cursor: grab;
}

.canvas-area.tool-hand:active {
  cursor: grabbing;
}

canvas {
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.toolbar {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(10px);
  padding: 8px;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  z-index: 100;
}

.toolbar-separator {
  width: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 4px;
}

.toolbar button {
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  width: 44px;
  height: 44px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.toolbar button:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.toolbar button.active {
  background: rgba(66, 185, 131, 0.3);
  border-color: #42b983;
}

.toolbar button .tool-icon {
  font-size: 20px;
}

.toolbar button:nth-child(1) .tool-icon {
  font-size: 18px;
}

.toolbar button .tool-key {
  position: absolute;
  bottom: 2px;
  right: 4px;
  font-size: 9px;
  opacity: 0.5;
  font-weight: 600;
}

.sidebar.floating {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 280px;
  max-height: calc(100vh - 16px);
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(10px);
  color: white;
  overflow-y: auto;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  z-index: 10;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  position: sticky;
  top: 0;
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(10px);
}

.sidebar-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.btn-reset {
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 18px;
  padding: 4px 8px;
}

.btn-reset:hover {
  color: white;
}

.properties-panel.floating {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 300px;
  max-height: calc(100vh - 16px);
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(10px);
  color: white;
  overflow-y: auto;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  padding: 16px;
  z-index: 10;
}

.properties-panel h3 {
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
}

.zoom-controls {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(10px);
  padding: 8px;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  z-index: 10;
}

.zoom-controls button {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.zoom-controls button:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.zoom-controls span {
  color: white;
  font-size: 13px;
  min-width: 50px;
  text-align: center;
  padding: 0 8px;
}
</style>
