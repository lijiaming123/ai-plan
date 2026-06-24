<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { LEGAL_PRODUCT_NAME, LEGAL_ROUTES } from '../../lib/legal-meta';
</script>

<template>
  <footer class="mt-8 flex flex-col gap-4 text-center">
    <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
      <RouterLink
        :to="LEGAL_ROUTES.privacy"
        class="text-sm font-medium text-[#61896f] transition-colors hover:text-primary"
        data-testid="legal-link-privacy"
      >
        隐私政策
      </RouterLink>
      <RouterLink
        :to="LEGAL_ROUTES.terms"
        class="text-sm font-medium text-[#61896f] transition-colors hover:text-primary"
        data-testid="legal-link-terms"
      >
        用户协议
      </RouterLink>
    </div>
    <p class="text-xs text-[#61896f]">
      © {{ new Date().getFullYear() }} {{ LEGAL_PRODUCT_NAME }}. All Rights Reserved.
    </p>
  </footer>
</template>
