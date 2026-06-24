<script setup lang="ts">
import UiConfirmDialog from '../../../components/UiConfirmDialog.vue';

const title = defineModel<string>('title', { required: true });
const summary = defineModel<string>('summary', { required: true });
const category = defineModel<string>('category', { required: true });
const tags = defineModel<string>('tags', { required: true });

defineProps<{
  open: boolean;
  submitting: boolean;
  categoryOptions: readonly string[];
  categoryLabel: Record<string, string>;
}>();

const emit = defineEmits<{
  submit: [];
  cancel: [];
}>();
</script>

<template>
  <UiConfirmDialog
    v-if="open"
    :open="true"
    title="编辑模板信息"
    confirm-text="保存并重新审核"
    cancel-text="取消"
    :confirm-loading="submitting"
    @confirm="emit('submit')"
    @cancel="emit('cancel')"
  >
    <div class="space-y-3 text-left">
      <label class="block">
        <span class="text-xs font-semibold text-stone-600">标题</span>
        <input
          v-model="title"
          type="text"
          class="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
          data-testid="edit-title"
        />
      </label>
      <label class="block">
        <span class="text-xs font-semibold text-stone-600">摘要</span>
        <textarea
          v-model="summary"
          rows="3"
          class="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
          data-testid="edit-summary"
        />
      </label>
      <label class="block">
        <span class="text-xs font-semibold text-stone-600">分类</span>
        <select
          v-model="category"
          class="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
          data-testid="edit-category"
        >
          <option v-for="c in categoryOptions" :key="c" :value="c">
            {{ categoryLabel[c] ?? c }}
          </option>
        </select>
      </label>
      <label class="block">
        <span class="text-xs font-semibold text-stone-600">标签（逗号分隔）</span>
        <input
          v-model="tags"
          type="text"
          class="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
          data-testid="edit-tags"
        />
      </label>
    </div>
  </UiConfirmDialog>
</template>
