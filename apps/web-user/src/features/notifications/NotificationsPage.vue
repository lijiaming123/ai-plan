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

type NotifRuleTip = {
  icon: string;
  title: string;
  desc: string;
  badge?: string;
};

const tipItems: NotifRuleTip[] = [
  {
    icon: "calendar_today",
    title: "日计划",
    desc: "今天未打的时间槽，在提醒时刻前后约 10 分钟各推一条。",
  },
  {
    icon: "date_range",
    title: "周计划",
    badge: "周日",
    desc: "不每日推送，仅在当周周日同一时刻提醒本周未打周槽。",
  },
  {
    icon: "update",
    title: "改时间",
    desc: "新时刻自次日 0:00 起生效。",
  },
];

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
        class="notif-col mx-auto max-w-2xl space-y-6 pb-10"
        data-testid="notifications-col"
      >
        <!-- 规则 + 设置：单面板成组，减少「两块漂浮」感 -->
        <div
          class="notif-unified notif-unified--in overflow-hidden rounded-[1.35rem] border border-[#0a3d22]/[0.08] bg-gradient-to-b from-white via-white to-[#f4faf6] shadow-[0_24px_50px_-38px_rgba(6,40,22,0.45)] ring-1 ring-[#cfe9d6]/50"
        >
          <section
            class="notif-tips notif-tips--in flex flex-col sm:flex-row sm:items-stretch"
            aria-label="打卡提醒规则"
          >
            <div
              v-for="(it, i) in tipItems"
              :key="`tip-${i}`"
              class="notif-tip-pill notif-tip-pill--in sm:flex-1"
            >
              <div class="notif-tip-pill__top">
                <span
                  class="notif-tip-pill-ico"
                  :class="i === 0 ? 'notif-ico--day' : i === 1 ? 'notif-ico--week' : 'notif-ico--time'"
                  aria-hidden="true"
                >
                  <span class="material-symbols-outlined notif-ico-raw">{{
                    it.icon
                  }}</span>
                </span>
                <p class="notif-tip-pill-t">
                  {{ it.title }}
                  <span
                    v-if="it.badge"
                    class="notif-tip-pill-badge"
                    >{{ it.badge }}</span
                  >
                </p>
              </div>
              <p class="notif-tip-pill-b">{{ it.desc }}</p>
            </div>
          </section>

          <div
            class="notif-unified__sep"
            aria-hidden="true"
          />

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
                  <label
                    class="block w-full min-w-0"
                  >
                    <span class="sr-only">选择提醒时间</span>
                    <input
                      v-model="remindAtInput"
                      type="time"
                      :disabled="!canUse || prefsLoading"
                      class="notif-time-in h-12 w-full max-w-[12rem] cursor-pointer rounded-xl border-2 border-[#8fbf9e]/80 bg-white/95 px-3.5 text-base font-semibold text-[#0a1810] [color-scheme:light] shadow-inner shadow-white/40 transition focus:border-primary/45 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      data-testid="notifications-prefs-time"
                    />
                  </label>
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
        <ul
          v-if="items.length > 0"
          class="notif-stagger space-y-3"
        >
          <li
            v-for="(n, i) in items"
            :key="n.id"
            class="notif-tile notif-tile-anim group relative overflow-hidden rounded-2xl"
            :style="{ '--d': `${40 + i * 55}ms` } as Record<string, string>"
          >
            <button
              type="button"
              class="notif-tile-button flex w-full min-w-0 text-left"
              :class="
                n.readAt
                  ? 'border-white/30 bg-white/55'
                  : 'notif-tile--unread border-l-[3px] border-l-[#c4a000] border-white/40 bg-white/88 shadow-[0_1px_0_rgba(255,255,255,0.65)_inset]'
              "
              data-testid="notification-item"
              :data-nid="n.id"
              @click="onOpen(n)"
            >
              <div
                class="notif-rip pointer-events-none absolute -left-8 top-0 h-24 w-24 rotate-12 rounded-3xl bg-gradient-to-br from-amber-400/20 to-transparent opacity-0 transition group-hover:opacity-100"
                aria-hidden="true"
              />
              <div class="relative min-w-0 flex-1 p-4 sm:p-4">
                <div
                  class="mb-1 flex flex-wrap items-baseline gap-2"
                >
                  <span
                    v-if="!n.readAt"
                    class="inline-block h-2 w-2 rounded-full bg-amber-500"
                    title="未读"
                  />
                  <span
                    class="line-clamp-1 font-jakarta text-sm font-extrabold text-[#0a1810] [font-family:var(--notif-sans,Plus_Jakarta_Sans,system-ui,sans-serif)]"
                    >{{ n.title }}</span
                  >
                </div>
                <p
                  class="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-[#3a4e44]"
                >
                  {{ n.body }}
                </p>
                <p
                  class="notif-tile-meta mt-2 text-[11px] text-[#6a7a72] tabular-nums"
                >
                  {{
                    new Date(n.createdAt).toLocaleString("zh-CN", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }}
                  <span
                    v-if="n.type === 'checkin_due_week'"
                    class="ml-1.5 rounded bg-emerald-100/90 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900"
                    >周</span
                  >
                </p>
              </div>
            </button>
          </li>
        </ul>

        <div
          v-else
          class="notif-empty notif-empty--hero flex min-h-[min(52vh,360px)] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#7aab8e]/45 bg-gradient-to-b from-white/80 to-[#e8f3ec]/90 px-6 py-12 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
          data-testid="notifications-empty"
        >
          <div
            class="notif-empty-orbit relative mb-1"
            aria-hidden="true"
          >
            <div
              class="notif-empty-ring pointer-events-none absolute -inset-3 rounded-[2rem] bg-gradient-to-tr from-primary/25 via-emerald-200/35 to-amber-100/45 opacity-90 blur-md"
            />
            <div
              class="notif-empty-icon-tile relative flex h-[7.5rem] w-[7.5rem] items-center justify-center rounded-[1.35rem] bg-gradient-to-br from-[#0a2218] via-[#0e3d27] to-[#166b3a] text-primary shadow-[0_20px_50px_-24px_rgba(8,90,48,0.75)] ring-2 ring-primary/35"
            >
              <span
                class="material-symbols-outlined text-[4.25rem] leading-none text-primary drop-shadow-md"
                >notifications</span
              >
            </div>
          </div>
          <p
            class="fr-title mt-1 text-2xl font-[Fraunces,Georgia,serif] font-bold text-[#0a1810]"
          >
            暂无未读
          </p>
          <p
            class="notif-mute max-w-xs text-sm leading-relaxed [text-wrap:balance]"
          >
            有未打时间槽时，会按规则在此推送。
          </p>
          <router-link
            to="/plans"
            class="notif-cta notif-cta--ghost mt-2 inline-flex h-10 items-center justify-center rounded-full border-2 border-[#0a8f4a]/32 bg-white/95 px-5 text-sm font-bold text-[#0b3d24] shadow-sm transition hover:border-primary/45 hover:bg-[#f0fdf4]"
          >
            去我的计划
          </router-link>
        </div>

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
  @apply border border-transparent;
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
.notif-unified__sep {
  height: 1px;
  margin: 0 0.5rem;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(12, 90, 50, 0.14) 50%,
    transparent 100%
  );
}

