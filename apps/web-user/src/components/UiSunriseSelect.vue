<script setup lang="ts">
defineOptions({ inheritAttrs: false });

const model = defineModel<unknown>();
</script>

<template>
  <ElSelect
    v-model="model"
    v-bind="$attrs"
    class="ui-sunrise-el-select w-full"
    popper-class="ui-sunrise-select-dropdown"
  >
    <slot />
  </ElSelect>
</template>
