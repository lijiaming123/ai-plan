<script setup lang="ts">
import { reactive } from 'vue';
import { useRouter } from 'vue-router';
import { getApiClient } from '../../lib/api-client';
import { setAuthToken } from '../../stores/auth';

const router = useRouter();
const form = reactive({
  email: 'demo@ai-plan.dev',
  password: 'Pass1234!',
});

async function handleSubmit() {
  const client = getApiClient();
  const result = await client.login(form);
  setAuthToken(result.token);
  await router.push('/plans/new');
}
</script>

<template>
  <form class="page" @submit.prevent="handleSubmit">
    <h1>登录</h1>
    <label>
      邮箱
      <input v-model="form.email" type="email" aria-label="邮箱" />
    </label>
    <label>
      密码
      <input v-model="form.password" type="password" aria-label="密码" />
    </label>
    <button type="submit">登录</button>
  </form>
</template>
