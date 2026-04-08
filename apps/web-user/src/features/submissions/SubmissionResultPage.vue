<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const status = computed(() => String(route.query.status ?? 'completed'));
const totalScore = computed(() => String(route.query.totalScore ?? '86'));
const riskScore = computed(() => String(route.query.riskScore ?? '24'));
const missingItems = computed(() => String(route.query.missingItems ?? '补充图片证据'));
</script>

<template>
  <section class="page">
    <h1>提交结果</h1>
    <p>状态：{{ status }}</p>
    <p>分数：{{ totalScore }}</p>
    <p>风险：{{ riskScore }}</p>
    <p>缺失项：{{ missingItems }}</p>
  </section>
</template>
