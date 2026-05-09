<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import PageSectionHeading from "../../components/PageSectionHeading.vue";
import UiErrorToast from "../../components/UiErrorToast.vue";
import {
  getApiClient,
  type InAppNotificationItem,
} from "../../lib/api-client";
import { trackEvent } from "../../lib/telemetry";
import { authState } from "../../stores/auth";

const router = useRouter();
const loading = ref(true);
const err = ref("");
const listError = ref<string | null>(null);
const items = ref<InAppNotificationItem[]>([]);
const nextCursor = ref<string | null>(null);
const moreLoading = ref(false);

const remindAtInput = ref("20:00");
const pendingHint = ref<string | null>(null);
const prefsLoading = ref(false);
const saveOk = ref(false);

const canUse = computed(() => Boolean(authState.token));

function buildTimeOptions(stepMinutes = 15): string[] {
  const list: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += stepMinutes) {
      list.push(
        `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      );
    }
  }
  return list;
}

const baseTimeOptions = buildTimeOptions(15);
const timeOptions = computed(() => {
  const current = remindAtInput.value.trim();
  if (current && !baseTimeOptions.includes(current)) {
    return [current, ...baseTimeOptions];
  }
  return baseTimeOptions;
});

type FilterKey = "all" | "unread";
const filter = ref<FilterKey>("all");
const unreadCount = computed(() => items.value.filter((x) => !x.readAt).length);
const filteredItems = computed(() => {
  if (filter.value === "unread") return items.value.filter((x) => !x.readAt);
  return items.value;
});

const justReadId = ref<string | null>(null);
function bumpJustRead(id: string) {
  justReadId.value = id;
  window.setTimeout(() => {
    if (justReadId.value === id) justReadId.value = null;
  }, 700);
}

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
  listError.value = null;
  err.value = "";
  try {
    const r = await getApiClient().listNotifications({
      token: authState.token,
      limit: 30,
    });
    items.value = r.items;
    nextCursor.value = r.nextCursor;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "没能加载通知，请稍后再试";
    err.value = msg;
    listError.value = msg;
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
    err.value = e instanceof Error ? e.message : "没能加载更多，请稍后再试";
  } finally {
    moreLoading.value = false;
  }
}

async function onOpen(n: InAppNotificationItem) {
  const wasUnread = !n.readAt;
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
  if (wasUnread) bumpJustRead(n.id);
  trackEvent("notification_open", {
    properties: {
      notificationId: n.id,
      type: n.type,
      from: "notifications_page",
    },
  });
  void router.push(planLink(n));
  window.dispatchEvent(new Event("notif-refresh"));
}

async function markAllRead() {
  if (!authState.token) return;
  if (unreadCount.value <= 0) return;
  const ok = window.confirm("标记全部为已读？");
  if (!ok) return;
  try {
    await getApiClient().postNotificationsReadAll({ token: authState.token });
    await loadFirst();
    window.dispatchEvent(new Event("notif-refresh"));
  } catch (e) {
    err.value = e instanceof Error ? e.message : "没操作成功，请稍后再试";
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
    err.value = e instanceof Error ? e.message : "没保存成功，请稍后再试";
  } finally {
    prefsLoading.value = false;
  }
  await loadPrefs();
}

onMounted(async () => {
  await loadPrefs();
  await loadFirst();
  const onRefresh = () => void loadFirst();
  window.addEventListener("notif-refresh", onRefresh);
  onUnmounted(() => window.removeEventListener("notif-refresh", onRefresh));
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
    class="notif-page relative flex h-full min-h-0 w-full flex-col overflow-hidden font-plan text-[#1a2e22]"
    data-testid="notifications-page-root"
  >
    <UiErrorToast :message="err" @close="err = ''" />

    <!-- 柔和氛围底：与其他菜单页同系（渐变 + 轻噪点） -->
    <div
      class="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl opacity-90 notif-ambient"
      aria-hidden="true"
    />

    <header class="relative mb-4 shrink-0 pt-2 lg:mb-5">
      <PageSectionHeading kicker="消息与提醒" title="通知中心" />
    </header>

    <div class="ui-scrollbar relative min-h-0 flex-1 overflow-y-auto pr-1">
      <div class="relative pb-12 pt-0.5" data-testid="notifications-col">
        <!-- 设置：时间选择（更贴近系统控件风格） -->
        <div
          class="notif-unified notif-unified--in overflow-hidden rounded-[1.25rem] border border-white/80 bg-white/70 shadow-[0_18px_44px_-32px_rgba(15,50,35,0.35)] ring-1 ring-stone-200/60 backdrop-blur-sm"
        >
          <section
            class="notif-pref-card notif-pref-card--in relative p-5 sm:p-6"
            data-testid="notifications-prefs"
          >
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
              class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <div class="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
                <span
                  class="notif-mute mb-1.5 block text-[12px] font-bold text-[#1a3028] sm:mb-0 sm:w-[4.5rem] sm:shrink-0"
                  >每日时刻</span
                >
                <div class="min-w-0 flex-1">
                  <div class="max-w-[12rem]">
                    <ElSelect
                      v-model="remindAtInput"
                      class="ui-sunrise-el-select notif-time-select"
                      popper-class="ui-sunrise-select-dropdown"
                      placeholder="选择时间"
                      data-testid="notifications-prefs-time"
                      :disabled="!canUse || prefsLoading"
                    >
                      <ElOption
                        v-for="time in timeOptions"
                        :key="time"
                        :label="time"
                        :value="time"
                      />
                    </ElSelect>
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
                class="notif-save h-11 shrink-0 rounded-xl border border-primary/20 bg-primary px-7 text-sm font-bold text-[#051208] shadow-[0_8px_26px_-10px_rgba(19,236,91,0.55)] transition [text-shadow:0_1px_0_rgba(255,255,255,0.25)] hover:brightness-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
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
          class="notif-list-head mt-6 flex flex-wrap items-end justify-between gap-2 rounded-t-[1.25rem] border border-white/80 border-b-stone-200/70 bg-white/70 px-5 pt-4 pb-3 shadow-[0_18px_44px_-32px_rgba(15,50,35,0.35)] ring-1 ring-stone-200/60 backdrop-blur-sm"
        >
          <div>
            <h2
              class="notif-h2 text-lg font-bold tracking-tight text-stone-900"
            >
              消息
              <span
                v-if="canUse && unreadCount"
                class="notif-badge ms-2 align-middle"
              >
                未读 {{ unreadCount }}
              </span>
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
          <div class="flex flex-wrap items-center gap-2">
            <div
              v-if="canUse"
              class="notif-filter"
              role="tablist"
              aria-label="消息筛选"
            >
              <button
                type="button"
                class="notif-filter-btn"
                :class="filter === 'all' ? 'is-active' : ''"
                role="tab"
                :aria-selected="filter === 'all'"
                @click="filter = 'all'"
              >
                全部
              </button>
              <button
                type="button"
                class="notif-filter-btn"
                :class="filter === 'unread' ? 'is-active' : ''"
                role="tab"
                :aria-selected="filter === 'unread'"
                @click="filter = 'unread'"
              >
                未读
              </button>
            </div>
            <button
              v-if="canUse && !loading && items.length > 0 && unreadCount > 0"
              type="button"
              class="text-sm font-bold text-[#0b5c32] transition hover:underline"
              data-testid="notifications-mark-all"
              @click="markAllRead"
            >
              全部已读
            </button>
          </div>
        </div>

        <div
          v-if="loading"
          class="notif-skeleton rounded-b-[1.25rem] border border-t-0 border-white/80 bg-white/70 p-4 shadow-[0_18px_44px_-32px_rgba(15,50,35,0.35)] ring-1 ring-stone-200/60 backdrop-blur-sm"
          aria-hidden="true"
        >
          <div
            v-for="i in 3"
            :key="`sk-${i}`"
            class="mb-3 h-20 rounded-xl bg-gradient-to-r from-slate-200/80 via-slate-100/90 to-slate-200/80 notif-skel-line last:mb-0"
          />
        </div>

        <div
          v-else-if="!canUse"
          class="notif-guest rounded-b-[1.25rem] border border-t-0 border-amber-200/75 bg-amber-50/65 p-6 text-center text-sm text-amber-950/90 [text-wrap:balance]"
        >
          登录后查看提醒并与顶栏铃铛同步。
        </div>

        <div
          v-else
          class="space-y-3"
        >
          <ul class="notif-list" data-testid="notifications-list">
            <li
              v-if="listError"
              class="notif-row notif-row--error"
              data-testid="notifications-error"
            >
              <div class="notif-row-empty">
                <span
                  class="material-symbols-outlined text-[22px] text-amber-700/80"
                  aria-hidden="true"
                  >error</span
                >
                <div class="min-w-0">
                  <p class="font-extrabold text-[#0a1810]">没能加载出来</p>
                  <p class="notif-mute mt-0.5 text-[12px]">
                    {{ listError }}
                  </p>
                </div>
                <button
                  type="button"
                  class="notif-cta notif-cta--ghost ms-auto inline-flex h-9 items-center justify-center rounded-full border border-[#0a8f4a]/25 bg-white/90 px-4 text-[13px] font-bold text-[#0b3d24] shadow-sm transition hover:border-primary/40 hover:bg-[#f0fdf4]"
                  @click="loadFirst"
                >
                  重试
                </button>
              </div>
            </li>

            <template v-else-if="filteredItems.length > 0">
              <li
                v-for="n in filteredItems"
                :key="n.id"
                class="notif-row"
                :class="[
                  n.readAt ? 'notif-row--read' : 'notif-row--unread',
                  justReadId === n.id ? 'is-just-read' : '',
                ]"
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
                  <p class="font-extrabold text-[#0a1810]">
                    {{ filter === "unread" ? "暂无未读" : "暂无消息" }}
                  </p>
                  <p class="notif-mute mt-0.5 text-[12px]">
                    {{ filter === "unread" ? "切到「全部」可查看历史消息。" : "有待打卡的节点时，会在这里提醒你。" }}
                  </p>
                </div>
                <button
                  type="button"
                  class="notif-cta notif-cta--ghost inline-flex h-9 items-center justify-center rounded-full border border-[#0a8f4a]/25 bg-white/90 px-4 text-[13px] font-bold text-[#0b3d24] shadow-sm transition hover:border-primary/40 hover:bg-[#f0fdf4]"
                  @click="loadFirst"
                >
                  刷新
                </button>
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
/* 通知页时间选择：复用全局 Element Plus Select 体系 */
.notif-time-select {
  width: 100%;
}
.notif-time-select :deep(.el-select__selected-item) {
  font-size: 0.9375rem;
  font-weight: 700;
  color: #0f1f16;
}
.notif-time-select :deep(.el-select__placeholder) {
  font-size: 0.9375rem;
}

/* 消息列表：标准列表行，而非卡片 */
.notif-list {
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-top: 0;
  border-radius: 0 0 1.25rem 1.25rem;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.7);
  box-shadow: 0 18px 44px -32px rgba(15, 50, 35, 0.35);
  backdrop-filter: blur(6px);
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
.notif-row--error {
  background: rgba(255, 251, 235, 0.85);
}
.notif-row--error .notif-row-empty {
  border-left: 3px solid rgba(217, 119, 6, 0.55);
}
.notif-badge {
  display: inline-flex;
  align-items: center;
  height: 1.25rem;
  padding: 0 0.5rem;
  border-radius: 999px;
  background: rgba(255, 251, 235, 0.9);
  border: 1px solid rgba(217, 119, 6, 0.25);
  color: rgba(120, 53, 15, 0.95);
  font-size: 0.72rem;
  font-weight: 900;
}
.notif-filter {
  display: inline-flex;
  border-radius: 0.8rem;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: rgba(248, 250, 252, 0.8);
  overflow: hidden;
}
.notif-filter-btn {
  padding: 0.4rem 0.8rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: rgba(71, 85, 105, 0.95);
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.notif-filter-btn:hover {
  background: rgba(255, 255, 255, 0.9);
}
.notif-filter-btn.is-active {
  background: rgba(255, 255, 255, 0.96);
  color: rgb(28 25 23);
  box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.25);
}
.notif-row.is-just-read .notif-row-dot {
  animation: notif-dot-fade 0.45s ease-out both;
}
.notif-row.is-just-read .notif-row-btn {
  animation: notif-row-soft 0.55s ease-out both;
}
@keyframes notif-dot-fade {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.6);
  }
}
@keyframes notif-row-soft {
  from {
    background: rgba(255, 251, 235, 0.55);
  }
  to {
    background: rgba(255, 255, 255, 0.0);
  }
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
