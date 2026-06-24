<script setup lang="ts">
import LegalDocumentLayout from './LegalDocumentLayout.vue';
import { termsOfServiceSections } from './legal-content';
</script>

<template>
  <LegalDocumentLayout
    doc-id="terms"
    title="用户服务协议"
    :sections="termsOfServiceSections"
  />
</template>
