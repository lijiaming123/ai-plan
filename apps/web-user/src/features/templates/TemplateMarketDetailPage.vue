<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageSectionHeading from '../../components/PageSectionHeading.vue';
import UiErrorToast from '../../components/UiErrorToast.vue';
import { getApiClient, type MarketTemplateDetail } from '../../lib/api-client';
import { renderMarkdownToHtml } from '../../lib/render-markdown';
import { trackEvent } from '../../lib/telemetry';
import { authState } from '../../stores/auth';

const router = useRouter();
const route = useRoute();
const client = getApiClient();

const id = computed(() => String(route.params.id ?? '').trim());
const isPresetDetail = computed(() => route.name === 'template-preset-detail');
const loading = ref(true);
const errorToastMessage = ref('');
const detail = ref<MarketTemplateDetail | null>(null);

const loggedIn = computed(() => Boolean(authState.token));

const CATEGORY_LABEL: Record<string, string> = {
  general: '通用',
  study: '学习',
  travel: '旅游',
  work: '工作',
  exam: '考试',
  fitness: '运动',
  other: '其他',
};

const GRANULARITY_LABEL: Record<string, string> = {
  smart: '智能',
  deep: '深入',
  rough: '粗略',
};

function categoryLabel(slug: string) {
  const k = String(slug ?? '').trim().toLowerCase();
  return CATEGORY_LABEL[k] ?? slug;
}

function granularityLabel(v: string | null | undefined) {
  const k = String(v ?? 'smart').trim().toLowerCase();
  return GRANULARITY_LABEL[k] ?? (v ?? 'smart');
}

const sourceHint = computed(() =>
  isPresetDetail.value ? '来源 · 系统预设 · 公开字段' : '来源 · 用户模板 · 公开字段',
);

const summaryHtml = computed(() =>
  detail.value?.summary?.trim() ? renderMarkdownToHtml(detail.value.summary) : '',
);

const requirementBodyHtml = computed(() =>
  detail.value?.preview?.requirementExcerpt
    ? renderMarkdownToHtml(detail.value.preview.requirementExcerpt)
    : '',
);

function goLogin() {
  void router.push('/auth/login');
}

async function loadDetail() {
  if (!id.value) return;
  loading.value = true;
  try {
    const res = isPresetDetail.value
      ? await client.getPresetTemplateDetail({
          id: id.value,
          token: authState.token || undefined,
        })
      : await client.getMarketTemplateDetail({
          id: id.value,
          token: authState.token || undefined,
        });
    detail.value = res;
    if (authState.token) {
      trackEvent('template_detail_open', {
        properties: {
          templateId: res.id,
          versionId: res.preview.versionId,
        },
      });
    }
  } catch (e) {
    detail.value = null;
    errorToastMessage.value = e instanceof Error ? e.message : '没能加载模板详情，请稍后再试';
  } finally {
    loading.value = false;
  }
}

async function apply() {
  if (!loggedIn.value) {
    goLogin();
    return;
  }
  if (!detail.value) return;
  try {
    if (isPresetDetail.value) {
      const { planId } = await client.applyPresetTemplate({
        id: detail.value.id,
        token: authState.token,
      });
      trackEvent('template_use', {
        properties: {
          templateId: detail.value.id,
          templateSource: 'preset',
          planId,
          versionId: detail.value.preview.versionId,
        },
      });
      await router.push(`/plans/${planId}`);
    } else {
      const { planId } = await client.applyMarketTemplate({
        id: detail.value.id,
        token: authState.token,
      });
      trackEvent('template_use', {
        properties: {
          templateId: detail.value.id,
          templateSource: 'market',
          planId,
          versionId: detail.value.preview.versionId,
        },
      });
      await router.push(`/plans/${planId}`);
    }
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '没能套用模板，请稍后再试';
  }
}

watch(
  () => [String(route.params.id ?? '').trim(), String(route.name ?? '')] as const,
  ([newId]) => {
    if (!newId) {
      detail.value = null;
      loading.value = false;
      return;
    }
    void loadDetail();
  },
  { immediate: true },
);
</script>

