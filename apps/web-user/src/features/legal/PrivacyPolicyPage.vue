<script setup lang="ts">
import LegalDocumentLayout from './LegalDocumentLayout.vue';
import { privacyPolicySections } from './legal-content';
</script>

<template>
  <LegalDocumentLayout
    doc-id="privacy"
    title="隐私政策"
    :sections="privacyPolicySections"
  />
</template>
