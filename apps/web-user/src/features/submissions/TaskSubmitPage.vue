<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authState } from '../../stores/auth';
import { getApiClient } from '../../lib/api-client';
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
const fileUploading = ref(false);
const errorToastMessage = ref('');

async function readFiles(files: FileList | null) {
  if (!files?.length) {
    selectedFiles.value = [];
    form.imageUrls = [];
    return;
  }
  if (!authState.token) {
    errorToastMessage.value = '请先登录，再上传附件。';
    return;
  }
  selectedFiles.value = Array.from(files);
  fileUploading.value = true;
  errorToastMessage.value = '';
  try {
    const urls: string[] = [];
    for (const file of selectedFiles.value) {
      const res = await getApiClient().uploadUserFile({ token: authState.token, file });
      urls.push(res.url);
    }
    form.imageUrls = urls;
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '没上传成功，请稍后再试。';
    selectedFiles.value = [];
    form.imageUrls = [];
  } finally {
    fileUploading.value = false;
  }
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
    errorToastMessage.value = error instanceof Error ? error.message : '没提交成功，请稍后再试。';
  }
}
</script>

<template>
  <UiErrorToast :message="errorToastMessage" @close="errorToastMessage = ''" />
  <form class="page surface-card form-card" @submit.prevent="handleSubmit">
    <span class="brand-badge">节点提交</span>
    <header>
      <h1 class="hero-title">提交你的成果</h1>
      <p class="hero-subtitle">任务编号：{{ taskId }}。说明越具体，我们越能给出准确的反馈。</p>
    </header>
    <label class="field">
      完成说明
      <textarea v-model="form.content" aria-label="完成说明" placeholder="写清楚你做了什么、怎么做的、结果如何验证（例如数据、截图、链接）" />
    </label>
    <label class="field">
      上传附件（图片、PDF、Word、文本）
      <input
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv"
        aria-label="上传附件"
        :disabled="fileUploading"
        @change="
          void readFiles(($event.target as HTMLInputElement).files);
          (($event.target as HTMLInputElement).value = '')
        "
      />
    </label>

    <div class="hint-block">
      <p class="inline-note">{{ fileUploading ? '正在上传…' : '已选择文件' }}</p>
      <ul v-if="hasFiles" class="file-list">
        <li v-for="file in selectedFiles" :key="file.name">{{ file.name }}</li>
      </ul>
      <p v-else class="inline-note">还没选文件。建议至少上传 1 个能证明过程或结果的附件。</p>
    </div>

    <button class="btn-primary" type="submit" :disabled="fileUploading">提交</button>
  </form>
</template>
