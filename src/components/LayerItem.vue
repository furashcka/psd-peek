<template>
  <div class="layer-item">
    <div
      class="layer-header"
      :class="{ selected: isSelected, hidden: !isVisible }"
      :data-layer-id="(layer as any).__uniqueId"
      @click="handleClick"
    >
      <span class="layer-toggle" v-if="hasChildren" @click.stop="toggleExpanded">
        {{ isExpanded ? '▼' : '▶' }}
      </span>
      <span class="layer-visibility" @click.stop="toggleVisibility">
        {{ isVisible ? '👁️' : '👁️‍🗨️' }}
      </span>
      <span class="layer-icon">{{ getLayerIcon() }}</span>
      <span class="layer-name">{{ layer.name }}</span>
    </div>
    
    <div v-if="isExpanded && hasChildren" class="layer-children">
      <LayerItem
        v-for="(child, index) in layer.children"
        :key="`${child.name}-${index}-${child.left}-${child.top}`"
        :layer="child"
        :selected-layer="selectedLayer"
        :expanded-groups="expandedGroups"
        :layer-visibility="layerVisibility"
        @layer-select="$emit('layer-select', $event)"
        @toggle-visibility="$emit('toggle-visibility', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Node } from '@webtoon/psd'

const props = defineProps<{
  layer: Node
  selectedLayer: Node | null
  expandedGroups: Set<number>
  layerVisibility: Map<number, boolean>
}>()

const emit = defineEmits<{
  'layer-select': [layer: Node]
  'toggle-visibility': [layer: Node]
}>()

const isExpanded = ref(false)

// Watch expandedGroups and expand group if it's in the list
watch(() => props.expandedGroups, (newGroups) => {
  const layerId = (props.layer as any).__uniqueId
  if (newGroups.has(layerId)) {
    isExpanded.value = true
  }
}, { immediate: true, deep: true })

const hasChildren = computed(() => {
  return props.layer.children && props.layer.children.length > 0
})

const isSelected = computed(() => {
  if (!props.selectedLayer) return false
  
  // Compare by unique ID
  return (props.selectedLayer as any).__uniqueId === (props.layer as any).__uniqueId
})

const isVisible = computed(() => {
  const layerId = (props.layer as any).__uniqueId
  return props.layerVisibility.get(layerId) ?? true
})

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value
}

const toggleVisibility = () => {
  emit('toggle-visibility', props.layer)
}

const handleClick = () => {
  emit('layer-select', props.layer)
}

const getLayerIcon = () => {
  if (props.layer.type === 'Group') return '📁'
  if (props.layer.type === 'Text') return '📝'
  return '🖼️'
}
</script>

<style scoped>
.layer-item {
  user-select: none;
}

.layer-header {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}

.layer-header:hover {
  background: #2c2c2c;
}

.layer-header.selected {
  background: #42b983;
  color: white;
  font-weight: 600;
}

.layer-header.hidden {
  opacity: 0.5;
}

.layer-toggle {
  width: 16px;
  font-size: 10px;
  margin-right: 4px;
  cursor: pointer;
}

.layer-visibility {
  margin-right: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.layer-visibility:hover {
  opacity: 0.7;
}

.layer-icon {
  margin-right: 8px;
  font-size: 14px;
}

.layer-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-children {
  padding-left: 20px;
}
</style>
