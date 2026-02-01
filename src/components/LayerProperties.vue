<template>
  <div class="properties">
    <div class="property-section">
      <div class="section-header">
        <h4>{{ layer.name }}</h4>
      </div>
    </div>

    <div class="property-section">
      <div class="section-header-with-copy">
        <h4>CSS Properties</h4>
        <button class="copy-icon-btn" @click="copyAllCss" title="Copy all CSS">
          📋
        </button>
      </div>
      <div class="css-code" @mouseup="handleCssSelection">
        <pre>{{ cssCode }}</pre>
        <div class="copy-notification" :class="{ show: showCopyCssNotification }">
          Copied to clipboard
        </div>
      </div>
    </div>

    <div class="property-section" v-if="textInfo">
      <div class="section-header-with-copy">
        <h4>Text Content</h4>
        <button class="copy-icon-btn" @click="copyTextContent" title="Copy text">
          📋
        </button>
      </div>
      <div class="text-content-wrapper">
        <pre class="text-content">{{ textInfo }}</pre>
        <div class="copy-notification" :class="{ show: showCopyTextNotification }">
          Copied to clipboard
        </div>
      </div>
    </div>

    <div class="property-section">
      <h4>Export</h4>
      
      <!-- Layer Preview -->
      <div class="layer-preview" v-if="layerCanvas || isVectorLayer || isVectorSmartObject">
        <canvas v-if="layerCanvas" ref="previewCanvas" class="preview-canvas"></canvas>
        <div v-else-if="isVectorSmartObject" class="vector-layer-notice">
          Vector Smart Object<br>
          <small>Contains embedded vector file (AI/PDF/SVG)</small><br>
          <small style="color: #42b983;">Exporting as rasterized SVG</small>
        </div>
        <div v-else class="vector-layer-notice">
          Vector shape layer<br>
          <small>Export as SVG to get vector data</small>
        </div>
      </div>
      
      <div class="export-list">
        <div v-for="(item, index) in exportItems" :key="index" class="export-item">
          <select v-model="item.scale" class="export-select" :disabled="item.format === 'svg'">
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="3">3x</option>
            <option value="4">4x</option>
          </select>
          
          <select v-model="item.format" class="export-select" @change="handleFormatChange(item)">
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="svg">SVG</option>
          </select>
          
          <button 
            class="export-remove-btn" 
            @click="removeExportItem(index)" 
            v-if="exportItems.length > 1"
            title="Remove"
          >
            ✕
          </button>
        </div>
      </div>
      
      <div class="export-actions">
        <button class="add-export-btn" @click="addExportItem">
          Add
        </button>
        <button class="export-all-btn" @click="exportAll">
          Export
        </button>
      </div>
    </div>

    <div class="property-section">
      <h4>Debug Info</h4>
      <details>
        <summary style="cursor: pointer; color: #999; margin-bottom: 8px;">Show raw layer data</summary>
        <div class="debug-content">
          <pre>{{ debugData }}</pre>
        </div>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import type { Layer } from 'ag-psd'

const props = defineProps<{
  layer: Layer
}>()

const showCopyCssNotification = ref(false)
const showCopyTextNotification = ref(false)
const previewCanvas = ref<HTMLCanvasElement>()

const layerCanvas = computed(() => (props.layer as any).canvas)
const isVectorLayer = computed(() => {
  const layer = props.layer as any
  return layer.vectorMask?.paths && layer.vectorMask.paths.length > 0
})
const isVectorSmartObject = computed(() => {
  const layer = props.layer as any
  return layer.placedLayer?.type === 'vector'
})

// Draw preview when layer changes
watch([layerCanvas, previewCanvas], () => {
  if (!layerCanvas.value || !previewCanvas.value) return
  
  nextTick(() => {
    drawPreview()
  })
}, { immediate: true })

const drawPreview = () => {
  if (!layerCanvas.value || !previewCanvas.value) return
  
  const canvas = previewCanvas.value
  const sourceCanvas = layerCanvas.value
  
  // Calculate preview size (max 268px width, max 176px height)
  const maxWidth = 268
  const maxHeight = 176
  const scaleX = maxWidth / sourceCanvas.width
  const scaleY = maxHeight / sourceCanvas.height
  const scale = Math.min(1, scaleX, scaleY)
  
  const previewWidth = Math.floor(sourceCanvas.width * scale)
  const previewHeight = Math.floor(sourceCanvas.height * scale)
  
  canvas.width = previewWidth
  canvas.height = previewHeight
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  // Draw scaled layer
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(sourceCanvas, 0, 0, previewWidth, previewHeight)
}

