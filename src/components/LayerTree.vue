<template>
  <div class="layer-tree">
    <LayerItem
      v-for="(layer, index) in layers"
      :key="`${layer.name}-${index}-${layer.left}-${layer.top}`"
      :layer="layer"
      :selected-layer="selectedLayer"
      :expanded-groups="expandedGroups"
      :layer-visibility="layerVisibility"
      @layer-select="$emit('layer-select', $event)"
      @toggle-visibility="$emit('toggle-visibility', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import LayerItem from './LayerItem.vue'
import type { Node } from '@webtoon/psd'

defineProps<{
  layers?: Node[]
  selectedLayer: Node | null
  expandedGroups: Set<number>
  layerVisibility: Map<number, boolean>
}>()

defineEmits<{
  'layer-select': [layer: Node]
  'toggle-visibility': [layer: Node]
}>()
</script>

<style scoped>
.layer-tree {
  padding: 8px 0;
}
</style>
