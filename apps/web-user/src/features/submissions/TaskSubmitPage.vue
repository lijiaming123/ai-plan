<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authState } from '../../stores/auth';
import { createSubmission } from './submission.api';
import UiErrorToast from '../../components/UiErrorToast.vue';

const route = useRoute();
const router = useRouter();
const taskId = computed(() => String(route.params.taskId ?? ''));
const form = reactive({
  content: '',
  imageUrls: [] as string[],
});
const selectedFiles = ref<File[]>([]);
const hasFiles = computed(() => selectedFiles.value.length > 0);
const errorToastMessage = ref('');

function readFiles(files: FileList | null) {
  selectedFiles.value = files ? Array.from(files) : [];
  form.imageUrls = selectedFiles.value.map((file) => `local://${file.name}`);
}

async function handleSubmit() {
  try {
    const result = await createSubmission(taskId.value, {
      content: form.content,
      imageUrls: form.imageUrls,
      token: authState.token,
    });

    await router.push(`/submissions/${result.id}/result`);
  } catch (error) {
    errorToastMessage.value = error instanceof Error ? error.message : '提交失败，请稍后重试。';
  }
}
</script>

<template>
  <UiErrorToast :message="errorToastMessage" @close="errorToastMessage = ''" />
  <form class="page surface-card form-card" @submit.prevent="handleSubmit">
    <span class="brand-badge">节点提交</span>
    <header>
      <h1 class="hero-title">提交任务成果以进入自动判定</h1>
      <p class="hero-subtitle">任务编号：{{ taskId }}。提交说明越具体，AI 评分反馈越有效。</p>
    </header>
    <label class="field">
      完成说明
      <textarea v-model="form.content" aria-label="完成说明" placeholder="描述你完成了什么，如何达到要求，有哪些可验证结果" />
    </label>
    <label class="field">
      上传图片
      <input type="file" multiple accept="image/*" aria-label="上传图片" @change="readFiles(($event.target as HTMLInputElement).files)" />
    </label>

    <div class="hint-block">
      <p class="inline-note">已选择文件</p>
      <ul v-if="hasFiles" class="file-list">
        <li v-for="file in selectedFiles" :key="file.name">{{ file.name }}</li>
      </ul>
      <p v-else class="inline-note">暂无文件，建议至少上传 1 张可证明过程或结果的图片。</p>
    </div>

    <button class="btn-primary" type="submit">提交审核</button>
  </form>
</template>
