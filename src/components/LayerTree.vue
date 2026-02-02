<template>
  <div class="layer-tree">
    <LayerItem
      v-for="(layer, index) in layers"
      :key="`${layer.name}-${index}-${layer.left}-${layer.top}`"
      :layer="layer"
      :selected-layer="selectedLayer"
      :expanded-groups="expandedGroups"
      :layer-visibility="layerVisibility"
      :disable-visibility-toggle="disableVisibilityToggle"
      @layer-select="$emit('layer-select', $event)"
      @toggle-visibility="$emit('toggle-visibility', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import LayerItem from './LayerItem.vue'
import type { Layer } from 'ag-psd'

defineProps<{
  layers?: Layer[]
  selectedLayer: Layer | null
  expandedGroups: Set<number>
  layerVisibility: Map<number, boolean>
  disableVisibilityToggle?: boolean
}>()

defineEmits<{
  'layer-select': [layer: Layer]
  'toggle-visibility': [layer: Layer]
}>()
</script>

<style scoped>
.layer-tree {
  padding: 8px 0;
}
</style>
