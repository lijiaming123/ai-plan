<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const planId = computed(() => String(route.params.id ?? ''));
</script>

<template>
  <section class="page">
    <h1>计划详情</h1>
    <p>计划编号：{{ planId }}</p>
  </section>
</template>