/* 规则条：行首图标 + 桌面分栏 */
.notif-tips--in {
  @apply p-3.5 sm:px-4 sm:py-4;
}
.notif-tip-pill--in {
  @apply flex flex-col gap-0;
}
.notif-tip-pill__top {
  @apply flex items-start gap-2.5;
}
.notif-tip-pill-ico {
  @apply mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl;
}
.notif-tip-pill-t {
  @apply min-w-0 flex-1 text-sm font-extrabold leading-snug text-[#0a1810];
}
.notif-tip-pill-badge {
  @apply ms-1 inline-flex align-middle rounded-md bg-amber-200/90 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-950/95;
  vertical-align: 0.08em;
}
.notif-tips--in .notif-tip-pill--in {
  @apply border-b border-[#0a8f4a]/[0.1] py-1 pb-3;
}
.notif-tips--in .notif-tip-pill--in:last-of-type {
  @apply border-b-0 pb-1;
}
@media (min-width: 640px) {
  .notif-tips--in .notif-tip-pill--in {
    @apply border-b-0 border-r border-[#0a8f4a]/[0.12] px-3 py-0 pb-0;
  }
  .notif-tips--in .notif-tip-pill--in:first-of-type {
    @apply pl-0;
  }
  .notif-tips--in .notif-tip-pill--in:last-of-type {
    @apply border-r-0 pr-0;
  }
}
.notif-tip-pill-b {
  @apply mt-2 text-[12.5px] leading-relaxed text-[#304a3c] [text-wrap:balance];
  padding-left: 2.5rem;
}
@media (min-width: 640px) {
  .notif-tips--in .notif-tip-pill--in .notif-tip-pill-b {
    @apply mt-1.5 max-w-none pl-0;
  }
}
.notif-ico--day {
  @apply bg-emerald-200/50 text-[#0b2818];
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}
.notif-ico--week {
  @apply bg-amber-200/55 text-amber-950/95;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
}
.notif-ico--time {
  @apply bg-[#c5ddd0]/80 text-[#0f2418];
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
}
.notif-ico-raw {
  @apply text-[1.1rem] leading-none;
}
/* 下方偏好区与规则共用外轮廓 */
.notif-pref-card--in {
  @apply border-t-0;
}
/* 偏好卡片顶条，与主色绿衔接 */
.notif-pref-ribbon {
  @apply pointer-events-none absolute left-0 right-0 top-0 h-1.5;
  background: linear-gradient(
    90deg,
    rgba(19, 236, 91, 0.85) 0%,
    rgba(8, 100, 55, 0.4) 48%,
    rgba(19, 236, 91, 0.5) 100%
  );
}
/* 次要说明（部分区块仍用 Tailwind text- 颜色） */
.notif-mute {
  @apply text-[#4a6355];
}
/* 空态 CTA：与保存按钮成体系 */
.notif-cta--ghost {
  @apply no-underline;
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
  @apply border-emerald-300/30;
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
