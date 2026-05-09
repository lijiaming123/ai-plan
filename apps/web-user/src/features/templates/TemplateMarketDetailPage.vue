<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageSectionHeading from '../../components/PageSectionHeading.vue';
import UiErrorToast from '../../components/UiErrorToast.vue';
import { getApiClient, type MarketTemplateDetail } from '../../lib/api-client';
import { trackEvent } from '../../lib/telemetry';
import { authState } from '../../stores/auth';

const router = useRouter();
const route = useRoute();
const client = getApiClient();

const id = computed(() => String(route.params.id ?? '').trim());
const loading = ref(true);
const errorToastMessage = ref('');
const detail = ref<MarketTemplateDetail | null>(null);

const loggedIn = computed(() => Boolean(authState.token));

function goLogin() {
  void router.push('/auth/login');
}

async function loadDetail() {
  if (!id.value) return;
  loading.value = true;
  try {
    const res = await client.getMarketTemplateDetail({
      id: id.value,
      token: authState.token || undefined,
    });
    detail.value = res;
    // 详情打开埋点：仅登录态；绑定发布版本 id 便于后续版本维度统计
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
    const { planId } = await client.applyMarketTemplate({ id: detail.value.id, token: authState.token });
    trackEvent('template_use', {
      properties: {
        templateId: detail.value.id,
        templateSource: 'market',
        planId,
        versionId: detail.value.preview.versionId,
      },
    });
    await router.push(`/plans/${planId}`);
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '没能套用模板，请稍后再试';
  }
}

onMounted(() => {
  void loadDetail();
});
</script>

<template>
  <div class="ui-scrollbar h-full overflow-y-auto pr-1 pb-2 font-plan text-stone-800">
    <UiErrorToast :message="errorToastMessage" @close="errorToastMessage = ''" />

    <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <PageSectionHeading kicker="模板市场" title="模板详情">
        <p class="text-sm text-[#5d6a64]">查看预览并套用；仅展示公开字段。</p>
      </PageSectionHeading>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-5 py-2.5 text-sm font-bold text-stone-800 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/50"
        data-testid="btn-back"
        @click="router.back()"
      >
        <span class="material-symbols-outlined text-[20px]" aria-hidden="true">arrow_back</span>
        返回
      </button>
    </header>

    <p v-if="loading" class="flex items-center gap-2 text-sm text-[#5d6a64]" data-testid="detail-loading">
      <span class="material-symbols-outlined animate-pulse text-[#0a8f4a]" aria-hidden="true">hourglass_top</span>
      加载中…
    </p>

    <div
      v-else-if="!detail"
      class="rounded-2xl border border-dashed border-[#d0d8d3] bg-white/90 px-6 py-12 text-center text-sm text-[#7c8a84]"
      data-testid="detail-empty"
    >
      未找到该模板，或该模板暂不可见。
    </div>

    <section v-else class="space-y-4" data-testid="detail-body">
      <div class="rounded-2xl border border-[#e6ebe8] bg-white p-6 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xl font-extrabold text-stone-900" data-testid="detail-title">{{ detail.title }}</p>
            <p class="mt-1 text-sm leading-relaxed text-[#5d6a64]" data-testid="detail-summary">
              {{ detail.summary }}
            </p>
            <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#7c8a84]">
              <span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-900 ring-1 ring-emerald-200/70">
                <span class="material-symbols-outlined text-[14px]" aria-hidden="true">label</span>
                {{ detail.category }}
              </span>
              <span>{{ detail.authorName }}</span>
              <span class="text-[#c5d0c9]">·</span>
              <span class="inline-flex items-center gap-0.5 font-medium text-stone-600">
                <span class="material-symbols-outlined text-[14px] text-rose-500/90" aria-hidden="true">favorite</span>
                {{ detail.likeCount }}
              </span>
              <span class="text-[#c5d0c9]">·</span>
              <span class="inline-flex items-center gap-0.5 font-medium text-stone-600">
                <span class="material-symbols-outlined text-[14px]" aria-hidden="true">bolt</span>
                {{ detail.applicationCount }}
              </span>
            </div>
          </div>

          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-full bg-[#0a8f4a] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#088a42]"
            data-testid="detail-apply"
            @click="apply"
          >
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">bolt</span>
            {{ loggedIn ? '套用模板' : '登录后套用' }}
          </button>
        </div>

        <div class="mt-5 grid gap-3 rounded-2xl bg-stone-50/70 p-4 ring-1 ring-stone-200/70" data-testid="detail-preview">
          <p class="text-sm font-extrabold text-stone-900">结构化预览</p>
          <div class="grid gap-2 text-sm text-stone-800 sm:grid-cols-2">
            <div class="rounded-xl bg-white px-4 py-3 ring-1 ring-stone-200/70">
              <p class="text-xs font-semibold text-stone-500">目标</p>
              <p class="mt-1 font-semibold" data-testid="preview-goal">{{ detail.preview.goal }}</p>
            </div>
            <div class="rounded-xl bg-white px-4 py-3 ring-1 ring-stone-200/70">
              <p class="text-xs font-semibold text-stone-500">类型</p>
              <p class="mt-1 font-semibold" data-testid="preview-type">{{ detail.preview.type }}</p>
            </div>
            <div class="rounded-xl bg-white px-4 py-3 ring-1 ring-stone-200/70">
              <p class="text-xs font-semibold text-stone-500">截止时间</p>
              <p class="mt-1 font-semibold" data-testid="preview-deadline">{{ detail.preview.deadline }}</p>
            </div>
            <div class="rounded-xl bg-white px-4 py-3 ring-1 ring-stone-200/70">
              <p class="text-xs font-semibold text-stone-500">粒度</p>
              <p class="mt-1 font-semibold" data-testid="preview-granularity">
                {{ detail.preview.granularityMode ?? 'smart' }}
              </p>
            </div>
          </div>
          <div class="rounded-xl bg-white px-4 py-3 ring-1 ring-stone-200/70">
            <p class="text-xs font-semibold text-stone-500">计划内容（摘要）</p>
            <p class="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-stone-800" data-testid="preview-requirement">
              {{ detail.preview.requirementExcerpt }}
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

