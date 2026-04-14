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
    errorToastMessage.value = '请先登录后再上传文件。';
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
    errorToastMessage.value = e instanceof Error ? e.message : '上传失败，请稍后重试。';
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
      <p class="hero-subtitle">任务编号：{{ taskId }}。提交说明越具体，评分反馈越有效。</p>
    </header>
    <label class="field">
      完成说明
      <textarea v-model="form.content" aria-label="完成说明" placeholder="描述你完成了什么，如何达到要求，有哪些可验证结果" />
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
      <p v-else class="inline-note">暂无文件，建议至少上传 1 个可证明过程或结果的附件。</p>
    </div>

    <button class="btn-primary" type="submit" :disabled="fileUploading">提交审核</button>
  </form>
</template>
