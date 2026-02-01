<template>
  <div class="home">
    <div class="upload-area" v-if="!psdData" @drop.prevent="handleDrop" @dragover.prevent>
      <input type="file" ref="fileInput" @change="handleFileSelect" accept=".psd" style="display: none" />
      <div class="upload-content" @click="$refs.fileInput.click()">
        <div class="upload-icon">📁</div>
        <h2>Upload PSD file</h2>
        <p>Drag and drop file here or click to select</p>
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
        @keydown="handleKeyDown"
        @keyup="handleKeyUp"
        tabindex="0"
      >
        <canvas ref="canvas"></canvas>
      </div>

      <!-- Toolbar with tools -->
      <div class="toolbar">
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
      <div class="sidebar floating">
        <div class="sidebar-header">
          <h3>Layers</h3>
          <button @click="resetViewer" class="btn-reset">✕</button>
        </div>
        <LayerTree 
          :layers="psdData.children" 
          :expanded-groups="expandedGroups"
          :layer-visibility="layerVisibility"
          @layer-select="selectLayer" 
          @toggle-visibility="toggleLayerVisibility"
          :selected-layer="selectedLayer" 
        />
      </div>

      <!-- Right panel with properties -->
      <div class="properties-panel floating" v-if="selectedLayer">
        <LayerProperties :layer="selectedLayer" />
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
import { ref, nextTick } from 'vue'
import Psd from '@webtoon/psd'
import LayerTree from '@/components/LayerTree.vue'
import LayerProperties from '@/components/LayerProperties.vue'
import type { Node } from '@webtoon/psd'

const fileInput = ref<HTMLInputElement>()
const canvas = ref<HTMLCanvasElement>()
const canvasContainer = ref<HTMLDivElement>()
const psdData = ref<Node | null>(null)
const selectedLayer = ref<Node | null>(null)

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

// Hover layer for measurements
const hoverLayer = ref<Node | null>(null)

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
    const arrayBuffer = await file.arrayBuffer()
    const psd = Psd.parse(arrayBuffer)
    
    // Add unique IDs to all layers
    let idCounter = 0
    const addUniqueIds = (node: any) => {
      node.__uniqueId = idCounter++
      if (node.children) {
        node.children.forEach((child: any) => addUniqueIds(child))
      }
    }
    addUniqueIds(psd)
    
    // Initialize layer visibility from PSD
    const initVisibility = (node: any) => {
      const isHidden = node.isHidden === true || node.layerFrame?.layerProperties?.hidden === true
      layerVisibility.value.set(node.__uniqueId, !isHidden)
      
      if (node.children) {
        node.children.forEach((child: any) => initVisibility(child))
      }
    }
    initVisibility(psd)
    
    psdData.value = psd
    
    await nextTick()
    await renderPsd(psd)
    
    await nextTick()
    fitToScreen()
  } catch (error) {
    console.error('Error loading PSD:', error)
    alert('Failed to load PSD file')
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

  // Get composite image of entire PSD
  try {
    const compositeData = await psd.composite()
    
    if (compositeData) {
      // Create temporary canvas for PSD
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = psd.width
      tempCanvas.height = psd.height
      const tempCtx = tempCanvas.getContext('2d')
      
      if (tempCtx) {
        const imageData = new ImageData(
          new Uint8ClampedArray(compositeData),
          psd.width,
          psd.height
        )
        tempCtx.putImageData(imageData, 0, 0)
        
        // Save temporary canvas for subsequent rendering
        ;(canvas.value as any).__psdCanvas = tempCanvas
      }
    } else {
      console.warn('No composite data available. PSD must be saved with "Maximize Compatibility" mode')
    }
  } catch (e) {
    console.error('Error rendering composite:', e)
  }
  
  // Also render individual layers for visibility control
  const renderLayers = async (layers: any[] | undefined) => {
    if (!layers) return
    
    for (const layer of layers) {
      if (layer.children && layer.children.length > 0) {
        await renderLayers(layer.children)
      }
      
      if (layer.type === 'Layer') {
        try {
          // Try to render with effects enabled
          const layerData = await layer.composite(true, false)
          
          if (layerData && layer.width > 0 && layer.height > 0) {
            const layerCanvas = document.createElement('canvas')
            layerCanvas.width = layer.width
            layerCanvas.height = layer.height
            const layerCtx = layerCanvas.getContext('2d')
            
            if (layerCtx) {
              const imageData = new ImageData(
                new Uint8ClampedArray(layerData),
                layer.width,
                layer.height
              )
              layerCtx.putImageData(imageData, 0, 0)
              
              // Save layer canvas for later use
              ;(layer as any).__canvas = layerCanvas
            }
          }
        } catch (e) {
          console.warn(`Failed to render layer ${layer.name}:`, e)
        }
      }
    }
  }
  
  await renderLayers(psd.children)
  
  // Save PSD data
  ;(canvas.value as any).__psdData = psd
}

