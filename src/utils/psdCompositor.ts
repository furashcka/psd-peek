/**
 * PSD Compositor - динамический композитинг для ag-psd
 * 
 * ag-psd предоставляет готовые canvas для каждого слоя,
 * но не умеет перерендерить с учётом изменения видимости.
 * 
 * Этот модуль реализует динамический композитинг:
 * - Учёт видимости слоёв
 * - Применение blend modes
 * - Применение opacity
 * - Поддержка групп
 * - КЭШИРОВАНИЕ для производительности
 */

import type { Layer, Psd } from 'ag-psd'

export interface CompositorOptions {
  /** Map видимости слоёв (uniqueId -> visible) */
  layerVisibility?: Map<number, boolean>
  
  /** Фон (по умолчанию прозрачный) */
  backgroundColor?: string
  
  /** Применять ли blend modes (по умолчанию true) */
  applyBlendModes?: boolean
  
  /** Viewport для рендеринга части документа */
  viewport?: {
    x: number
    y: number
    width: number
    height: number
  }
}

/**
 * Кэш композитов
 */
class CompositorCache {
  private cache = new Map<string, HTMLCanvasElement>()
  private maxSize = 50  // Максимум 50 кэшированных canvas
  
  getCacheKey(
    psdWidth: number,
    psdHeight: number,
    visibilityHash: string,
    blendModes: boolean
  ): string {
    return `${psdWidth}x${psdHeight}_${visibilityHash}_${blendModes}`
  }
  
  get(key: string): HTMLCanvasElement | undefined {
    return this.cache.get(key)
  }
  
  set(key: string, canvas: HTMLCanvasElement): void {
    // Ограничить размер кэша
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value as string | undefined
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }
    this.cache.set(key, canvas)
  }
  
  clear(): void {
    this.cache.clear()
  }
}

const compositorCache = new CompositorCache()

/**
 * Получить хэш видимости для кэширования
 */
function getVisibilityHash(
  psd: Psd,
  layerVisibility: Map<number, boolean>
): string {
  const visibleIds: number[] = []
  
  function collectVisible(layer: any, parentVisible: boolean = true) {
    // Проверить переопределение видимости
    const visibilityOverride = layerVisibility.get(layer.__uniqueId)
    const isVisible = visibilityOverride !== undefined 
      ? (parentVisible && visibilityOverride)
      : (parentVisible && !layer.hidden)
    
    if (isVisible) {
      visibleIds.push(layer.__uniqueId)
    }
    
    if (layer.children) {
      for (const child of layer.children) {
        collectVisible(child, isVisible)
      }
    }
  }
  
  if (psd.children) {
    for (const layer of psd.children) {
      collectVisible(layer)
    }
  }
  
  return visibleIds.join(',')
}

/**
 * Маппинг blend modes из PSD в Canvas API
 */
const BLEND_MODE_MAP: Record<string, GlobalCompositeOperation> = {
  'normal': 'source-over',
  'pass through': 'source-over',
  'multiply': 'multiply',
  'screen': 'screen',
  'overlay': 'overlay',
  'darken': 'darken',
  'lighten': 'lighten',
  'color dodge': 'color-dodge',
  'color burn': 'color-burn',
  'hard light': 'hard-light',
  'soft light': 'soft-light',
  'difference': 'difference',
  'exclusion': 'exclusion',
  'hue': 'hue',
  'saturation': 'saturation',
  'color': 'color',
  'luminosity': 'luminosity',
}

/**
 * Проверить видимость слоя с учётом родителей
 */
function isLayerVisible(
  layer: any,
  layerVisibility: Map<number, boolean>,
  parentVisible: boolean = true
): boolean {
  if (!parentVisible) return false
  
  // Проверить переопределение видимости в Map (приоритет!)
  const visibilityOverride = layerVisibility.get(layer.__uniqueId)
  if (visibilityOverride !== undefined) {
    // Если есть явное переопределение - используем его
    return visibilityOverride
  }
  
  // Иначе используем оригинальное состояние из PSD
  return !layer.hidden
}

/**
 * Композитинг массива слоёв с поддержкой clipping masks
 */
function compositeLayersWithClipping(
  ctx: CanvasRenderingContext2D,
  layers: any[],
  options: CompositorOptions,
  parentVisible: boolean = true
): void {
  let i = 0
  while (i < layers.length) {
    const layer = layers[i]
    
    // Проверить есть ли следующие слои с clipping
    const clippedLayers: any[] = []
    let j = i + 1
    while (j < layers.length && layers[j].clipping) {
      clippedLayers.push(layers[j])
      j++
    }
    
    if (clippedLayers.length > 0) {
      // Есть clipped слои - рендерим группу с маской
      renderClippingGroup(ctx, layer, clippedLayers, options, parentVisible)
      i = j  // Пропустить обработанные clipped слои
    } else {
      // Обычный слой без clipping
      compositeLayerInternal(ctx, layer, options, parentVisible)
      i++
    }
  }
}

