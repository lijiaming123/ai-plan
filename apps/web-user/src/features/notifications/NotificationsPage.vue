<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElTimePicker } from "element-plus";
import PageSectionHeading from "../../components/PageSectionHeading.vue";
import UiErrorToast from "../../components/UiErrorToast.vue";
import {
  getApiClient,
  type InAppNotificationItem,
} from "../../lib/api-client";
import { authState } from "../../stores/auth";

const router = useRouter();
const loading = ref(true);
const err = ref("");
const items = ref<InAppNotificationItem[]>([]);
const nextCursor = ref<string | null>(null);
const moreLoading = ref(false);

const remindAtInput = ref("20:00");
const pendingHint = ref<string | null>(null);
const prefsLoading = ref(false);
const saveOk = ref(false);

const canUse = computed(() => Boolean(authState.token));

function planLink(n: InAppNotificationItem) {
  return {
    path: `/plans/${n.planId}`,
    query: { slotKey: n.slotKey, openCheckin: "1" },
  };
}

async function loadPrefs() {
  if (!authState.token) return;
  try {
    const p = await getApiClient().getNotificationPreferences({
      token: authState.token,
    });
    remindAtInput.value = p.remindAt;
    if (p.pendingRemindAt) {
      pendingHint.value = `新时间 ${p.pendingRemindAt} 将在次日 0:00 起生效。`;
    } else {
      pendingHint.value = null;
    }
  } catch {
    /* 忽略 */
  }
}