const drawCanvas = () => {
  if (!canvas.value) return
  
  const ctx = canvas.value.getContext('2d')
  if (!ctx) return
  
  const psdCanvas = (canvas.value as any).__psdCanvas
  const psd = (canvas.value as any).__psdData
  if (!psdCanvas || !psd) return
  
  // Clear canvas
  ctx.fillStyle = '#2c2c2c'
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height)
  
  // Apply transformations
  ctx.save()
  ctx.translate(canvas.value.width / 2 + panX.value, canvas.value.height / 2 + panY.value)
  ctx.scale(zoom.value, zoom.value)
  ctx.translate(-psdCanvas.width / 2, -psdCanvas.height / 2)
  
  // Always draw full composite (it has correct clipping)
  // But we need to mask out hidden layers
  const hasHiddenLayers = () => {
    const checkLayers = (layers: any[] | undefined): boolean => {
      if (!layers) return false
      
      for (const layer of layers) {
        if (!isLayerVisible(layer)) return true
        if (layer.children && checkLayers(layer.children)) return true
      }
      return false
    }
    return checkLayers(psd.children)
  }
  
  if (!hasHiddenLayers()) {
    // All layers visible - draw full composite
    ctx.drawImage(psdCanvas, 0, 0)
  } else {
    // Some layers hidden - draw full composite (it already has correct visibility from PSD)
    ctx.drawImage(psdCanvas, 0, 0)
  }
  
  // Draw selection of selected layer
  if (selectedLayer.value && selectedLayer.value.type === 'Layer') {
    const layer = selectedLayer.value
    const left = layer.left || 0
    const top = layer.top || 0
    const width = layer.width || 0
    const height = layer.height || 0
    
    ctx.strokeStyle = '#42b983'
    ctx.lineWidth = 2 / zoom.value
    ctx.strokeRect(left, top, width, height)
  }
  
  // Draw measurements between selected and hover layer
  if (selectedLayer.value && hoverLayer.value && selectedLayer.value !== hoverLayer.value) {
    const selected = selectedLayer.value
    const hover = hoverLayer.value
    
    const sLeft = selected.left || 0
    const sTop = selected.top || 0
    const sRight = sLeft + (selected.width || 0)
    const sBottom = sTop + (selected.height || 0)
    
    const hLeft = hover.left || 0
    const hTop = hover.top || 0
    const hRight = hLeft + (hover.width || 0)
    const hBottom = hTop + (hover.height || 0)
    
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
    ctx.strokeRect(hLeft, hTop, hover.width || 0, hover.height || 0)
    ctx.setLineDash([])
  }
  
  ctx.restore()
}

const toggleLayerVisibility = (layer: Node) => {
  const layerId = (layer as any).__uniqueId
  const currentVisibility = layerVisibility.value.get(layerId) ?? true
  layerVisibility.value.set(layerId, !currentVisibility)
  
  // Re-render PSD composite with new visibility
  rerenderPsdComposite()
}