<template>
  <div
    class="template-detail-root relative flex h-full min-h-0 w-full flex-col font-plan text-stone-800"
  >
    <!-- 顶栏：返回与标题同带，减少「返回」与正文割裂感 -->
    <header
      class="mb-5 shrink-0 rounded-3xl border border-stone-200/70 bg-white/75 p-4 shadow-[0_8px_30px_-18px_rgba(15,118,110,0.12)] ring-1 ring-white/80 backdrop-blur-sm sm:mb-6 sm:p-5"
    >
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div class="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <router-link
            to="/templates"
            class="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-2xl border border-stone-200/90 bg-white px-4 text-sm font-bold text-stone-800 shadow-sm transition hover:border-emerald-300/80 hover:bg-emerald-50/50 hover:text-emerald-950"
            data-testid="btn-back"
          >
            <span class="material-symbols-outlined text-[20px] text-emerald-700/90" aria-hidden="true"
              >arrow_back</span
            >
            返回模板
          </router-link>
          <div class="min-w-0 flex-1 border-t border-stone-100 pt-3 sm:border-t-0 sm:border-l sm:border-stone-200/70 sm:pl-4 sm:pt-0">
            <PageSectionHeading
              :kicker="isPresetDetail ? '系统预设' : '模板市场'"
              title="模板详情"
            >
              <p class="inline-flex items-center gap-2 text-[13px] leading-relaxed text-stone-500">
                <span
                  class="material-symbols-outlined shrink-0 text-[16px] text-emerald-600/80"
                  aria-hidden="true"
                  >info</span
                >
                <span>{{ sourceHint }}；套用前请核对下方预览与需求正文。</span>
              </p>
            </PageSectionHeading>
          </div>
        </div>
      </div>
    </header>

    <UiErrorToast :message="errorToastMessage" @close="errorToastMessage = ''" />

    <div
      class="ui-scrollbar relative min-h-0 flex-1 overflow-y-auto pb-24 pr-0.5 sm:pb-8 sm:pr-1 lg:pb-10"
    >
      <div
        v-if="loading"
        class="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-stone-200/80 bg-white/50 text-stone-500"
        data-testid="detail-loading"
      >
        <span
          class="inline-block h-9 w-9 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
          aria-hidden="true"
        />
        <span class="text-sm font-semibold">加载详情中…</span>
      </div>

      <div
        v-else-if="!detail"
        class="flex min-h-[240px] flex-col items-center justify-center rounded-3xl border border-dashed border-stone-300/90 bg-white/70 px-8 py-14 text-center text-sm text-stone-600 shadow-inner"
        data-testid="detail-empty"
      >
        <span
          class="material-symbols-outlined mb-3 text-5xl text-stone-300"
          aria-hidden="true"
          >layers_clear</span
        >
        <span class="text-lg font-bold text-stone-800">未找到该模板</span>
        <span class="mt-2 max-w-sm leading-relaxed text-stone-600">可能已下架或暂不可见。</span>
      </div>

      <section v-else class="mx-auto max-w-4xl space-y-0 pb-6" data-testid="detail-body">
        <div
          class="overflow-hidden rounded-3xl border border-stone-200/80 bg-white shadow-[0_20px_50px_-28px_rgba(15,118,110,0.18),0_0_0_1px_rgba(255,255,255,0.8)_inset] ring-1 ring-stone-100/80"
        >
          <!-- 英雄区：渐变衬底 + 主操作 -->
          <div
            class="relative border-b border-stone-100/90 bg-gradient-to-br from-emerald-50/60 via-white to-stone-50/30 px-5 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-8"
          >
            <div
              class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200/50 to-transparent"
              aria-hidden="true"
            />
            <div class="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
              <div class="min-w-0 flex-1">
                <h2
                  class="text-2xl font-bold leading-tight tracking-tight text-stone-900 sm:text-[1.65rem]"
                  data-testid="detail-title"
                >
                  {{ detail.title }}
                </h2>
                <div class="mt-4 flex flex-wrap items-center gap-2">
                  <span
                    class="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-emerald-900 shadow-sm ring-1 ring-emerald-200/60"
                  >
                    <span class="material-symbols-outlined text-[15px]" aria-hidden="true">label</span>
                    {{ categoryLabel(detail.category) }}
                  </span>
                  <template v-if="isPresetDetail">
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-stone-900/[0.04] px-2.5 py-1 text-xs font-bold text-stone-700 ring-1 ring-stone-200/80"
                    >
                      <span class="material-symbols-outlined text-[15px] text-emerald-700" aria-hidden="true"
                        >verified</span
                      >
                      系统内置
                    </span>
                  </template>
                  <template v-else>
                    <span
                      class="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-stone-600 ring-1 ring-stone-200/70"
                    >
                      <span class="material-symbols-outlined text-[15px] text-stone-400" aria-hidden="true"
                        >person</span
                      >
                      {{ detail.authorName }}
                    </span>
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-rose-50/90 px-2 py-1 text-xs font-bold text-rose-900 ring-1 ring-rose-200/60"
                    >
                      <span class="material-symbols-outlined text-[14px]" aria-hidden="true">favorite</span>
                      {{ detail.likeCount }}
                    </span>
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-amber-50/90 px-2 py-1 text-xs font-bold text-amber-950 ring-1 ring-amber-200/60"
                    >
                      <span class="material-symbols-outlined text-[14px]" aria-hidden="true">bolt</span>
                      {{ detail.applicationCount }} 次套用
                    </span>
                  </template>
                </div>
              </div>
              <button
                type="button"
                class="hidden w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#0cb358] to-[#0a8f4a] px-6 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_-8px_rgba(10,143,74,0.55)] transition hover:brightness-[1.03] active:scale-[0.99] sm:inline-flex sm:w-auto sm:self-start sm:rounded-full sm:py-3"
                data-testid="detail-apply"
                @click="apply"
              >
                <span class="material-symbols-outlined text-[22px]" aria-hidden="true">bolt</span>
                {{ loggedIn ? (isPresetDetail ? '套用预设' : '套用模板') : '登录后套用' }}
              </button>
            </div>
          </div>

          <div class="space-y-8 bg-white px-5 py-7 sm:px-8 sm:py-9">
            <div
              v-if="summaryHtml"
              class="overflow-hidden rounded-2xl border border-stone-200/70 bg-gradient-to-b from-stone-50/80 to-white shadow-sm"
              data-testid="detail-summary-panel"
            >
              <div
                class="flex items-center gap-2 border-b border-stone-100/90 bg-white/60 px-4 py-3 sm:px-5"
              >
                <span class="h-4 w-1 shrink-0 rounded-full bg-gradient-to-b from-emerald-400 to-[#0a8f4a]" />
                <span class="text-xs font-bold uppercase tracking-wider text-stone-500">简介</span>
              </div>
              <div class="template-detail-md px-4 py-4 sm:px-5 sm:py-5" v-html="summaryHtml" />
            </div>

            <div class="space-y-4" data-testid="detail-preview">
              <div class="flex items-center gap-2">
                <span class="h-4 w-1 shrink-0 rounded-full bg-gradient-to-b from-emerald-400 to-[#0a8f4a]" />
                <h3 class="text-base font-extrabold tracking-tight text-stone-900">结构化预览</h3>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <div
                  class="rounded-2xl border border-stone-100 bg-stone-50/40 p-4 shadow-sm ring-1 ring-white/80 transition hover:border-emerald-100/80 hover:shadow-md"
                >
                  <p class="text-[11px] font-bold uppercase tracking-wider text-stone-400">目标</p>
                  <p class="mt-2 text-sm font-bold leading-snug text-stone-900" data-testid="preview-goal">
                    {{ detail.preview.goal }}
                  </p>
                </div>
                <div
                  class="rounded-2xl border border-stone-100 bg-stone-50/40 p-4 shadow-sm ring-1 ring-white/80 transition hover:border-emerald-100/80 hover:shadow-md"
                >
                  <p class="text-[11px] font-bold uppercase tracking-wider text-stone-400">类型</p>
                  <p class="mt-2 text-sm font-bold leading-snug text-stone-900" data-testid="preview-type">
                    {{ categoryLabel(detail.preview.type) }}
                  </p>
                </div>
                <div
                  class="rounded-2xl border border-stone-100 bg-stone-50/40 p-4 shadow-sm ring-1 ring-white/80 transition hover:border-emerald-100/80 hover:shadow-md"
                >
                  <p class="text-[11px] font-bold uppercase tracking-wider text-stone-400">截止时间</p>
                  <p class="mt-2 text-sm font-bold leading-snug text-stone-900" data-testid="preview-deadline">
                    {{ detail.preview.deadline }}
                  </p>
                </div>
                <div
                  class="rounded-2xl border border-stone-100 bg-stone-50/40 p-4 shadow-sm ring-1 ring-white/80 transition hover:border-emerald-100/80 hover:shadow-md"
                >
                  <p class="text-[11px] font-bold uppercase tracking-wider text-stone-400">粒度</p>
                  <p class="mt-2 text-sm font-bold leading-snug text-stone-900" data-testid="preview-granularity">
                    {{ granularityLabel(detail.preview.granularityMode) }}
                  </p>
                </div>
              </div>

              <div
                class="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_12px_40px_-24px_rgba(15,80,50,0.08)] ring-1 ring-stone-100/90"
              >
                <div
                  class="flex items-center justify-between gap-3 border-b border-stone-100 bg-gradient-to-r from-stone-50/90 to-emerald-50/30 px-4 py-3 sm:px-5"
                >
                  <div class="flex items-center gap-2">
                    <span class="h-4 w-1 shrink-0 rounded-full bg-gradient-to-b from-emerald-400 to-[#0a8f4a]" />
                    <span class="text-xs font-bold uppercase tracking-wider text-stone-600">计划需求</span>
                  </div>
                  <span class="hidden text-[11px] font-medium text-stone-400 sm:inline">支持 Markdown 排版</span>
                </div>
                <div
                  class="template-detail-md max-h-[min(72vh,44rem)] overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5"
                  data-testid="preview-requirement"
                  v-html="requirementBodyHtml"
                />
              </div>
            </div>

            <div
              class="hidden flex-col gap-4 border-t border-stone-100 pt-8 sm:flex sm:flex-row sm:items-center sm:justify-between"
              data-testid="detail-bottom-cta"
            >
              <p class="max-w-md text-sm leading-relaxed text-stone-500">
                长文档可在上方「计划需求」区域内滚动阅读；确认无误后套用。
              </p>
              <button
                type="button"
                class="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#0cb358] to-[#0a8f4a] px-6 py-3 text-sm font-bold text-white shadow-[0_10px_24px_-8px_rgba(10,143,74,0.45)] transition hover:brightness-[1.03]"
                data-testid="detail-apply-bottom"
                @click="apply"
              >
                <span class="material-symbols-outlined text-[20px]" aria-hidden="true">bolt</span>
                {{ loggedIn ? (isPresetDetail ? '套用预设' : '套用模板') : '登录后套用' }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 小屏：主卡片内顶部按钮 hidden，底部固定条承载主 CTA -->
      <div
        v-if="detail && !loading"
        class="pointer-events-none fixed inset-x-0 bottom-0 z-30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden"
      >
        <div class="pointer-events-auto mx-auto flex max-w-4xl justify-stretch">
          <button
            type="button"
            class="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#0cb358] to-[#0a8f4a] py-3.5 text-sm font-bold text-white shadow-[0_12px_32px_-10px_rgba(10,143,74,0.55)] transition active:scale-[0.99]"
            data-testid="detail-apply-mobile"
            @click="apply"
          >
            <span class="material-symbols-outlined text-[22px]" aria-hidden="true">bolt</span>
            {{ loggedIn ? (isPresetDetail ? '套用预设' : '套用模板') : '登录后套用' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-detail-root {
  background-color: #f6f7f5;
  background-image:
    radial-gradient(ellipse 120% 70% at 50% -30%, rgba(16, 185, 129, 0.09), transparent 55%),
    radial-gradient(ellipse 80% 50% at 100% 20%, rgba(120, 113, 108, 0.04), transparent 45%),
    radial-gradient(ellipse 60% 40% at 0% 80%, rgba(16, 185, 129, 0.05), transparent 50%);
}

.template-detail-md :deep(h1),
.template-detail-md :deep(h2),
.template-detail-md :deep(h3) {
  margin: 1.1rem 0 0.55rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.32;
  color: #142820;
}
.template-detail-md :deep(h1) {
  font-size: 1.2rem;
}
.template-detail-md :deep(h2) {
  font-size: 1.05rem;
  color: #1a3d2e;
}
.template-detail-md :deep(h3) {
  font-size: 0.98rem;
  color: #234236;
}
.template-detail-md :deep(h1:first-child),
.template-detail-md :deep(h2:first-child),
.template-detail-md :deep(h3:first-child) {
  margin-top: 0;
}
.template-detail-md :deep(p) {
  margin: 0.55rem 0;
  font-size: 0.9rem;
  line-height: 1.72;
  color: #2f3d36;
}
.template-detail-md :deep(ul),
.template-detail-md :deep(ol) {
  margin: 0.5rem 0 0.75rem;
  padding-left: 1.35rem;
}
.template-detail-md :deep(li) {
  margin: 0.35rem 0;
  font-size: 0.9rem;
  line-height: 1.62;
  color: #3d5248;
}
.template-detail-md :deep(strong) {
  color: #0b5c34;
  font-weight: 800;
}
.template-detail-md :deep(code) {
  border-radius: 0.35rem;
  background: rgba(15, 139, 78, 0.09);
  padding: 0.12rem 0.4rem;
  font-size: 0.82em;
  font-weight: 600;
  color: #0a5c32;
}
.template-detail-md :deep(pre) {
  margin: 0.75rem 0;
  overflow-x: auto;
  border-radius: 0.7rem;
  border: 1px solid rgba(27, 111, 73, 0.14);
  background: linear-gradient(180deg, rgba(248, 252, 250, 1), rgba(241, 249, 244, 0.96));
  padding: 0.85rem 1rem;
  font-size: 0.82rem;
  line-height: 1.55;
}
.template-detail-md :deep(pre code) {
  padding: 0;
  background: none;
}
.template-detail-md :deep(blockquote) {
  margin: 0.75rem 0;
  border-left: 3px solid rgba(15, 139, 78, 0.42);
  padding-left: 1rem;
  color: #4a6358;
  font-style: italic;
}
.template-detail-md :deep(a) {
  color: #0d7a45;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.template-detail-md :deep(hr) {
  margin: 1.15rem 0;
  border: none;
  border-top: 1px solid rgba(27, 111, 73, 0.14);
}
</style>