/**
 * Рендеринг группы слоёв с clipping mask
 */
function renderClippingGroup(
  ctx: CanvasRenderingContext2D,
  baseLayer: any,
  clippedLayers: any[],
  options: CompositorOptions,
  parentVisible: boolean
): void {
  // Создать временный canvas для группы
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = ctx.canvas.width
  tempCanvas.height = ctx.canvas.height
  const tempCtx = tempCanvas.getContext('2d', { alpha: true })!
  
  // 1. Рендерим clipped слои сначала
  for (const clippedLayer of clippedLayers) {
    const visible = isLayerVisible(clippedLayer, options.layerVisibility || new Map(), parentVisible)
    if (!visible) continue
    
    if (clippedLayer.canvas) {
      tempCtx.save()
      
      // Применить opacity
      const opacity = (clippedLayer.opacity !== undefined && clippedLayer.opacity !== null)
        ? clippedLayer.opacity
        : 1
      const fillOpacity = (clippedLayer.fillOpacity !== undefined && clippedLayer.fillOpacity !== null)
        ? clippedLayer.fillOpacity
        : 1
      tempCtx.globalAlpha = opacity * fillOpacity
      
      // Применить blend mode
      if (options.applyBlendModes !== false && clippedLayer.blendMode) {
        const canvasBlendMode = BLEND_MODE_MAP[clippedLayer.blendMode]
        if (canvasBlendMode) {
          tempCtx.globalCompositeOperation = canvasBlendMode
        }
      }
      
      // Нарисовать clipped слой
      const x = clippedLayer.left || 0
      const y = clippedLayer.top || 0
      tempCtx.drawImage(clippedLayer.canvas, x, y)
      
      tempCtx.restore()
    }
  }
  
  // 2. Применить маску (обрезать по base layer)
  if (baseLayer.canvas) {
    tempCtx.globalCompositeOperation = 'destination-in'
    const baseX = baseLayer.left || 0
    const baseY = baseLayer.top || 0
    tempCtx.drawImage(baseLayer.canvas, baseX, baseY)
  }
  
  // 3. Нарисовать base layer на основной canvas
  compositeLayerInternal(ctx, baseLayer, options, parentVisible)
  
  // 4. Нарисовать clipped результат поверх
  ctx.drawImage(tempCanvas, 0, 0)
}

/**
 * Композитинг одного слоя (внутренняя функция)
 */
function compositeLayerInternal(
  ctx: CanvasRenderingContext2D,
  layer: any,
  options: CompositorOptions,
  parentVisible: boolean = true
): void {
  const visible = isLayerVisible(layer, options.layerVisibility || new Map(), parentVisible)
  
  if (!visible) {
    return
  }
  
  // Если это группа - рендерим детей
  if (layer.children && layer.children.length > 0) {
    const opacity = (layer.opacity !== undefined && layer.opacity !== null)
      ? layer.opacity
      : 1
    const fillOpacity = (layer.fillOpacity !== undefined && layer.fillOpacity !== null)
      ? layer.fillOpacity
      : 1
    const combinedOpacity = opacity * fillOpacity
    
    // Нужен временный canvas если:
    // 1. У группы есть blend mode (не normal/pass through)
    // 2. У группы есть opacity/fillOpacity < 1
    const needsGroupCanvas = (
      (options.applyBlendModes !== false && 
       layer.blendMode && 
       layer.blendMode !== 'normal' &&
       layer.blendMode !== 'pass through') ||
      combinedOpacity < 1
    )
    
    if (needsGroupCanvas) {
      ctx.save()
      
      // Создать временный canvas для группы
      const groupCanvas = document.createElement('canvas')
      groupCanvas.width = ctx.canvas.width
      groupCanvas.height = ctx.canvas.height
      const groupCtx = groupCanvas.getContext('2d', { 
        alpha: true,
        willReadFrequently: false 
      })!
      
      // Рендерим детей на временный canvas
      for (const child of layer.children) {
        compositeLayerInternal(groupCtx, child, options, visible)
      }
      
      // Применить blend mode и opacity группы к результату
      const groupOpacity = opacity * fillOpacity
      ctx.globalAlpha = groupOpacity
      
      if (options.applyBlendModes !== false && layer.blendMode && 
          layer.blendMode !== 'normal' && layer.blendMode !== 'pass through') {
        ctx.globalCompositeOperation = BLEND_MODE_MAP[layer.blendMode] || 'source-over'
      }
      
      ctx.drawImage(groupCanvas, 0, 0)
      
      ctx.restore()
    } else {
      // Без временного canvas - рендерим детей с учётом clipping masks
      compositeLayersWithClipping(ctx, layer.children, options, visible)
    }
    return
  }
  
  // Рендерим обычный слой
  if (layer.canvas) {
    ctx.save()
    
    // Применить opacity и fillOpacity (ag-psd уже возвращает 0-1)
    const opacity = (layer.opacity !== undefined && layer.opacity !== null)
      ? layer.opacity
      : 1
    const fillOpacity = (layer.fillOpacity !== undefined && layer.fillOpacity !== null)
      ? layer.fillOpacity
      : 1
    
    // Для обычных слоёв fillOpacity влияет на содержимое, opacity на весь результат
    // Итоговая прозрачность = opacity * fillOpacity
    ctx.globalAlpha = opacity * fillOpacity
    
    // Применить blend mode
    if (options.applyBlendModes !== false && layer.blendMode) {
      const canvasBlendMode = BLEND_MODE_MAP[layer.blendMode]
      if (canvasBlendMode) {
        ctx.globalCompositeOperation = canvasBlendMode
      }
    }
    
    // Нарисовать слой на его позиции
    const x = layer.left || 0
    const y = layer.top || 0
    
    ctx.drawImage(layer.canvas, x, y)
    
    ctx.restore()
  }
}

