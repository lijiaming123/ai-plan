<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <div class="min-h-screen bg-[#f3f7f4] p-6 text-[#111813]">
    <p class="text-sm text-[#64716b]">计划草稿（占位）</p>
    <p class="mt-2 font-mono text-xs">plan id: {{ route.params.id }}</p>
  </div>
</template>