const rerenderPsdComposite = async () => {
  if (!canvas.value) return
  
  const psd = (canvas.value as any).__psdData
  if (!psd) return
  
  // Create a new composite with current visibility settings
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = psd.width
  tempCanvas.height = psd.height
  const tempCtx = tempCanvas.getContext('2d')
  
  if (!tempCtx) return
  
  // Draw layers respecting visibility
  const drawLayersToComposite = (layers: any[] | undefined) => {
    if (!layers) return
    
    // Draw in reverse order (bottom to top)
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i]
      
      // Skip if not visible
      if (!isLayerVisible(layer)) continue
      
      // Draw children first
      if (layer.children && layer.children.length > 0) {
        drawLayersToComposite(layer.children)
      }
      
      // Draw layer
      if (layer.type === 'Layer' && layer.__canvas) {
        const opacity = (layer.opacity ?? 255) / 255
        tempCtx.globalAlpha = opacity
        tempCtx.drawImage(layer.__canvas, layer.left ?? 0, layer.top ?? 0)
        tempCtx.globalAlpha = 1
      }
    }
  }
  
  drawLayersToComposite(psd.children)
  
  // Update the composite canvas
  ;(canvas.value as any).__psdCanvas = tempCanvas
  
  drawCanvas()
}

const selectLayer = (layer: Node) => {
  selectedLayer.value = layer
  
  // Expand all parent groups
  expandParentGroups(layer)
  
  // Scroll to layer in next tick after expanding groups
  nextTick(() => {
    scrollToLayer(layer)
  })
  
  drawCanvas()
}

const expandParentGroups = (layer: Node) => {
  if (!psdData.value) return
  
  // Find path from root to layer
  const findPath = (node: Node, target: Node, path: Node[] = []): Node[] | null => {
    if ((node as any).__uniqueId === (target as any).__uniqueId) {
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

const isLayerVisible = (layer: Node, debug: boolean = false): boolean => {
  if (!psdData.value) return false
  
  const layerId = (layer as any).__uniqueId
  
  // Check layer visibility from reactive storage
  if (layerVisibility.value.get(layerId) === false) {
    return false
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
      return false
    }
    
    current = parent
    parent = findParent(psdData.value, current)
  }
  
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
  
  const collectLayersAtPoint = (layers: Node[] | undefined, x: number, y: number) => {
    if (!layers) return
    
    for (const layer of layers) {
      if (layer.children && layer.children.length > 0) {
        collectLayersAtPoint(layer.children, x, y)
      }
      
      if (layer.type === 'Layer' && layer.opacity > 0) {
        const left = layer.left ?? 0
        const top = layer.top ?? 0
        const width = layer.width ?? 0
        const height = layer.height ?? 0
        
        if (width > 0 && height > 0 && x >= left && x <= left + width && y >= top && y <= top + height) {
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
  
  const collectLayersAtPoint = (layers: Node[] | undefined, x: number, y: number) => {
    if (!layers) return
    
    for (const layer of layers) {
      if (layer.children && layer.children.length > 0) {
        collectLayersAtPoint(layer.children, x, y)
      }
      
      if (layer.type === 'Layer' && layer.opacity > 0 && isLayerVisible(layer)) {
        const left = layer.left ?? 0
        const top = layer.top ?? 0
        const width = layer.width ?? 0
        const height = layer.height ?? 0
        
        if (width > 0 && height > 0 && x >= left && x <= left + width && y >= top && y <= top + height) {
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
    // Determine layer under cursor for measurements
    updateHoverLayer(event.clientX, event.clientY)
  }
}

const handleMouseUp = () => {
  isDragging.value = false
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.code === 'Space' && !isSpacePressed.value) {
    event.preventDefault()
    isSpacePressed.value = true
  } else if (event.code === 'KeyS') {
    currentTool.value = 'select'
  } else if (event.code === 'KeyH') {
    currentTool.value = 'hand'
  }
}

const handleKeyUp = (event: KeyboardEvent) => {
  if (event.code === 'Space') {
    event.preventDefault()
    isSpacePressed.value = false
  }
}

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
  top: 20px;
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
  top: 20px;
  left: 20px;
  width: 280px;
  max-height: calc(100vh - 40px);
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
  top: 20px;
  right: 20px;
  width: 300px;
  max-height: calc(100vh - 40px);
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
  bottom: 20px;
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