/**
 * Композитинг всего PSD документа с кэшированием
 */
export function compositePsd(
  psd: Psd,
  options: CompositorOptions = {}
): HTMLCanvasElement {
  // Проверить кэш
  const visibilityHash = getVisibilityHash(psd, options.layerVisibility || new Map())
  const cacheKey = compositorCache.getCacheKey(
    psd.width,
    psd.height,
    visibilityHash,
    options.applyBlendModes !== false
  )
  
  const cached = compositorCache.get(cacheKey)
  if (cached) {
    return cached
  }
  
  const viewport = options.viewport || {
    x: 0,
    y: 0,
    width: psd.width,
    height: psd.height
  }
  
  // Создать canvas
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  
  const ctx = canvas.getContext('2d', { 
    alpha: true,
    willReadFrequently: false  // Оптимизация
  })!
  
  // Фон
  if (options.backgroundColor) {
    ctx.fillStyle = options.backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  
  // Применить viewport offset
  if (viewport.x !== 0 || viewport.y !== 0) {
    ctx.translate(-viewport.x, -viewport.y)
  }
  
  // Композитинг всех слоёв с учётом clipping masks
  if (psd.children) {
    compositeLayersWithClipping(ctx, psd.children, options)
  }
  
  // Сохранить в кэш
  compositorCache.set(cacheKey, canvas)
  
  return canvas
}

/**
 * Очистить кэш композитора
 */
export function clearCompositorCache(): void {
  compositorCache.clear()
  console.log('🗑️ Compositor cache cleared')
}

/**
 * Композитинг отдельного слоя (экспортируемая функция)
 */
export function compositeSingleLayer(
  layer: Layer,
  options: CompositorOptions = {}
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = (layer.right || 0) - (layer.left || 0)
  canvas.height = (layer.bottom || 0) - (layer.top || 0)
  
  const ctx = canvas.getContext('2d')!
  
  // Фон
  if (options.backgroundColor) {
    ctx.fillStyle = options.backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  
  // Рендерим слой
  const layerAny = layer as any
  if (layerAny.canvas) {
    ctx.drawImage(layerAny.canvas, 0, 0)
  }
  
  return canvas
}

/**
 * Получить список неподдерживаемых blend modes в документе
 */
export function getUnsupportedBlendModes(psd: Psd): string[] {
  const unsupported = new Set<string>()
  
  function checkLayer(layer: any) {
    if (layer.blendMode && !BLEND_MODE_MAP[layer.blendMode]) {
      unsupported.add(layer.blendMode)
    }
    
    if (layer.children) {
      for (const child of layer.children) {
        checkLayer(child)
      }
    }
  }
  
  if (psd.children) {
    for (const layer of psd.children) {
      checkLayer(layer)
    }
  }
  
  return Array.from(unsupported)
}

/**
 * Создать ImageData из canvas
 */
export function canvasToImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d')!
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * Экспортировать как Blob
 */
export async function exportAsBlob(
  canvas: HTMLCanvasElement,
  format: 'png' | 'jpeg' = 'png',
  quality: number = 0.92
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to create blob'))
        }
      },
      format === 'png' ? 'image/png' : 'image/jpeg',
      quality
    )
  })
}