async function loadFirst() {
  if (!authState.token) {
    items.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  err.value = "";
  try {
    const r = await getApiClient().listNotifications({
      token: authState.token,
      limit: 30,
    });
    items.value = r.items;
    nextCursor.value = r.nextCursor;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "加载失败";
    items.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (!authState.token || !nextCursor.value || moreLoading.value) return;
  moreLoading.value = true;
  try {
    const r = await getApiClient().listNotifications({
      token: authState.token,
      limit: 30,
      cursor: nextCursor.value,
    });
    items.value = items.value.concat(r.items);
    nextCursor.value = r.nextCursor;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "加载更多失败";
  } finally {
    moreLoading.value = false;
  }
}

async function onOpen(n: InAppNotificationItem) {
  if (authState.token) {
    try {
      if (!n.readAt) {
        await getApiClient().patchNotificationRead({
          token: authState.token,
          id: n.id,
        });
        n.readAt = new Date().toISOString();
      }
    } catch {
      /* 已读失败不阻塞跳转 */
    }
  }
  void router.push(planLink(n));
  window.dispatchEvent(new Event("notif-refresh"));
}

async function markAllRead() {
  if (!authState.token) return;
  try {
    await getApiClient().postNotificationsReadAll({ token: authState.token });
    await loadFirst();
    window.dispatchEvent(new Event("notif-refresh"));
  } catch (e) {
    err.value = e instanceof Error ? e.message : "操作失败";
  }
}

async function saveRemindTime() {
  if (!authState.token) return;
  prefsLoading.value = true;
  saveOk.value = false;
  try {
    const p = await getApiClient().patchNotificationPreferences({
      token: authState.token,
      remindAt: remindAtInput.value.trim(),
    });
    remindAtInput.value = p.remindAt;
    if (p.pendingRemindAt) {
      pendingHint.value = `新时间 ${p.pendingRemindAt} 将在次日 0:00 起生效`;
    } else {
      pendingHint.value = p.switchAt
        ? "新时刻将在次日 0:00 起生效"
        : null;
    }
    saveOk.value = true;
    window.setTimeout(() => {
      saveOk.value = false;
    }, 3200);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    prefsLoading.value = false;
  }
  await loadPrefs();
}

onMounted(async () => {
  await loadPrefs();
  await loadFirst();
});

watch(
  () => authState.token,
  () => {
    void loadPrefs();
    void loadFirst();
  },
);
</script>

<template>
  <div
    class="notif-page relative flex h-full min-h-0 w-full flex-col overflow-y-auto"
    data-testid="notifications-page-root"
  >
    <!-- 氛围：深绿雾 + 极轻噪点（编辑风 / 与产品绿轴一致，避免泛紫） -->
    <div
      class="pointer-events-none fixed inset-0 -z-10 notif-ambient"
      aria-hidden="true"
    />
    <UiErrorToast :message="err" @close="err = ''" />

    <header
      class="notif-hero notif-hero--editorial shrink-0 border-b border-emerald-900/[0.06] bg-gradient-to-br from-[#07140e]/[0.03] via-white/40 to-[#bfe6cc]/[0.2] px-4 pt-2 pb-5 sm:px-6"
    >
      <PageSectionHeading kicker="消息与提醒" title="通知中心" />
    </header>

    <div
      class="notif-content ui-scrollbar notif-content--tight min-h-0 flex-1 px-4 py-4 sm:px-6"
    >
      <div
        class="notif-col mx-auto w-full max-w-3xl space-y-6 pb-10"
        data-testid="notifications-col"
      >
        <!-- 设置：时间选择（更贴近系统控件风格） -->
        <div
          class="notif-unified notif-unified--in overflow-hidden rounded-[1.35rem] border border-[#0a3d22]/[0.08] bg-gradient-to-b from-white via-white to-[#f4faf6] shadow-[0_24px_50px_-38px_rgba(6,40,22,0.45)] ring-1 ring-[#cfe9d6]/50"
        >
          <section
            class="notif-pref-card notif-pref-card--in relative p-4 sm:p-5"
            data-testid="notifications-prefs"
          >
            <div
              class="notif-pref-ribbon"
              aria-hidden="true"
            />
            <div
              class="mb-4 flex flex-wrap items-center justify-between gap-2"
            >
              <p
                class="notif-pref-eyebrow text-[11px] font-bold uppercase tracking-[0.22em] text-[#1d4a2e]/80"
              >
                提醒时刻
              </p>
              <span
                v-if="saveOk"
                class="notif-saved-ok rounded-full bg-emerald-100/90 px-2.5 py-0.5 text-xs font-bold text-emerald-900"
                >已保存</span
              >
            </div>
            <div
              class="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4"
            >
              <div class="min-w-0 flex-1 sm:flex sm:items-end sm:gap-3">
                <span
                  class="notif-mute mb-1.5 block text-[12px] font-bold text-[#1a3028] sm:mb-0 sm:w-[4.5rem] sm:shrink-0 sm:pt-0.5"
                  >每日时刻</span
                >
                <div class="min-w-0 flex-1">
                  <div class="notif-time-shell">
                    <ElTimePicker
                      v-model="remindAtInput"
                      :disabled="!canUse || prefsLoading"
                      format="HH:mm"
                      value-format="HH:mm"
                      :clearable="false"
                      :editable="false"
                      :teleported="false"
                      placeholder="选择时间"
                      data-testid="notifications-prefs-time"
                    />
                  </div>
                  <p
                    class="notif-mute mt-2 pl-0.5 text-[11px] leading-snug sm:pl-0"
                  >
                    与「我的计划」同步 · Asia/Shanghai
                  </p>
                </div>
              </div>
              <button
                type="button"
                class="notif-save h-12 shrink-0 self-stretch rounded-xl border border-primary/20 bg-primary px-7 text-sm font-bold text-[#051208] shadow-[0_8px_26px_-10px_rgba(19,236,91,0.55)] transition [text-shadow:0_1px_0_rgba(255,255,255,0.25)] hover:brightness-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!canUse || prefsLoading"
                data-testid="notifications-prefs-save"
                @click="saveRemindTime"
              >
                {{ prefsLoading ? "保存中…" : "保存" }}
              </button>
            </div>
            <div
              v-if="pendingHint"
              class="notif-pending-bubble mt-3 flex gap-2 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-left text-xs leading-relaxed text-amber-950/90"
              role="status"
            >
              <span
                class="material-symbols-outlined shrink-0 text-[20px] text-amber-700/90"
                >schedule</span
              >
              <span class="pt-0.5">{{ pendingHint }}</span>
            </div>
          </section>
        </div>

        <!-- 列表区：与上方面板用间距分隔，减少重复说明 -->
        <div
          class="notif-list-head flex flex-wrap items-end justify-between gap-2 border-b border-[#a8c7b2]/50 pb-3"
        >
          <div>
            <h2
              class="fr-title notif-h2 text-lg font-[Fraunces,Georgia,serif] font-bold tracking-tight text-[#0a1810]"
            >
              消息
            </h2>
            <p
              v-if="canUse && loading"
              class="notif-mute mt-0.5 text-[12px]"
            >
              加载中…
            </p>
            <p
              v-else-if="canUse && items.length"
              class="notif-mute mt-0.5 text-[12px]"
            >
              共 {{ items.length }} 条{{
                nextCursor ? " · 可继续加载" : ""
              }}
            </p>
          </div>
          <button
            v-if="canUse && !loading && items.length > 0"
            type="button"
            class="text-sm font-bold text-[#0b5c32] transition hover:underline"
            data-testid="notifications-mark-all"
            @click="markAllRead"
          >
            全部已读
          </button>
        </div>

        <div
          v-if="loading"
          class="notif-skeleton space-y-3 py-1"
          aria-hidden="true"
        >
          <div
            v-for="i in 3"
            :key="`sk-${i}`"
            class="h-20 rounded-2xl bg-gradient-to-r from-slate-200/80 via-slate-100/90 to-slate-200/80 notif-skel-line"
          />
        </div>

        <div
          v-else-if="!canUse"
          class="notif-guest rounded-2xl border border-dashed border-amber-200/75 bg-amber-50/65 p-6 text-center text-sm text-amber-950/90 [text-wrap:balance]"
        >
          登录后查看提醒并与顶栏铃铛同步。
        </div>

        <div
          v-else
          class="space-y-3"
        >
          <ul class="notif-list" data-testid="notifications-list">
            <template v-if="items.length > 0">
              <li
                v-for="n in items"
                :key="n.id"
                class="notif-row"
                :class="n.readAt ? 'notif-row--read' : 'notif-row--unread'"
              >
                <button
                  type="button"
                  class="notif-row-btn"
                  data-testid="notification-item"
                  :data-nid="n.id"
                  @click="onOpen(n)"
                >
                  <span
                    class="notif-row-dot"
                    :class="n.readAt ? 'opacity-0' : 'opacity-100'"
                    aria-hidden="true"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-start justify-between gap-3">
                      <p class="notif-row-title line-clamp-1">
                        {{ n.title }}
                      </p>
                      <p class="notif-row-time shrink-0 tabular-nums">
                        {{
                          new Date(n.createdAt).toLocaleString("zh-CN", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        }}
                      </p>
                    </div>
                    <p class="notif-row-body line-clamp-2">
                      {{ n.body }}
                    </p>
                  </div>
                </button>
              </li>
            </template>

            <li
              v-else
              class="notif-row notif-row--empty"
              data-testid="notifications-empty"
            >
              <div class="notif-row-empty">
                <span
                  class="material-symbols-outlined text-[22px] text-[#0b5c32]/75"
                  aria-hidden="true"
                  >notifications</span
                >
                <div class="min-w-0">
                  <p class="font-extrabold text-[#0a1810]">暂无消息</p>
                  <p class="notif-mute mt-0.5 text-[12px]">
                    有未打时间槽时，会在这里出现提醒。
                  </p>
                </div>
                <router-link
                  to="/plans"
                  class="notif-cta notif-cta--ghost ms-auto inline-flex h-9 items-center justify-center rounded-full border border-[#0a8f4a]/25 bg-white/90 px-4 text-[13px] font-bold text-[#0b3d24] shadow-sm transition hover:border-primary/40 hover:bg-[#f0fdf4]"
                >
                  去我的计划
                </router-link>
              </div>
            </li>
          </ul>

        <div
          v-if="nextCursor"
          class="pt-1 flex justify-center"
        >
          <button
            type="button"
            class="rounded-full border-2 border-[#9cbea8]/60 bg-white/90 px-6 py-2.5 text-sm font-bold text-[#0f1f16] shadow-sm transition hover:border-primary/40 hover:bg-white disabled:opacity-50"
            :disabled="moreLoading"
            @click="loadMore"
          >
            {{ moreLoading ? "加载中…" : "加载更多" }}
          </button>
        </div>
        </div>
        <!-- /v-else 列表与空态 -->
      </div>
    </div>
  </div>
</template>

<style scoped>
.notif-ambient {
  background: radial-gradient(
      120% 80% at 0% 0%,
      rgba(15, 36, 25, 0.07) 0%,
      transparent 50%
    ),
    radial-gradient(
      100% 60% at 100% 0%,
      rgba(200, 230, 210, 0.35) 0%,
      transparent 45%
    ),
    linear-gradient(180deg, #e8f0e9 0%, #f3f6f2 100%);
  opacity: 0.95;
}
.notif-ambient::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E");
  mix-blend-mode: multiply;
  pointer-events: none;
}

.notif-tile-button {
  border: 1px solid transparent;
  min-height: 4.5rem;
  border-radius: 1rem;
}
.notif-tile-anim {
  animation: notif-tile-in 0.5s ease-out both;
  animation-delay: var(--d, 0ms);
}
@keyframes notif-tile-in {
  from {
    opacity: 0;
    transform: translateY(8px) skewX(-0.2deg);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.notif-skel-line {
  animation: notif-skel 1.1s ease-in-out infinite;
}
/* 统一面板：入场 + 区隔线（编辑感、少「卡片漂浮」） */
.notif-unified--in {
  animation: notif-unified-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes notif-unified-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
/* 时间选择：Element Plus 输入外观对齐系统 */
.notif-time-shell :deep(.el-date-editor.el-input),
.notif-time-shell :deep(.el-date-editor) {
  width: 100%;
  max-width: 12rem;
}
.notif-time-shell :deep(.el-input__wrapper) {
  min-height: 48px;
  border-radius: 0.9rem;
  border: 2px solid rgba(143, 191, 158, 0.7);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(250, 253, 251, 0.98) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 2px 10px rgba(18, 74, 49, 0.05);
  transition:
    border-color 0.2s ease,
    box-shadow 0.22s ease;
}
.notif-time-shell :deep(.el-input__wrapper.is-focus) {
  border-color: rgba(15, 139, 78, 0.5);
  box-shadow:
    0 0 0 3px rgba(15, 139, 78, 0.12),
    0 4px 16px rgba(18, 74, 49, 0.08);
}
.notif-time-shell :deep(.el-input__inner) {
  font-weight: 800;
  color: #0a1810;
}
.notif-time-shell :deep(.el-input__prefix) {
  color: rgba(10, 24, 16, 0.55);
}

/* 消息列表：标准列表行，而非卡片 */
.notif-list {
  border: 1px solid rgba(15, 60, 40, 0.12);
  border-radius: 1.15rem;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 20px 48px -40px rgba(8, 60, 32, 0.25);
}
.notif-row {
  border-top: 1px solid rgba(15, 60, 40, 0.08);
}
.notif-row:first-child {
  border-top: 0;
}
.notif-row-btn {
  width: 100%;
  display: flex;
  gap: 0.75rem;
  padding: 0.95rem 1rem;
  text-align: left;
  background: transparent;
  transition: background 0.16s ease;
}
.notif-row-btn:hover {
  background: rgba(200, 230, 210, 0.28);
}
.notif-row--unread .notif-row-btn {
  background: rgba(255, 255, 255, 0.88);
}
.notif-row-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  margin-top: 0.35rem;
  background: #c4a000;
  box-shadow: 0 0 0 4px rgba(196, 160, 0, 0.12);
}
.notif-row-title {
  font-size: 0.95rem;
  font-weight: 900;
  color: #0a1810;
}
.notif-row-body {
  margin-top: 0.25rem;
  font-size: 0.82rem;
  line-height: 1.35;
  color: rgba(48, 74, 60, 0.92);
}
.notif-row-time {
  font-size: 0.72rem;
  color: rgba(74, 99, 85, 0.95);
  padding-top: 0.15rem;
}
.notif-row--empty {
  background: rgba(255, 255, 255, 0.82);
}
.notif-row-empty {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.1rem 1rem;
}
/* 偏好卡片顶条，与主色绿衔接 */
.notif-pref-ribbon {
  pointer-events: none;
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 0.375rem;
  background: linear-gradient(
    90deg,
    rgba(19, 236, 91, 0.85) 0%,
    rgba(8, 100, 55, 0.4) 48%,
    rgba(19, 236, 91, 0.5) 100%
  );
}
/* 次要说明（部分区块仍用 Tailwind text- 颜色） */
.notif-mute {
  color: #4a6355;
}
/* 空态 CTA：与保存按钮成体系 */
.notif-cta--ghost {
  text-decoration: none;
}
@keyframes notif-skel {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 0.85;
  }
}

.notif-tile--unread {
  box-shadow: 0 18px 50px -28px rgba(15, 60, 40, 0.35);
}

.notif-tile--unread:hover,
.notif-tile-button:hover {
  border-color: rgba(110, 231, 183, 0.3);
  box-shadow: 0 20px 48px -30px rgba(8, 80, 48, 0.2);
}
.fr-title {
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
}
.notif-pref-hint {
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.2);
}
@media (prefers-reduced-motion: reduce) {
  .notif-tile-anim,
  .notif-skel-line,
  .notif-unified--in {
    animation: none;
  }
}
</style>
