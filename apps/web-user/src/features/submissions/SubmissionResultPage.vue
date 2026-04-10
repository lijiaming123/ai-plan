<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const status = computed(() => String(route.query.status ?? 'completed'));
const totalScore = computed(() => String(route.query.totalScore ?? '86'));
const riskScore = computed(() => String(route.query.riskScore ?? '24'));
const missingItems = computed(() => String(route.query.missingItems ?? '补充图片证据'));
const statusLabel = computed(() => {
  return status.value === 'completed' ? '已通过' : '需补交';
});
const statusClass = computed(() => {
  return status.value === 'completed' ? 'status-completed' : 'status-needs-retry';
});
const scorePercent = computed(() => {
  const parsed = Number(totalScore.value);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
});
</script>

<template>
  <section class="page surface-card form-card">
    <span class="brand-badge">评估结果</span>
    <h1 class="hero-title">本次提交已完成系统判定</h1>
    <p class="hero-subtitle">根据 AI 评分与规则阈值生成结果，请按提示继续推进下一步。</p>

    <span class="status-pill" :class="statusClass">状态：{{ statusLabel }}</span>

    <div class="stats-grid">
      <article class="stat">
        <div class="stat-label">总分</div>
        <div class="stat-value">{{ totalScore }}</div>
      </article>
      <article class="stat">
        <div class="stat-label">风险分</div>
        <div class="stat-value">{{ riskScore }}</div>
      </article>
      <article class="stat">
        <div class="stat-label">原始状态码</div>
        <div class="stat-value">{{ status }}</div>
      </article>
    </div>

    <div class="hint-block">
      <p class="inline-note">评分进度可视化</p>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: `${scorePercent}%` }" />
      </div>
    </div>

    <div class="hint-block">
      <p class="inline-note">缺失项与建议</p>
      <p>{{ missingItems }}</p>
    </div>

    <div class="hint-block">
      <p class="inline-note">状态：{{ status }}</p>
      <p class="inline-note">分数：{{ totalScore }}</p>
      <p class="inline-note">缺失项：{{ missingItems }}</p>
    </div>
  </section>
</template>
