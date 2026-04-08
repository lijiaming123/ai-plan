<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authState } from '../../stores/auth';
import { createSubmission } from './submission.api';

const route = useRoute();
const router = useRouter();
const taskId = computed(() => String(route.params.taskId ?? ''));
const form = reactive({
  content: '',
  imageUrls: [] as string[],
});
const selectedFiles = ref<File[]>([]);

function readFiles(files: FileList | null) {
  selectedFiles.value = files ? Array.from(files) : [];
  form.imageUrls = selectedFiles.value.map((file) => `local://${file.name}`);
}

async function handleSubmit() {
  const result = await createSubmission(taskId.value, {
    content: form.content,
    imageUrls: form.imageUrls,
    token: authState.token,
  });

  await router.push(`/submissions/${result.id}/result`);
}
</script>

<template>
  <form class="page" @submit.prevent="handleSubmit">
    <h1>提交审核</h1>
    <label>
      完成说明
      <textarea v-model="form.content" aria-label="完成说明" />
    </label>
    <label>
      上传图片
      <input type="file" multiple accept="image/*" aria-label="上传图片" @change="readFiles(($event.target as HTMLInputElement).files)" />
    </label>
    <button type="submit">提交审核</button>
  </form>
</template>
