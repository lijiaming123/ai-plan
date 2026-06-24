<script setup lang="ts">
import { ref } from "vue";

const model = defineModel<string>({ required: true });

withDefaults(
  defineProps<{
    id?: string;
    label?: string;
    placeholder?: string;
    autocomplete?: string;
    ariaLabel?: string;
    testId?: string;
    disabled?: boolean;
    inputClass?: string;
  }>(),
  {
    placeholder: "请输入密码",
    autocomplete: "current-password",
    inputClass: "h-12",
  },
);

const show = ref(false);
</script>

<template>
  <div class="flex flex-col">
    <label v-if="label" :for="id" class="pb-2 text-sm font-medium">{{ label }}</label>
    <div
      class="flex w-full min-w-0 items-stretch rounded-lg border border-[#dbe6df] bg-white outline-none transition-[box-shadow,border-color] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/50 focus-within:ring-offset-0"
    >
      <input
        :id="id"
        v-model="model"
        :type="show ? 'text' : 'password'"
        :autocomplete="autocomplete"
        :aria-label="ariaLabel ?? label"
        :data-testid="testId"
        :disabled="disabled"
        :class="[
          inputClass,
          'min-w-0 flex-1 rounded-l-lg border-0 border-r border-[#dbe6df] bg-transparent p-3 pr-2 text-base outline-none ring-0 focus:border-transparent focus:ring-0 focus:outline-none',
        ]"
        :placeholder="placeholder"
      />
      <button
        type="button"
        class="flex shrink-0 items-center justify-center rounded-r-lg border-0 bg-white px-3 text-[#61896f] !outline-none hover:bg-[#f6f8f6] focus-visible:ring-0"
        :aria-pressed="show"
        :aria-label="show ? '隐藏密码' : '显示密码'"
        @click="show = !show"
      >
        <span class="material-symbols-outlined text-xl" aria-hidden="true">{{
          show ? "visibility_off" : "visibility"
        }}</span>
      </button>
    </div>
  </div>
</template>
