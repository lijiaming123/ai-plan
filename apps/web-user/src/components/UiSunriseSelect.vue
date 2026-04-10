<script setup lang="ts">
import { ElSelect } from 'element-plus';

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
