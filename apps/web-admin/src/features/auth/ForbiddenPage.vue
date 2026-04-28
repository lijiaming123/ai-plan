<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { adminPermissionMeta, getAdminPermissionLabel, getAdminRoleLabel } from '../../lib/admin-access';
import type { AdminPermission } from '../../lib/api-client';
import { adminProfile } from '../../stores/auth';

const route = useRoute();

const requiredPermission = computed(() => {
  const value = route.query.required;
  return typeof value === 'string' && value in adminPermissionMeta
    ? (value as AdminPermission)
    : null;
});

const fromPath = computed(() => (typeof route.query.from === 'string' ? route.query.from : ''));
const roleLabel = computed(() => getAdminRoleLabel(adminProfile.permissions));
const currentPermissionLabels = computed(() =>
  adminProfile.permissions.map((permission) => ({
    key: permission,
    label: getAdminPermissionLabel(permission as AdminPermission),
  })),
);
</script>

<template>
  <section class="page page--narrow access-page">
    <span class="badge">权限限制</span>
    <header class="section-stack">
      <h1 class="hero-title">当前账号无法访问这个页面</h1>
      <p class="hero-subtitle">
        你已登录为 <strong>{{ roleLabel }}</strong>，但访问的页面超出了当前授权范围。
      </p>
    </header>

    <div class="info-panel info-panel--warn">
      <p class="info-panel__title">访问说明</p>
      <p v-if="requiredPermission" class="info-panel__body">
        缺少权限：<strong>{{ getAdminPermissionLabel(requiredPermission) }}</strong>
      </p>
      <p v-if="requiredPermission" class="small-print">
        {{ adminPermissionMeta[requiredPermission].description }}
      </p>
      <p v-if="fromPath" class="small-print">目标页面：<code>{{ fromPath }}</code></p>
    </div>

    <div class="detail-grid">
      <section class="detail-card">
        <h2 class="detail-card__title">当前权限</h2>
        <div v-if="currentPermissionLabels.length" class="chip-row">
          <span v-for="permission in currentPermissionLabels" :key="permission.key" class="permission-chip">
            {{ permission.label }}
          </span>
        </div>
        <p v-else class="empty-hint">该账号已登录，但暂未授予任何后台权限。</p>
      </section>

      <section class="detail-card">
        <h2 class="detail-card__title">下一步</h2>
        <p class="small-print">可以先查看当前账号的权限说明页，确认已有授权和可访问模块。</p>
        <div class="button-row">
          <router-link class="primary-btn link-btn" to="/admin/access">查看权限页</router-link>
          <router-link class="ghost-btn link-btn" to="/admin">返回首页</router-link>
        </div>
      </section>
    </div>
  </section>
</template>
