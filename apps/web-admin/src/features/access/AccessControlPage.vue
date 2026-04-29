<script setup lang="ts">
import { computed } from 'vue';
import {
  adminPageMatrix,
  adminPermissionMeta,
  adminPresetMeta,
  getAdminPermissionLabel,
  getAdminRoleLabel,
  hasAdminPermission,
} from '../../lib/admin-access';
import type { AdminPermission } from '../../lib/api-client';
import { adminProfile } from '../../stores/auth';

const roleLabel = computed(() => getAdminRoleLabel(adminProfile.permissions));

const permissions = computed(() => adminProfile.permissions as AdminPermission[]);

const matchedPreset = computed(() => {
  const current = [...permissions.value].sort().join('|');
  return (
    adminPresetMeta.find((preset) => [...preset.permissions].sort().join('|') === current) ?? null
  );
});
</script>

<template>
  <section class="page page--wide access-page">
    <span class="badge">角色权限</span>
    <header class="section-stack">
      <h1 class="hero-title">权限与访问矩阵</h1>
      <p class="hero-subtitle">
        当前登录账号为 <strong>{{ adminProfile.email || '未识别账号' }}</strong
        >，角色包判定为 <strong>{{ roleLabel }}</strong>。
      </p>
    </header>

    <div class="stats-grid">
      <article class="stat-card">
        <span class="stat-label">当前权限数</span>
        <strong class="stat-value">{{ permissions.length }}</strong>
        <p class="stat-help">控制台功能按最小授权原则显示。</p>
      </article>
      <article class="stat-card">
        <span class="stat-label">角色包</span>
        <strong class="stat-value">{{ matchedPreset?.label ?? '自定义' }}</strong>
        <p class="stat-help">{{ matchedPreset?.description ?? '当前权限组合与预置角色包不完全一致。' }}</p>
      </article>
      <article class="stat-card">
        <span class="stat-label">账号标识</span>
        <strong class="stat-value stat-value--small">{{ adminProfile.userId || '未返回' }}</strong>
        <p class="stat-help">标识来自 `/auth/admin/me` 返回结果。</p>
      </article>
    </div>

    <section class="detail-card">
      <h2 class="detail-card__title">当前授权</h2>
      <div v-if="permissions.length" class="permission-grid">
        <article v-for="permission in permissions" :key="permission" class="permission-card">
          <div class="permission-card__top">
            <span class="permission-chip">{{ getAdminPermissionLabel(permission) }}</span>
            <code>{{ permission }}</code>
          </div>
          <p class="small-print">{{ adminPermissionMeta[permission].description }}</p>
        </article>
      </div>
      <p v-else class="empty-hint">
        该账号还没有分配任何后台权限，登录后只能进入权限说明页。需要继续使用时，请联系具备权限管理能力的管理员。
      </p>
    </section>

    <section class="detail-card">
      <h2 class="detail-card__title">页面访问矩阵</h2>
      <div class="matrix-list">
        <article v-for="item in adminPageMatrix" :key="item.to" class="matrix-item">
          <div class="matrix-item__head">
            <div>
              <strong>{{ item.title }}</strong>
              <p class="small-print">{{ item.description }}</p>
            </div>
            <span
              class="status-pill"
              :class="hasAdminPermission(permissions, item.permission) ? 'status-pill--ok' : 'status-pill--muted'"
            >
              {{ hasAdminPermission(permissions, item.permission) ? '可访问' : '未授权' }}
            </span>
          </div>
          <router-link class="link-accent" :to="item.to">打开页面</router-link>
        </article>
      </div>
    </section>

    <section class="detail-card">
      <h2 class="detail-card__title">预置角色包</h2>
      <div class="permission-grid">
        <article v-for="preset in adminPresetMeta" :key="preset.key" class="permission-card">
          <div class="permission-card__top">
            <strong>{{ preset.label }}</strong>
            <span
              class="status-pill"
              :class="matchedPreset?.key === preset.key ? 'status-pill--ok' : 'status-pill--muted'"
            >
              {{ matchedPreset?.key === preset.key ? '当前匹配' : '预置方案' }}
            </span>
          </div>
          <p class="small-print">{{ preset.description }}</p>
          <div class="chip-row">
            <span v-for="permission in preset.permissions" :key="permission" class="permission-chip">
              {{ getAdminPermissionLabel(permission) }}
            </span>
          </div>
        </article>
      </div>
    </section>

    <section class="detail-card">
      <h2 class="detail-card__title">开通说明</h2>
      <p class="small-print">
        演示环境支持在注册页自助创建 <strong>运营分析</strong> 和 <strong>审计只读</strong> 账号；生产环境建议由具备权限管理能力的管理员统一开通。
      </p>
    </section>
  </section>
</template>
