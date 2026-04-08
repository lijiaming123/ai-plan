<script setup lang="ts">
import { reactive } from 'vue';
import { useRouter } from 'vue-router';
import { getApiClient } from '../../lib/api-client';
import { authState } from '../../stores/auth';

const router = useRouter();
const form = reactive({
  goal: '',
  deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  requirement: '',
  type: 'general' as const,
});

async function handleSubmit() {
  const client = getApiClient();
  const plan = await client.createPlan({
    goal: form.goal,
    deadline: form.deadline,
    requirement: form.requirement,
    type: form.type,
    token: authState.token,
  });

  await router.push(`/plans/${plan.id}`);
}
</script>

<template>
  <form class="page" @submit.prevent="handleSubmit">
    <h1>新建计划</h1>
    <label>
      目标
      <input v-model="form.goal" aria-label="目标" />
    </label>
    <label>
      截止时间
      <input v-model="form.deadline" aria-label="截止时间" />
    </label>
    <label>
      要求
      <textarea v-model="form.requirement" aria-label="要求" />
    </label>
    <label>
      计划类型
      <select v-model="form.type" aria-label="计划类型">
        <option value="general">通用</option>
        <option value="study">学习</option>
        <option value="work">工作</option>
      </select>
    </label>
    <button type="submit">生成计划</button>
  </form>
</template>
