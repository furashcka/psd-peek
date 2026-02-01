<template>
  <div class="properties">
    <div class="property-section">
      <div class="section-header">
        <h4>{{ layer.name }}</h4>
        <span class="layer-type">{{ layer.type }}</span>
      </div>
    </div>

    <div class="property-section">
      <h4>CSS Properties</h4>
      <div class="css-code">
        <pre>{{ cssCode }}</pre>
      </div>
      <button class="copy-btn" @click="copyCss">Copy CSS</button>
    </div>

    <div class="property-section" v-if="textInfo">
      <h4>Text Content</h4>
      <div class="text-content">{{ textInfo }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Node } from '@webtoon/psd'

const props = defineProps<{
  layer: Node
}>()

const textInfo = computed(() => {
  if (props.layer.type === 'Text' && props.layer.text) {
    return props.layer.text.value || 'No text'
  }
  return null
})

const cssCode = computed(() => {
  const layer = props.layer
  const css: string[] = []
  
  // Size
  if (layer.width && layer.height) {
    css.push(`width: ${layer.width}px;`)
    css.push(`height: ${layer.height}px;`)
  }
  
  // Border radius для векторных фигур с закругленными углами
  if (layer.additionalProperties?.vogk) {
    const vogk = layer.additionalProperties.vogk
    // vogk содержит информацию о закругленных углах
    // Это сложная структура, пока пропустим
    css.push(`/* rounded corners detected */`)
  }
  
  // Background color - пробуем получить из разных мест
  if (layer.additionalProperties) {
    const props = layer.additionalProperties
    
    // Solid Color Fill (SoCo)
    if (props.SoCo) {
      const color = props.SoCo['Clr ']
      if (color) {
        const r = Math.round(color['Rd  '] || 0)
        const g = Math.round(color['Grn '] || 0)
        const b = Math.round(color['Bl  '] || 0)
        css.push(`background-color: rgb(${r}, ${g}, ${b});`)
      }
    }
    
    // Vector stroke/fill
    if (props.vstk?.data?.descriptor?.items) {
      const items = props.vstk.data.descriptor.items
      const fillEnabled = items.get('fillEnabled')
      
      if (fillEnabled) {
        const fillColor = items.get('fillColor')
        if (fillColor?.items) {
          const colorItems = fillColor.items
          const r = Math.round(colorItems.get('Rd  ') || 0)
          const g = Math.round(colorItems.get('Grn ') || 0)
          const b = Math.round(colorItems.get('Bl  ') || 0)
          css.push(`background-color: rgb(${r}, ${g}, ${b});`)
        }
      }
    }
    
    // Gradient Fill (GdFl)
    if (props.GdFl) {
      css.push(`/* gradient fill - not yet supported */`)
    }
    
    // Pattern Fill (PtFl)
    if (props.PtFl) {
      css.push(`/* pattern fill - not yet supported */`)
    }
  }
  
  // Opacity
  if (layer.opacity !== undefined && layer.opacity < 255) {
    const opacityValue = (layer.opacity / 255).toFixed(2)
    css.push(`opacity: ${opacityValue};`)
  }
  
  // Blend mode
  if (layer.blendMode && layer.blendMode !== 'normal') {
    const blendModeMap: Record<string, string> = {
      'multiply': 'multiply',
      'screen': 'screen',
      'overlay': 'overlay',
      'darken': 'darken',
      'lighten': 'lighten',
      'colorDodge': 'color-dodge',
      'colorBurn': 'color-burn',
      'hardLight': 'hard-light',
      'softLight': 'soft-light',
      'difference': 'difference',
      'exclusion': 'exclusion',
      'hue': 'hue',
      'saturation': 'saturation',
      'color': 'color',
      'luminosity': 'luminosity'
    }
    const cssBlendMode = blendModeMap[layer.blendMode] || layer.blendMode
    css.push(`mix-blend-mode: ${cssBlendMode};`)
  }
  
  // Для текстовых слоев - базовая информация
  if (layer.type === 'Layer' && typeof layer.text === 'string') {
    css.push(`/* Text layer */`)
    css.push(`/* Content: "${layer.text.substring(0, 50)}${layer.text.length > 50 ? '...' : ''}" */`)
  }
  
  return css.length > 0 ? css.join('\n') : '/* No CSS properties available */'
})

const copyCss = async () => {
  try {
    await navigator.clipboard.writeText(cssCode.value)
    console.log('CSS copied to clipboard')
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

.layer-type {
  font-size: 11px;
  color: #999;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

h4 {
  margin: 0 0 12px 0;
  font-size: 12px;
  font-weight: 600;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.css-code {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 8px;
  max-height: 400px;
  overflow-y: auto;
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
}
</style>
