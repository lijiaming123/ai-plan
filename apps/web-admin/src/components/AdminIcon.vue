<script setup lang="ts">
const props = defineProps<{
  name:
    | 'dashboard'
    | 'funnel'
    | 'retention'
    | 'path'
    | 'users'
    | 'rules'
    | 'submissions'
    | 'audit'
    | 'access'
    | 'admin-users';
}>();
</script>

<template>
  <svg
    v-if="props.name === 'dashboard'"
    class="admin-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4 13V6a2 2 0 0 1 2-2h6v9H4Z" />
    <path d="M12 20H6a2 2 0 0 1-2-2v-5h8v7Z" />
    <path d="M12 4h6a2 2 0 0 1 2 2v4h-8V4Z" />
    <path d="M20 10v8a2 2 0 0 1-2 2h-6v-10h8Z" />
  </svg>

  <svg
    v-else-if="props.name === 'funnel'"
    class="admin-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4 6h16" />
    <path d="M6 6l6 7 6-7" />
    <path d="M12 13v7" />
    <path d="M9 20h6" />
  </svg>

  <svg
    v-else-if="props.name === 'retention'"
    class="admin-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M6 7h12" />
    <path d="M6 12h8" />
    <path d="M6 17h10" />
    <path d="M18 12l2 2-2 2" />
  </svg>

  <svg
    v-else-if="props.name === 'path'"
    class="admin-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M7 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
    <path d="M21 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
    <path d="M5 7h6c2 0 3 1 3 3v4c0 2 1 3 3 3h2" />
  </svg>

  <svg
    v-else-if="props.name === 'users'"
    class="admin-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
    <path d="M4 20a8 8 0 0 1 16 0" />
  </svg>

  <svg
    v-else-if="props.name === 'rules'"
    class="admin-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M8 7h12" />
    <path d="M8 12h12" />
    <path d="M8 17h12" />
    <path d="M4 7h0" />
    <path d="M4 12h0" />
    <path d="M4 17h0" />
  </svg>

  <svg
    v-else-if="props.name === 'submissions'"
    class="admin-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M7 3h10v4H7V3Z" />
    <path d="M8 11h8" />
    <path d="M8 15h8" />
    <path d="M7 7H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1" />
  </svg>

  <svg
    v-else-if="props.name === 'audit'"
    class="admin-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3l7 4v6c0 5-3.5 8.5-7 9-3.5-.5-7-4-7-9V7l7-4Z" />
    <path d="M9 12l2 2 4-5" />
  </svg>

  <svg
    v-else-if="props.name === 'admin-users'"
    class="admin-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19 8v6" />
    <path d="M22 11h-6" />
  </svg>

  <svg
    v-else
    class="admin-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3l9 4-9 4-9-4 9-4Z" />
    <path d="M3 7v10l9 4 9-4V7" />
    <path d="M12 11v10" />
  </svg>
</template>

<style scoped>
.admin-icon {
  width: 1.05rem;
  height: 1.05rem;
  flex: 0 0 auto;
}
</style>

