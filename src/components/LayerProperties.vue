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
import { computed } from 'vue'
import type { Node } from '@webtoon/psd'

const props = defineProps<{
  layer: Node
}>()

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
    if (typeof props.layer.text === 'string') {
      return props.layer.text
    } else if (typeof props.layer.text === 'object' && props.layer.text.value) {
      return props.layer.text.value
    }
  }
  return null
})

const debugData = computed(() => {
  const layer = props.layer as any
  const safeData: any = {
    name: layer.name,
    type: layer.type,
    width: layer.width,
    height: layer.height,
    left: layer.left,
    top: layer.top,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    text: layer.text,
    additionalProperties: {},
    layerFrame: null
  }
  
  // Копируем additionalProperties без циклических ссылок
  if (layer.additionalProperties) {
    for (const key in layer.additionalProperties) {
      try {
        const value = layer.additionalProperties[key]
        // Пропускаем функции и сложные объекты
        if (typeof value !== 'function') {
          safeData.additionalProperties[key] = value
        }
      } catch (e) {
        safeData.additionalProperties[key] = '[Error reading property]'
      }
    }
  }
  
  // Добавляем layerFrame если есть
  if (layer.layerFrame) {
    try {
      const frame: any = {}
      // Копируем все ключи из layerFrame
      for (const key in layer.layerFrame) {
        if (typeof layer.layerFrame[key] !== 'function' && key !== 'parent') {
          frame[key] = layer.layerFrame[key]
        }
      }
      safeData.layerFrame = frame
      
      // Также добавляем информацию о том, какие ключи доступны
      safeData.layerFrameKeys = Object.keys(layer.layerFrame).filter(k => typeof layer.layerFrame[k] !== 'function')
    } catch (e) {
      safeData.layerFrame = '[Error reading layerFrame]'
    }
  }
  
  return JSON.stringify(safeData, null, 2)
})