interface ExportItem {
  scale: string
  format: string
}

const exportItems = ref<ExportItem[]>([
  { scale: '1', format: 'png' }
])

// Helper function to convert RGB to HEX
const rgbToHex = (r: number, g: number, b: number): string => {
  const toHex = (n: number) => {
    const hex = Math.round(n).toString(16).padStart(2, '0')
    return hex
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

const textInfo = computed(() => {
  if (props.layer.text) {
    return props.layer.text.text || null
  }
  return null
})

const debugData = computed(() => {
  const layer = props.layer as any
  
  // Output ALL properties of the layer
  return JSON.stringify(layer, null, 2)
})

const cssCode = computed(() => {
  const layer = props.layer
  const regularCss: string[] = []
  const absoluteCss: string[] = []
  
  // Size
  const width = layer.right - layer.left
  const height = layer.bottom - layer.top
  if (width && height) {
    regularCss.push(`width: ${width}px;`)
    regularCss.push(`height: ${height}px;`)
  }
  
  // Background color from effects or vector fill
  let backgroundColor: string | null = null
  let hasFill = false
  
  // Check for solid color fill in effects
  if (layer.effects?.solidFill && layer.effects.solidFill.length > 0) {
    const fill = layer.effects.solidFill[0]
    if (fill.enabled !== false && fill.color) {
      hasFill = true
      const r = Math.round(fill.color.r || 0)
      const g = Math.round(fill.color.g || 0)
      const b = Math.round(fill.color.b || 0)
      backgroundColor = rgbToHex(r, g, b)
    }
  }
  
  // Check for color overlay
  if (!backgroundColor && layer.effects?.colorOverlay && layer.effects.colorOverlay.length > 0) {
    const overlay = layer.effects.colorOverlay[0]
    if (overlay.enabled !== false && overlay.color) {
      hasFill = true
      const r = Math.round(overlay.color.r || 0)
      const g = Math.round(overlay.color.g || 0)
      const b = Math.round(overlay.color.b || 0)
      backgroundColor = rgbToHex(r, g, b)
    }
  }
  
  // Check for vector fill color
  if (!backgroundColor && layer.vectorFill?.type === 'color' && layer.vectorFill.color) {
    hasFill = true
    const color = layer.vectorFill.color
    const r = Math.round(color.r || 0)
    const g = Math.round(color.g || 0)
    const b = Math.round(color.b || 0)
    backgroundColor = rgbToHex(r, g, b)
  }
  
  // Only add background-color if fill is enabled and fillOpacity > 0
  const fillOp = layer.fillOpacity !== undefined ? (layer.fillOpacity > 1 ? layer.fillOpacity / 255 : layer.fillOpacity) : 1
  if (backgroundColor && hasFill && fillOp > 0) {
    regularCss.push(`background-color: ${backgroundColor};`)
  }
  
  // Text styles
  if (layer.text) {
    const text = layer.text
    
    // Font
    if (text.style?.font) {
      regularCss.push(`font-family: "${text.style.font.name}";`)
    }
    
    // Font size
    if (text.style?.fontSize) {
      regularCss.push(`font-size: ${Math.round(text.style.fontSize)}px;`)
    }
    
    // Color
    if (text.style?.fillColor) {
      const color = text.style.fillColor
      regularCss.push(`color: ${rgbToHex(color.r, color.g, color.b)};`)
    }
    
    // Line height
    if (text.style?.leading) {
      regularCss.push(`line-height: ${Math.round(text.style.leading)}px;`)
    }
    
    // Letter spacing
    if (text.style?.tracking) {
      const letterSpacing = (text.style.tracking / 1000).toFixed(3)
      regularCss.push(`letter-spacing: ${letterSpacing}em;`)
    }
    
    // Text align
    if (text.paragraphStyle?.align) {
      regularCss.push(`text-align: ${text.paragraphStyle.align};`)
    }
  }
  
  // Opacity (check both opacity and fillOpacity)
  let finalOpacity = 1
  let layerOpacity = 1
  
  if (layer.opacity !== undefined) {
    // ag-psd uses 0-255 range for opacity
    layerOpacity = layer.opacity > 1 ? layer.opacity / 255 : layer.opacity
    finalOpacity = layerOpacity
  }
  
  // fillOpacity affects only fill, not the whole layer
  // Don't include fillOpacity in CSS opacity - it only affects background-color
  
  if (finalOpacity < 1) {
    regularCss.push(`opacity: ${finalOpacity.toFixed(2)};`)
  }
  
  // Blend mode
  if (layer.blendMode && layer.blendMode !== 'normal' && layer.blendMode !== 'pass through') {
    regularCss.push(`mix-blend-mode: ${layer.blendMode};`)
  }
  
  // Layer effects from ag-psd
  if (layer.effects) {
    const effects: string[] = []
    
    // Drop Shadow
    if (layer.effects.dropShadow && layer.effects.dropShadow.length > 0) {
      layer.effects.dropShadow.forEach((shadow: any) => {
        if (shadow.enabled !== false) {
          const angle = (shadow.angle || 0) * Math.PI / 180
          const distance = typeof shadow.distance === 'object' ? (shadow.distance.value || 0) : (shadow.distance || 0)
          const size = typeof shadow.size === 'object' ? (shadow.size.value || 0) : (shadow.size || 0)
          const opacity = (shadow.opacity !== undefined ? shadow.opacity : 1)
          
          const offsetX = Math.round(Math.cos(angle) * distance)
          const offsetY = Math.round(Math.sin(angle) * distance)
          
          const color = shadow.color || { r: 0, g: 0, b: 0 }
          const r = Math.round(color.r || 0)
          const g = Math.round(color.g || 0)
          const b = Math.round(color.b || 0)
          
          effects.push(`${offsetX}px ${offsetY}px ${size}px rgba(${r}, ${g}, ${b}, ${opacity.toFixed(2)})`)
        }
      })
    }
    
    // Inner Shadow
    if (layer.effects.innerShadow && layer.effects.innerShadow.length > 0) {
      layer.effects.innerShadow.forEach((shadow: any) => {
        if (shadow.enabled !== false) {
          const angle = (shadow.angle || 0) * Math.PI / 180
          const distance = typeof shadow.distance === 'object' ? (shadow.distance.value || 0) : (shadow.distance || 0)
          const size = typeof shadow.size === 'object' ? (shadow.size.value || 0) : (shadow.size || 0)
          const opacity = (shadow.opacity !== undefined ? shadow.opacity : 1)
          
          const offsetX = Math.round(Math.cos(angle) * distance)
          const offsetY = Math.round(Math.sin(angle) * distance)
          
          const color = shadow.color || { r: 0, g: 0, b: 0 }
          const r = Math.round(color.r || 0)
          const g = Math.round(color.g || 0)
          const b = Math.round(color.b || 0)
          
          effects.push(`inset ${offsetX}px ${offsetY}px ${size}px rgba(${r}, ${g}, ${b}, ${opacity.toFixed(2)})`)
        }
      })
    }
    
    if (effects.length > 0) {
      regularCss.push(`box-shadow: ${effects.join(', ')};`)
    }
    
    // Stroke/Border
    if (layer.effects.stroke && layer.effects.stroke.length > 0) {
      const stroke = layer.effects.stroke[0]
      if (stroke.enabled !== false) {
        const size = typeof stroke.size === 'object' ? (stroke.size.value || 1) : (stroke.size || 1)
        const opacity = (stroke.opacity !== undefined ? stroke.opacity : 1)
        const color = stroke.color || { r: 0, g: 0, b: 0 }
        const r = Math.round(color.r || 0)
        const g = Math.round(color.g || 0)
        const b = Math.round(color.b || 0)
        
        if (opacity < 1) {
          regularCss.push(`border: ${size}px solid rgba(${r}, ${g}, ${b}, ${opacity.toFixed(2)});`)
        } else {
          regularCss.push(`border: ${size}px solid ${rgbToHex(r, g, b)};`)
        }
      }
    }
    
    // Border radius - check vector mask data or additional layer info
    // ag-psd stores rounded corners in vectorMask or additionalInfo
    if (layer.vectorMask?.paths) {
      // If has vector mask with rounded corners, add border-radius
      regularCss.push(`border-radius: 10px;`)
    } else if (layer.additionalInfo?.['lrFX']) {
      // Check for rounded corners in layer effects
      regularCss.push(`border-radius: 10px;`)
    }
  }
  
  // Check for vector shape with rounded corners (outside effects)
  if (layer.vectorMask?.paths && !layer.effects) {
    regularCss.push(`border-radius: 10px;`)
  }
  
  // Position (absolute positioning - в конце через перенос строки)
  if (layer.left !== undefined && layer.top !== undefined) {
    absoluteCss.push(`position: absolute;`)
    absoluteCss.push(`left: ${layer.left}px;`)
    absoluteCss.push(`top: ${layer.top}px;`)
  }
  
  // Combine regular and absolute CSS with separator
  const result: string[] = []
  
  if (regularCss.length > 0) {
    result.push(regularCss.join('\n'))
  }
  
  if (absoluteCss.length > 0) {
    if (result.length > 0) {
      result.push('') // Empty line separator
    }
    result.push(absoluteCss.join('\n'))
  }
  
  return result.length > 0 ? result.join('\n') : '/* No CSS properties available */'
})

const handleCssSelection = async () => {
  const selection = window.getSelection()
  const selectedText = selection?.toString().trim()
  
  if (selectedText && selectedText.length > 0) {
    try {
      await navigator.clipboard.writeText(selectedText)
      
      // Clear selection
      selection?.removeAllRanges()
      
      // Show notification
      showCopyCssNotification.value = true
      setTimeout(() => {
        showCopyCssNotification.value = false
      }, 1500)
    } catch (err) {
      console.error('Failed to copy CSS:', err)
    }
  }
}

const copyAllCss = async () => {
  try {
    await navigator.clipboard.writeText(cssCode.value)
    showCopyCssNotification.value = true
    setTimeout(() => {
      showCopyCssNotification.value = false
    }, 1500)
  } catch (err) {
    console.error('Failed to copy CSS:', err)
  }
}

const copyTextContent = async () => {
  try {
    await navigator.clipboard.writeText(textInfo.value || '')
    showCopyTextNotification.value = true
    setTimeout(() => {
      showCopyTextNotification.value = false
    }, 1500)
  } catch (err) {
    console.error('Failed to copy text:', err)
  }
}

const addExportItem = () => {
  exportItems.value.push({ scale: '1', format: 'png' })
}

const removeExportItem = (index: number) => {
  exportItems.value.splice(index, 1)
}

const handleFormatChange = (item: ExportItem) => {
  // Reset scale to 1x when SVG is selected
  if (item.format === 'svg') {
    item.scale = '1'
  }
}

const exportAll = async () => {
  const layer = props.layer as any
  const layerCanvas = layer.canvas
  const isVectorLayer = layer.vectorMask?.paths && layer.vectorMask.paths.length > 0
  const isVectorSmartObject = layer.placedLayer?.type === 'vector'
  
  if (!layerCanvas && !isVectorLayer) {
    alert('This layer has no image data to export')
    return
  }
  
  for (const item of exportItems.value) {
    const scale = parseFloat(item.scale)
    const format = item.format
    
    if (format === 'svg') {
      // Check if this is a vector shape layer
      const vectorMask = layer.vectorMask
      const vectorFill = layer.vectorFill
      const vectorStroke = layer.vectorStroke
      
      // Get dimensions from vectorOrigination if available
      let width, height, offsetX = 0, offsetY = 0
      if (layer.vectorOrigination?.keyDescriptorList?.[0]?.keyOriginShapeBoundingBox) {
        const bbox = layer.vectorOrigination.keyDescriptorList[0].keyOriginShapeBoundingBox
        offsetX = bbox.left.value
        offsetY = bbox.top.value
        width = bbox.right.value - bbox.left.value
        height = bbox.bottom.value - bbox.top.value
      } else {
        width = (props.layer.right || 0) - (props.layer.left || 0)
        height = (props.layer.bottom || 0) - (props.layer.top || 0)
      }
      
      // Try to convert vector paths to SVG
      if (vectorMask?.paths && vectorMask.paths.length > 0) {
        try {
          let pathData = ''
          
          for (const path of vectorMask.paths) {
            if (path.knots && path.knots.length > 0) {
              const knots = path.knots
              
              // Start path at first knot
              const firstKnot = knots[0]
              pathData += `M ${firstKnot.points[0]} ${firstKnot.points[1]} `
              
              // Add cubic bezier curves for each segment
              for (let i = 0; i < knots.length; i++) {
                const currentKnot = knots[i]
                const nextKnot = knots[(i + 1) % knots.length]
                
                // Control point 1 (leaving current knot)
                const cp1x = currentKnot.points[2]
                const cp1y = currentKnot.points[3]
                
                // Control point 2 (entering next knot)
                const cp2x = nextKnot.points[4]
                const cp2y = nextKnot.points[5]
                
                // End point (next knot position)
                const x = nextKnot.points[0]
                const y = nextKnot.points[1]
                
                pathData += `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x} ${y} `
              }
              
              if (!path.open) {
                pathData += 'Z '
              }
            }
          }
          
          // Get fill color
          let fillColor = 'none'
          let fillOpacity = 1
          if (vectorFill?.type === 'color' && vectorFill.color) {
            const r = Math.round(vectorFill.color.r || 0)
            const g = Math.round(vectorFill.color.g || 0)
            const b = Math.round(vectorFill.color.b || 0)
            fillColor = `rgb(${r}, ${g}, ${b})`
          }
          
          // Get stroke
          let strokeColor = 'none'
          let strokeWidth = 0
          if (vectorStroke?.strokeEnabled && vectorStroke.content) {
            strokeWidth = vectorStroke.lineWidth?.value || 1
            if (vectorStroke.content.type === 'color' && vectorStroke.content.color) {
              const r = Math.round(vectorStroke.content.color.r || 0)
              const g = Math.round(vectorStroke.content.color.g || 0)
              const b = Math.round(vectorStroke.content.color.b || 0)
              strokeColor = `rgb(${r}, ${g}, ${b})`
            }
          }
          
          // Get layer opacity
          const layerOpacity = props.layer.opacity !== undefined ? props.layer.opacity : 1
          
          // Adjust paths to be relative to bounding box
          const adjustedPathData = pathData.trim()
          
          const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="${offsetX} ${offsetY} ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <path d="${adjustedPathData}" fill="${fillColor}" fill-opacity="${fillOpacity * layerOpacity}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="${layerOpacity}" />
</svg>`
          
          const blob = new Blob([svgContent], { type: 'image/svg+xml' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          const fileName = `${props.layer.name || 'layer'}.svg`
          a.href = url
          a.download = fileName
          a.click()
          URL.revokeObjectURL(url)
          
          await new Promise(resolve => setTimeout(resolve, 100))
          continue
        } catch (e) {
          console.error('Failed to convert vector paths to SVG:', e)
        }
      }
      
      // Fallback: export as SVG with embedded PNG (if canvas exists)
      if (layerCanvas) {
        const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <image width="${width}" height="${height}" xlink:href="${layerCanvas.toDataURL('image/png')}" />
</svg>`
        
        const blob = new Blob([svgContent], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const fileName = `${props.layer.name || 'layer'}.svg`
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
      continue
    }
    
    // For raster formats, we need canvas
    if (!layerCanvas) {
      console.warn('Skipping raster export for vector-only layer')
      continue
    }
    
    // Create scaled canvas for raster formats
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = layerCanvas.width * scale
    exportCanvas.height = layerCanvas.height * scale
    
    const ctx = exportCanvas.getContext('2d')
    if (!ctx) continue
    
    // Draw scaled image
    ctx.scale(scale, scale)
    ctx.drawImage(layerCanvas, 0, 0)
    
    // Export based on format
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
    const quality = format === 'jpg' ? 0.9 : undefined
    
    exportCanvas.toBlob((blob) => {
      if (!blob) return
      
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const fileName = `${props.layer.name || 'layer'}_${scale}x.${format}`
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    }, mimeType, quality)
    
    // Small delay between downloads
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

const copyCss = async () => {
  try {
    await navigator.clipboard.writeText(cssCode.value)
  } catch (err) {
    console.error('Failed to copy CSS:', err)
  }
}
</script>

<style scoped>
.properties {
  font-size: 13px;
}

.property-section {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.property-section:last-child {
  border-bottom: none;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.section-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: white;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-preview {
  margin-bottom: 12px;
  background-image: 
    linear-gradient(45deg, #e0e0e0 25%, transparent 25%),
    linear-gradient(-45deg, #e0e0e0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e0e0e0 75%),
    linear-gradient(-45deg, transparent 75%, #e0e0e0 75%);
  background-size: 12px 12px;
  background-position: 0 0, 0 6px, 6px -6px, -6px 0px;
  background-color: #f5f5f5;
  border-radius: 6px;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  max-height: 200px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.preview-canvas {
  display: block;
  max-width: 100%;
  max-height: 176px;
  object-fit: contain;
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
}

.vector-layer-notice {
  color: #999;
  font-size: 12px;
  text-align: center;
  padding: 20px;
}

.vector-layer-notice small {
  font-size: 11px;
  color: #666;
}

.export-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.export-item {
  display: flex;
  gap: 6px;
  align-items: center;
}

.export-select {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.export-select:first-child {
  width: 60px;
}

.export-select:nth-child(2) {
  flex: 1;
}

.export-select:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

.export-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.export-remove-btn {
  background: rgba(255, 59, 48, 0.2);
  border: 1px solid rgba(255, 59, 48, 0.3);
  color: #ff3b30;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  padding: 0;
}

.export-remove-btn:hover {
  background: rgba(255, 59, 48, 0.3);
}

.export-actions {
  display: flex;
  gap: 8px;
}

.add-export-btn {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.add-export-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.export-all-btn {
  flex: 1;
  background: rgba(66, 185, 131, 0.2);
  border: 1px solid #42b983;
  color: #42b983;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s;
}

.export-all-btn:hover {
  background: rgba(66, 185, 131, 0.3);
}

h4 {
  margin: 0 0 12px 0;
  font-size: 12px;
  font-weight: 600;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-header-with-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-header-with-copy h4 {
  margin: 0;
}

.copy-icon-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  padding: 0;
}

.copy-icon-btn:hover {
  background: rgba(66, 185, 131, 0.2);
  border-color: #42b983;
}

.copy-icon-btn:active {
  transform: scale(0.95);
}

.css-code {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 12px;
  max-height: 400px;
  overflow-y: auto;
  user-select: text;
  cursor: text;
  position: relative;
}

.css-code .copy-notification {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 11px;
  color: #42b983;
  background: rgba(30, 30, 30, 0.98);
  border: 1px solid #42b983;
  border-radius: 4px;
  padding: 8px 16px;
  opacity: 0;
  transition: opacity 0.2s;
  text-align: center;
  z-index: 100;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
}

.css-code .copy-notification.show {
  opacity: 1;
}

.css-code::selection,
.css-code pre::selection {
  background: rgba(66, 185, 131, 0.3);
  color: white;
}

.css-code pre {
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #a8e6cf;
  white-space: pre-wrap;
  word-break: break-all;
}

.copy-btn {
  width: 100%;
  background: rgba(66, 185, 131, 0.2);
  border: 1px solid #42b983;
  color: #42b983;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s;
}

.copy-btn:hover {
  background: rgba(66, 185, 131, 0.3);
}

.copy-btn:active {
  transform: scale(0.98);
}

.copy-btn {
  width: 100%;
  background: rgba(66, 185, 131, 0.2);
  border: 1px solid #42b983;
  color: #42b983;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s;
  display: none;
}

.copy-btn:hover {
  background: rgba(66, 185, 131, 0.3);
}

.copy-btn:active {
  transform: scale(0.98);
}

.text-content-wrapper {
  position: relative;
}

.text-content {
  font-family: monospace;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 12px;
  border-radius: 6px;
  max-height: 200px;
  overflow-y: auto;
  color: white;
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.text-content-wrapper .copy-notification {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 11px;
  color: #42b983;
  background: rgba(30, 30, 30, 0.98);
  border: 1px solid #42b983;
  border-radius: 4px;
  padding: 8px 16px;
  opacity: 0;
  transition: opacity 0.2s;
  text-align: center;
  z-index: 100;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
}

.text-content-wrapper .copy-notification.show {
  opacity: 1;
}

.debug-content {
  font-family: monospace;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 12px;
  border-radius: 6px;
  max-height: 400px;
  overflow-y: auto;
  font-size: 11px;
  line-height: 1.4;
}

.debug-content pre {
  margin: 0;
  color: #a8e6cf;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
