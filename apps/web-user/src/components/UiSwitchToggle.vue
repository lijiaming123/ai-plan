<script setup lang="ts">
const model = defineModel<boolean>({ required: true });

defineProps<{
  label: string;
  description?: string;
  testId?: string;
}>();
</script>

<template>
  <div class="flex items-center justify-between gap-4">
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold text-stone-800">{{ label }}</p>
      <p v-if="description" class="mt-0.5 text-xs text-[#7c8a84]">{{ description }}</p>
    </div>
    <button
      type="button"
      role="switch"
      :aria-checked="model"
      :data-testid="testId"
      class="relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a8f4a]"
      :class="model ? 'bg-[#0a8f4a]' : 'bg-stone-300'"
      @click="model = !model"
    >
      <span
        class="pointer-events-none inline-block size-6 transform rounded-full bg-white shadow ring-0 transition"
        :class="model ? 'translate-x-5' : 'translate-x-0.5'"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
