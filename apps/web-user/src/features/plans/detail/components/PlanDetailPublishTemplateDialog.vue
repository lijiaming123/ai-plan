<script setup lang="ts">
import { ref } from "vue";
import type { PlanRecord } from "../../../../lib/api-client";
import { getApiClient } from "../../../../lib/api-client";
import { trackEvent } from "../../../../lib/telemetry";
import { authState } from "../../../../stores/auth";

const props = defineProps<{
  plan: PlanRecord;
}>();

const emit = defineEmits<{
  close: [];
  error: [message: string];
  published: [];
}>();

const publishSubmitting = ref(false);
const publishForm = ref({
  title: props.plan.goal.slice(0, 200),
  summary: props.plan.requirement.slice(0, 5000),
  category:
    props.plan.type === "study" ||
    props.plan.type === "work" ||
    props.plan.type === "travel"
      ? props.plan.type
      : "general",
  tags: "" as string,
});

async function submitPublishTemplate() {
  if (!authState.token) return;
  publishSubmitting.value = true;
  try {
    const tags = publishForm.value.tags
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const created = await getApiClient().publishMarketTemplate({
      token: authState.token,
      title: publishForm.value.title.trim(),
      summary: publishForm.value.summary.trim(),
      category: publishForm.value.category.trim() || "general",
      tags,
      planId: props.plan.id,
    });
    trackEvent("template_publish", {
      properties: {
        planId: props.plan.id,
        templateId: created.id,
        category: publishForm.value.category.trim() || "general",
      },
    });
    emit("close");
    emit("published");
  } catch (e) {
    emit("error", e instanceof Error ? e.message : "没发布成功，请稍后再试");
  } finally {
    publishSubmitting.value = false;
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
    data-testid="publish-template-dialog"
    @click.self="emit('close')"
  >
    <div
      class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      @click.stop
    >
      <h3 class="text-lg font-bold">发布到模板市场</h3>
      <p class="mt-1 text-xs text-[#61896f]">
        将基于当前计划生成可被套用的市场模板（标题与摘要可编辑）。
      </p>
      <label class="mt-4 block text-sm font-medium">标题</label>
      <input
        v-model="publishForm.title"
        type="text"
        class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        maxlength="200"
      />
      <label class="mt-3 block text-sm font-medium">摘要</label>
      <textarea
        v-model="publishForm.summary"
        rows="4"
        class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        maxlength="5000"
      />
      <label class="mt-3 block text-sm font-medium">分类</label>
      <input
        v-model="publishForm.category"
        type="text"
        class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        placeholder="如 study / travel / general"
      />
      <label class="mt-3 block text-sm font-medium">标签（逗号分隔）</label>
      <input
        v-model="publishForm.tags"
        type="text"
        class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        placeholder="学习, 考试"
      />
      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg px-4 py-2 text-sm font-medium text-[#61896f]"
          @click="emit('close')"
        >
          取消
        </button>
        <button
          type="button"
          class="rounded-lg bg-[#111813] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          :disabled="publishSubmitting"
          data-testid="confirm-publish-template"
          @click="submitPublishTemplate"
        >
          {{ publishSubmitting ? "发布中…" : "确认发布" }}
        </button>
      </div>
    </div>
  </div>
</template>