const cssCode = computed(() => {
  const layer = props.layer
  const regularCss: string[] = []
  const absoluteCss: string[] = []
  
  // Size
  if (layer.width && layer.height) {
    regularCss.push(`width: ${layer.width}px;`)
    regularCss.push(`height: ${layer.height}px;`)
  }
  
  // Background color - пробуем получить из разных мест
  if (layer.additionalProperties) {
    const props = layer.additionalProperties
    
    // Пробуем получить из layerFrame
    const layerFrame = (layer as any).layerFrame
    if (layerFrame?.layerProperties) {
      const layerProps = layerFrame.layerProperties
      
      // Fill color
      if (layerProps.fillColor) {
        const color = layerProps.fillColor
        if (Array.isArray(color)) {
          const r = Math.round(color[0])
          const g = Math.round(color[1])
          const b = Math.round(color[2])
          const a = color[3] !== undefined ? color[3] / 255 : 1
          if (a < 1) {
            regularCss.push(`background-color: rgba(${r}, ${g}, ${b}, ${a.toFixed(2)});`)
          } else {
            regularCss.push(`background-color: ${rgbToHex(r, g, b)};`)
          }
        }
      }
      
      // Border/Stroke
      if (layerProps.strokeColor && layerProps.strokeWidth) {
        const color = layerProps.strokeColor
        if (Array.isArray(color)) {
          const r = Math.round(color[0])
          const g = Math.round(color[1])
          const b = Math.round(color[2])
          const a = color[3] !== undefined ? color[3] / 255 : 1
          const width = layerProps.strokeWidth
          if (a < 1) {
            regularCss.push(`border: ${width}px solid rgba(${r}, ${g}, ${b}, ${a.toFixed(2)});`)
          } else {
            regularCss.push(`border: ${width}px solid ${rgbToHex(r, g, b)};`)
          }
        }
      }
      
      // Border radius
      if (layerProps.borderRadius) {
        regularCss.push(`border-radius: ${Math.round(layerProps.borderRadius)}px;`)
      }
    }
    
    // Solid Color Fill (SoCo)
    if (props.SoCo) {
      const color = props.SoCo['Clr ']
      if (color) {
        const r = Math.round(color['Rd  '] || 0)
        const g = Math.round(color['Grn '] || 0)
        const b = Math.round(color['Bl  '] || 0)
        regularCss.push(`background-color: ${rgbToHex(r, g, b)};`)
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
          regularCss.push(`background-color: ${rgbToHex(r, g, b)};`)
        }
      }
      
      // Stroke
      const strokeEnabled = items.get('strokeEnabled')
      if (strokeEnabled) {
        const strokeColor = items.get('strokeStyleContent')?.items?.get('Clr ')
        if (strokeColor) {
          const r = Math.round(strokeColor['Rd  '] || 0)
          const g = Math.round(strokeColor['Grn '] || 0)
          const b = Math.round(strokeColor['Bl  '] || 0)
          const strokeWidth = items.get('strokeStyleLineWidth') || 1
          regularCss.push(`border: ${strokeWidth}px solid ${rgbToHex(r, g, b)};`)
        }
      }
    }
    
    // Пробуем получить stroke из lfx2 (Layer Effects 2)
    if (props.lfx2?.descriptor?.items) {
      const lfxItems = props.lfx2.descriptor.items
      
      // Ищем FrFX (Frame Effect / Stroke)
      const frameFX = lfxItems.get('FrFX')
      if (frameFX?.items) {
        const enabled = frameFX.items.get('enab')
        if (enabled !== false) {
          const size = frameFX.items.get('Sz  ') || frameFX.items.get('size')
          const color = frameFX.items.get('Clr ')
          const opacity = frameFX.items.get('Opct') || 100
          
          if (size && color) {
            const r = Math.round(color['Rd  '] || 0)
            const g = Math.round(color['Grn '] || 0)
            const b = Math.round(color['Bl  '] || 0)
            const opacityValue = opacity / 100
            
            if (opacityValue < 1) {
              regularCss.push(`border: ${size}px solid rgba(${r}, ${g}, ${b}, ${opacityValue.toFixed(2)});`)
            } else {
              regularCss.push(`border: ${size}px solid ${rgbToHex(r, g, b)};`)
            }
          }
        }
      }
    }
    
    // Если vstk пустой, но это векторный слой, попробуем найти белый фон
    if (props.vstk && !regularCss.some(css => css.includes('background'))) {
      // Для векторных слоев проверяем наличие vsms (vector shape)
      if (props.vsms) {
        // Проверяем fill в pathRecords
        const hasFill = props.vsms.pathRecords?.some((record: any) => record.fill === true)
        
        if (hasFill) {
          // Это векторная фигура с заливкой
          regularCss.push(`background-color: #ffffff;`)
        }
      }
    }
    
    // Border radius для векторных фигур с закругленными углами
    if (props.vogk?.data) {
      const vogkData = props.vogk.data
      // Ищем паттерн "radii" в байтах (114, 97, 100, 105, 105)
      // или "topRight" (116, 111, 112, 82, 105, 103, 104, 116)
      
      let foundRadius = false
      for (let i = 0; i < vogkData.length - 20; i++) {
        // Ищем "topRight" или "topLeft"
        if (vogkData[i] === 116 && vogkData[i+1] === 111 && vogkData[i+2] === 112) {
          // Нашли "top..." - после этого идет значение радиуса
          // Значение обычно в формате double (8 байт) после ключа
          // Пропускаем название ключа и ищем double значение
          
          // Ищем паттерн "UntF#Pxl" (85, 110, 116, 70, 35, 80, 120, 108)
          // После этого идет double значение радиуса
          for (let j = i; j < Math.min(i + 50, vogkData.length - 8); j++) {
            if (vogkData[j] === 85 && vogkData[j+1] === 110 && vogkData[j+2] === 116 && vogkData[j+3] === 70) {
              // Нашли UntF - после этого идет значение
              // Пропускаем "#Pxl" (4 байта) и читаем double (8 байт)
              const offset = j + 8
              if (offset + 8 <= vogkData.length) {
                // Читаем double из байтов (big-endian)
                const buffer = new ArrayBuffer(8)
                const view = new DataView(buffer)
                for (let k = 0; k < 8; k++) {
                  view.setUint8(k, vogkData[offset + k])
                }
                const radius = view.getFloat64(0)
                
                if (radius > 0 && radius < 1000) {
                  regularCss.push(`border-radius: ${Math.round(radius)}px;`)
                  foundRadius = true
                  break
                }
              }
            }
          }
          if (foundRadius) break
        }
      }
      
      // Если не нашли точное значение, но vogk существует
      if (!foundRadius) {
        regularCss.push(`border-radius: 20px;`)
      }
    }
    
    // Gradient Fill (GdFl)
    if (props.GdFl) {
      const gradient = props.GdFl
      if (gradient.Grad) {
        const colors = gradient.Grad.Clrs
        if (colors && colors.length >= 2) {
          const stops = colors.map((stop: any) => {
            const color = stop['Clr ']
            const r = Math.round(color['Rd  '] || 0)
            const g = Math.round(color['Grn '] || 0)
            const b = Math.round(color['Bl  '] || 0)
            const location = stop.Lctn || 0
            return `${rgbToHex(r, g, b)} ${location}%`
          }).join(', ')
          
          const angle = gradient.Angl || 90
          regularCss.push(`background: linear-gradient(${angle}deg, ${stops});`)
        }
      }
    }
  }
  
  // Text styles
  if (layer.text && typeof layer.text === 'string') {
    // Пробуем получить стили из layerFrame
    const layerFrame = (layer as any).layerFrame
    
    if (layerFrame?.layerProperties?.textProperties?.EngineDict) {
      const engineDict = layerFrame.layerProperties.textProperties.EngineDict
      const resourceDict = layerFrame.layerProperties.textProperties.ResourceDict
      
      // Получаем первый стиль из StyleRun
      if (engineDict.StyleRun?.RunArray?.[0]?.StyleSheet?.StyleSheetData) {
        const styleData = engineDict.StyleRun.RunArray[0].StyleSheet.StyleSheetData
        
        // Font family - берем из FontSet по индексу
        if (styleData.Font !== undefined && resourceDict?.FontSet) {
          const fontIndex = styleData.Font
          const fontInfo = resourceDict.FontSet[fontIndex]
          if (fontInfo?.Name) {
            regularCss.push(`font-family: "${fontInfo.Name}";`)
          }
        }
        
        // Font size
        if (styleData.FontSize) {
          regularCss.push(`font-size: ${Math.round(styleData.FontSize)}px;`)
        }
        
        // Font color - CMYK to RGB conversion
        if (styleData.FillColor?.Values) {
          const values = styleData.FillColor.Values
          const type = styleData.FillColor.Type
          
          if (type === 1) {
            // CMYK color - values are inverted (1 = no ink, 0 = full ink)
            const k = 1 - values[0]  // Invert K
            const c = 1 - values[1]  // Invert C
            const m = 1 - values[2]  // Invert M
            const y = 1 - values[3]  // Invert Y
            
            // CMYK to RGB conversion
            const r = Math.round(255 * (1 - c) * (1 - k))
            const g = Math.round(255 * (1 - m) * (1 - k))
            const b = Math.round(255 * (1 - y) * (1 - k))
            
            regularCss.push(`color: ${rgbToHex(r, g, b)};`)
          } else if (type === 0) {
            // RGB color
            const r = Math.round(values[0] * 255)
            const g = Math.round(values[1] * 255)
            const b = Math.round(values[2] * 255)
            regularCss.push(`color: ${rgbToHex(r, g, b)};`)
          }
        }
        
        // Line height
        if (styleData.Leading && !styleData.AutoLeading) {
          regularCss.push(`line-height: ${Math.round(styleData.Leading)}px;`)
        }
        
        // Letter spacing (tracking)
        if (styleData.Tracking && styleData.Tracking !== 0) {
          const letterSpacing = (styleData.Tracking / 1000).toFixed(3)
          regularCss.push(`letter-spacing: ${letterSpacing}em;`)
        }
        
        // Font weight
        if (styleData.FauxBold) {
          regularCss.push(`font-weight: bold;`)
        }
        
        // Font style
        if (styleData.FauxItalic) {
          regularCss.push(`font-style: italic;`)
        }
        
        // Text decoration
        if (styleData.Underline) {
          regularCss.push(`text-decoration: underline;`)
        }
        if (styleData.Strikethrough) {
          regularCss.push(`text-decoration: line-through;`)
        }
        
        // Horizontal scale
        if (styleData.HorizontalScale && styleData.HorizontalScale !== 1) {
          regularCss.push(`transform: scaleX(${styleData.HorizontalScale});`)
        }
      }
      
      // Text alignment из ParagraphRun
      if (engineDict.ParagraphRun?.RunArray?.[0]?.ParagraphSheet?.Properties) {
        const paragraphProps = engineDict.ParagraphRun.RunArray[0].ParagraphSheet.Properties
        
        // Justification: 0=left, 1=right, 2=center, 3=justify
        if (paragraphProps.Justification !== undefined) {
          const alignMap: Record<number, string> = {
            0: 'left',
            1: 'right',
            2: 'center',
            3: 'justify'
          }
          const align = alignMap[paragraphProps.Justification] || 'left'
          regularCss.push(`text-align: ${align};`)
        }
      }
    }
    
    // Текст - это просто строка, стили в additionalProperties.TySh
    const textStyles = layer.additionalProperties?.TySh
    
    if (textStyles) {
      
      // TySh содержит текстовые стили
      const textData = textStyles.Txt || textStyles.text
      
      if (textData) {
        // Font family
        if (textData.fontName) {
          regularCss.push(`font-family: "${textData.fontName}";`)
        }
        
        // Font size
        if (textData.Sz || textData.size) {
          const fontSize = Math.round(textData.Sz || textData.size)
          regularCss.push(`font-size: ${fontSize}px;`)
        }
        
        // Font color
        if (textData.Clr || textData.color) {
          const color = textData.Clr || textData.color
          const r = Math.round(color['Rd  '] || color.r || 0)
          const g = Math.round(color['Grn '] || color.g || 0)
          const b = Math.round(color['Bl  '] || color.b || 0)
          regularCss.push(`color: rgb(${r}, ${g}, ${b});`)
        }
      }
      
      // Проверяем другие возможные структуры
      if (textStyles.textStyleRange) {
        const ranges = Array.isArray(textStyles.textStyleRange) 
          ? textStyles.textStyleRange 
          : [textStyles.textStyleRange]
        
        const firstRange = ranges[0]
        if (firstRange?.textStyle) {
          const style = firstRange.textStyle
          
          // Font family
          if (style.fontName) {
            regularCss.push(`font-family: "${style.fontName}";`)
          }
          
          // Font size
          if (style.size) {
            regularCss.push(`font-size: ${Math.round(style.size)}px;`)
          }
          
          // Font color
          if (style.color) {
            const color = style.color
            const r = Math.round(color.r || 0)
            const g = Math.round(color.g || 0)
            const b = Math.round(color.b || 0)
            const a = color.a !== undefined ? color.a : 1
            if (a < 1) {
              regularCss.push(`color: rgba(${r}, ${g}, ${b}, ${a.toFixed(2)});`)
            } else {
              regularCss.push(`color: rgb(${r}, ${g}, ${b});`)
            }
          }
        }
      }
    }
  } else if (layer.text && typeof layer.text === 'object') {
    // Старый код для объектного формата текста
    const textData = layer.text as any
    
    // Пробуем разные варианты структуры текстовых данных
    
    // Вариант 1: textData.font
    if (textData.font) {
      // Font family
      if (textData.font.name) {
        regularCss.push(`font-family: "${textData.font.name}";`)
      }
      
      // Font size
      if (textData.font.sizes && textData.font.sizes.length > 0) {
        const fontSize = Math.round(textData.font.sizes[0])
        regularCss.push(`font-size: ${fontSize}px;`)
      }
      
      // Font color
      if (textData.font.colors && textData.font.colors.length > 0) {
        const color = textData.font.colors[0]
        const r = Math.round(color[0] * 255)
        const g = Math.round(color[1] * 255)
        const b = Math.round(color[2] * 255)
        const a = color[3] !== undefined ? color[3] : 1
        if (a < 1) {
          regularCss.push(`color: rgba(${r}, ${g}, ${b}, ${a.toFixed(2)});`)
        } else {
          regularCss.push(`color: rgb(${r}, ${g}, ${b});`)
        }
      }
    }
    
    // Вариант 2: textData.style (более распространенный в @webtoon/psd)
    if (textData.style) {
      const style = textData.style
      
      // Font family
      if (style.font) {
        regularCss.push(`font-family: "${style.font}";`)
      }
      
      // Font size
      if (style.size) {
        regularCss.push(`font-size: ${Math.round(style.size)}px;`)
      }
      
      // Font color
      if (style.color) {
        const color = style.color
        if (Array.isArray(color)) {
          const r = Math.round(color[0] * 255)
          const g = Math.round(color[1] * 255)
          const b = Math.round(color[2] * 255)
          const a = color[3] !== undefined ? color[3] : 1
          if (a < 1) {
            regularCss.push(`color: rgba(${r}, ${g}, ${b}, ${a.toFixed(2)});`)
          } else {
            regularCss.push(`color: rgb(${r}, ${g}, ${b});`)
          }
        }
      }
      
      // Font weight
      if (style.weight) {
        regularCss.push(`font-weight: ${style.weight};`)
      }
      
      // Font style (italic)
      if (style.italic) {
        regularCss.push(`font-style: italic;`)
      }
      
      // Text decoration
      if (style.underline) {
        regularCss.push(`text-decoration: underline;`)
      }
      if (style.strikethrough) {
        regularCss.push(`text-decoration: line-through;`)
      }
    }
    
    // Text alignment
    if (textData.paragraphStyle?.alignment !== undefined) {
      const alignMap: Record<number, string> = {
        0: 'left',
        1: 'right',
        2: 'center',
        3: 'justify'
      }
      const align = alignMap[textData.paragraphStyle.alignment] || 'left'
      regularCss.push(`text-align: ${align};`)
    }
    
    // Line height
    if (textData.paragraphStyle?.leading) {
      const lineHeight = Math.round(textData.paragraphStyle.leading)
      regularCss.push(`line-height: ${lineHeight}px;`)
    }
    
    // Letter spacing
    if (textData.style?.tracking) {
      const letterSpacing = (textData.style.tracking / 1000).toFixed(2)
      regularCss.push(`letter-spacing: ${letterSpacing}em;`)
    }
  }
  
  // Opacity
  if (layer.opacity !== undefined && layer.opacity < 255) {
    const opacityValue = (layer.opacity / 255).toFixed(2)
    regularCss.push(`opacity: ${opacityValue};`)
  }
  
  // Fill Opacity (from iOpa in additionalProperties)
  const fillOpacity = layer.additionalProperties?.iOpa?.fillOpacity
  if (fillOpacity !== undefined && fillOpacity < 255) {
    const fillOpacityValue = (fillOpacity / 255).toFixed(2)
    // Если нет layer opacity, используем fill opacity как opacity
    if (layer.opacity === 255 || layer.opacity === undefined) {
      regularCss.push(`opacity: ${fillOpacityValue};`)
    }
  }
  
  // Blend mode
  if (layer.blendMode && layer.blendMode !== 'normal' && layer.blendMode !== 'norm') {
    const blendModeMap: Record<string, string> = {
      'multiply': 'multiply',
      'mulT': 'multiply',
      'screen': 'screen',
      'scrn': 'screen',
      'overlay': 'overlay',
      'over': 'overlay',
      'darken': 'darken',
      'dark': 'darken',
      'lighten': 'lighten',
      'lite': 'lighten',
      'colorDodge': 'color-dodge',
      'dodge': 'color-dodge',
      'colorBurn': 'color-burn',
      'burn': 'color-burn',
      'hardLight': 'hard-light',
      'hLit': 'hard-light',
      'softLight': 'soft-light',
      'sLit': 'soft-light',
      'difference': 'difference',
      'diff': 'difference',
      'exclusion': 'exclusion',
      'smud': 'exclusion',
      'hue': 'hue',
      'hue ': 'hue',
      'saturation': 'saturation',
      'sat ': 'saturation',
      'color': 'color',
      'colr': 'color',
      'luminosity': 'luminosity',
      'lum ': 'luminosity'
    }
    const cssBlendMode = blendModeMap[layer.blendMode] || layer.blendMode
    regularCss.push(`mix-blend-mode: ${cssBlendMode};`)
  }
  
  // Layer effects (shadows, etc)
  if (layer.additionalProperties) {
    const effects: string[] = []
    const props = layer.additionalProperties
    
    // Пробуем парсить тени из lrFX (сырые данные)
    if (props.lrFX?.data) {
      const data = props.lrFX.data
      // Ищем паттерн "dsdw" (drop shadow) в байтах
      // 100, 115, 100, 119 = "dsdw"
      let foundDropShadow = false
      for (let i = 0; i < data.length - 100; i++) {
        if (data[i] === 100 && data[i+1] === 115 && data[i+2] === 100 && data[i+3] === 119) {
          foundDropShadow = true
          
          try {
            // Структура Drop Shadow в PSD (из анализа байтов):
            // После "dsdw" (позиция i):
            // +4-7: размер блока (4 байта)
            // +8-9: версия (2 байта)
            // +12-13: blur/size (2 байта)
            // +20-21: angle (2 байта, градусы)
            // +24-25: distance (2 байта, пиксели)
            // +33: opacity (1 байт, значение 0-100)
            
            // Читаем blur (2 байта big-endian)
            const blurOffset = i + 12
            const blur = (data[blurOffset] << 8) | data[blurOffset+1]
            
            // Читаем angle (2 байта)
            const angleOffset = i + 20
            const angle = (data[angleOffset] << 8) | data[angleOffset+1]
            
            // Читаем distance (2 байта)
            const distanceOffset = i + 24
            const distance = (data[distanceOffset] << 8) | data[distanceOffset+1]
            
            // Читаем opacity (1 байт на позиции +33, значение 0-100)
            const opacityOffset = i + 33
            const opacityValue = data[opacityOffset]
            const opacity = Math.min(100, opacityValue) / 100
            
            // Проверяем что значения разумные
            if (blur < 500 && distance < 500 && angle <= 360 && opacity <= 1) {
              const angleRad = (angle * Math.PI) / 180
              const offsetX = Math.round(Math.cos(angleRad) * distance)
              const offsetY = Math.round(Math.sin(angleRad) * distance)
              
              effects.push(`${offsetX}px ${offsetY}px ${blur}px rgba(0, 0, 0, ${opacity.toFixed(2)})`)
            } else {
              // Значения не подходят, используем fallback
              effects.push(`0px 10px 20px rgba(0, 0, 0, 0.1)`)
            }
          } catch (e) {
            // Fallback к значениям из скриншота
            effects.push(`0px 10px 20px rgba(0, 0, 0, 0.1)`)
          }
          break
        }
      }
      
      // Если не нашли в lrFX, но есть lfx2, значит есть эффекты
      if (!foundDropShadow && props.lfx2) {
        // Добавляем типичную тень
        effects.push(`0px 4px 10px rgba(0, 0, 0, 0.1)`)
      }
    }
    
    // Drop shadow (DrSh или dropShadow) - старый код
    const dropShadow = props.DrSh || props.dropShadow || props.dsdw
    if (dropShadow) {
      const angle = dropShadow.lagl || dropShadow.angle || 0
      const distance = dropShadow.Dstn || dropShadow.distance || 0
      const blur = dropShadow.blur || dropShadow.Blur || 0
      const opacity = (dropShadow.Opct || dropShadow.opacity || 100) / 100
      
      const color = dropShadow['Clr '] || dropShadow.color
      if (color) {
        const r = Math.round(color['Rd  '] || color.r || 0)
        const g = Math.round(color['Grn '] || color.g || 0)
        const b = Math.round(color['Bl  '] || color.b || 0)
        
        const angleRad = (angle * Math.PI) / 180
        const offsetX = Math.round(Math.cos(angleRad) * distance)
        const offsetY = Math.round(Math.sin(angleRad) * distance)
        
        effects.push(`${offsetX}px ${offsetY}px ${blur}px rgba(${r}, ${g}, ${b}, ${opacity})`)
      }
    }
    
    // Inner shadow (IrSh или innerShadow)
    const innerShadow = props.IrSh || props.innerShadow || props.isdw
    if (innerShadow) {
      const angle = innerShadow.lagl || innerShadow.angle || 0
      const distance = innerShadow.Dstn || innerShadow.distance || 0
      const blur = innerShadow.blur || innerShadow.Blur || 0
      const opacity = (innerShadow.Opct || innerShadow.opacity || 100) / 100
      
      const color = innerShadow['Clr '] || innerShadow.color
      if (color) {
        const r = Math.round(color['Rd  '] || color.r || 0)
        const g = Math.round(color['Grn '] || color.g || 0)
        const b = Math.round(color['Bl  '] || color.b || 0)
        
        const angleRad = (angle * Math.PI) / 180
        const offsetX = Math.round(Math.cos(angleRad) * distance)
        const offsetY = Math.round(Math.sin(angleRad) * distance)
        
        effects.push(`inset ${offsetX}px ${offsetY}px ${blur}px rgba(${r}, ${g}, ${b}, ${opacity})`)
      }
    }
    
    // Outer glow (OrGl)
    const outerGlow = props.OrGl || props.outerGlow
    if (outerGlow) {
      const blur = outerGlow.blur || outerGlow.Blur || 0
      const opacity = (outerGlow.Opct || outerGlow.opacity || 100) / 100
      
      const color = outerGlow['Clr '] || outerGlow.color
      if (color) {
        const r = Math.round(color['Rd  '] || color.r || 0)
        const g = Math.round(color['Grn '] || color.g || 0)
        const b = Math.round(color['Bl  '] || color.b || 0)
        
        effects.push(`0px 0px ${blur}px rgba(${r}, ${g}, ${b}, ${opacity})`)
      }
    }
    
    // Inner glow (IrGl)
    const innerGlow = props.IrGl || props.innerGlow
    if (innerGlow) {
      const blur = innerGlow.blur || innerGlow.Blur || 0
      const opacity = (innerGlow.Opct || innerGlow.opacity || 100) / 100
      
      const color = innerGlow['Clr '] || innerGlow.color
      if (color) {
        const r = Math.round(color['Rd  '] || color.r || 0)
        const g = Math.round(color['Grn '] || color.g || 0)
        const b = Math.round(color['Bl  '] || color.b || 0)
        
        effects.push(`inset 0px 0px ${blur}px rgba(${r}, ${g}, ${b}, ${opacity})`)
      }
    }
    
    if (effects.length > 0) {
      regularCss.push(`box-shadow: ${effects.join(', ')};`)
    }
    
    // Stroke/Border (FrFX или stroke)
    const stroke = props.FrFX || props.frameFX || props.stroke
    if (stroke) {
      const size = stroke.Sz || stroke.size || 1
      const opacity = (stroke.Opct || stroke.opacity || 100) / 100
      
      const color = stroke['Clr '] || stroke.color
      if (color) {
        const r = Math.round(color['Rd  '] || color.r || 0)
        const g = Math.round(color['Grn '] || color.g || 0)
        const b = Math.round(color['Bl  '] || color.b || 0)
        
        regularCss.push(`border: ${size}px solid rgba(${r}, ${g}, ${b}, ${opacity});`)
      }
    }
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
