<script setup lang="ts">
import { computed, ref } from 'vue';

type FaqCategory = 'plan' | 'task' | 'template' | 'account';

type FaqItem = {
  id: string;
  category: FaqCategory;
  title: string;
  body: string;
  /** 参与搜索的补充词 */
  keywords: string;
};

const faqs: FaqItem[] = [
  {
    id: 'create-plan',
    category: 'plan',
    title: '如何创建计划？',
    body: '点击顶部「创建新计划」，填写目标、周期与补充说明；专业版可使用 AI 辅助生成初稿。生成后请在草稿页核对阶段与任务，确认后计划进入执行。',
    keywords: '新建 草稿 确认 AI',
  },
  {
    id: 'draft-confirm',
    category: 'plan',
    title: '草稿与「确认版本」是什么？',
    body: '草稿页保存多个生成版本，可对比差异；确认某一版本后，计划结构才会固定为当前执行视图。未确认前可随时重新生成（受版本次数限制）。',
    keywords: '版本 对比 再生',
  },
  {
    id: 'submit-proof',
    category: 'task',
    title: '如何提交任务证明？',
    body: '在计划详情进入具体任务，填写文字说明并上传图片证据后提交。提交将进入审核流，系统会记录时间与内容便于后续查看。',
    keywords: '上传 图片 审核',
  },
  {
    id: 'ai-score',
    category: 'task',
    title: 'AI 评分与人工审核？',
    body: '当前演示环境以流程占位为主：提交后可查看状态变化。正式环境将按规则配置接入自动判定与人工复核。',
    keywords: '评分 判定 状态',
  },
  {
    id: 'templates',
    category: 'template',
    title: '模板市场与「我的模板」？',
    body: '在「模板」页可浏览系统预设与用户发布的模板，一键套用生成计划；登录后可在「我的模板」查看已发布、收藏与点赞的社区模板。',
    keywords: '套用 预设 收藏 点赞',
  },
  {
    id: 'pro-tier',
    category: 'account',
    title: '基础版与专业版区别？',
    body: '「设置」中可查看当前方案。专业版在演示环境可通过「模拟开通」体验；正式能力以后端策略为准，通常包含更深度的拆解与提醒选项。',
    keywords: '会员 升级 设置',
  },
  {
    id: 'contact',
    category: 'account',
    title: '需要人工支持？',
    body: '请使用下方反馈表单发送邮件，或联系你所在组织管理员。若为演示环境，也可直接在设置页查看账号邮箱以便排查。',
    keywords: '联系 管理员 邮件',
  },
];

const categoryTabs = [
  { id: 'all' as const, label: '全部' },
  { id: 'plan' as const, label: '计划' },
  { id: 'task' as const, label: '任务' },
  { id: 'template' as const, label: '模板' },
  { id: 'account' as const, label: '账号' },
];

const searchQ = ref('');
const activeCategory = ref<(typeof categoryTabs)[number]['id']>('all');

const supportEmail =
  (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || 'support@ai-plan.dev';

const feedbackKind = ref<'suggestion' | 'bug' | 'other'>('suggestion');
const feedbackBody = ref('');

const feedbackKindLabel = computed(() => {
  if (feedbackKind.value === 'suggestion') return '产品建议';
  if (feedbackKind.value === 'bug') return '故障反馈';
  return '其他';
});

/** 侧栏已有主导航，此处仅保留一行弱样式文字链，避免首屏重复大块卡片 */
const inlineNavLinks = [
  { to: '/plans/new', label: '创建计划' },
  { to: '/plans', label: '我的计划' },
  { to: '/templates', label: '模板' },
  { to: '/settings', label: '设置' },
] as const;

function matchesSearch(item: FaqItem, q: string): boolean {
  if (!q.trim()) return true;
  const n = q.trim().toLowerCase();
  const blob = `${item.title} ${item.body} ${item.keywords}`.toLowerCase();
  return blob.includes(n);
}

const filteredFaqs = computed(() => {
  const q = searchQ.value;
  return faqs.filter((item) => {
    const catOk = activeCategory.value === 'all' || item.category === activeCategory.value;
    return catOk && matchesSearch(item, q);
  });
});

function submitFeedback() {
  const body = feedbackBody.value.trim();
  if (!body) return;
  const subject = `[PlanMaster] ${feedbackKindLabel.value}`;
  const mail = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mail;
}
</script>

<template>
  <div class="help-root ui-scrollbar relative h-full min-h-0 overflow-y-auto pr-1 font-plan text-[#1a2e22]">
    <div
      class="pointer-events-none absolute inset-0 -z-10 min-h-full"
      style="
        background:
          radial-gradient(ellipse 720px 360px at 8% -10%, rgba(16, 185, 129, 0.11), transparent 58%),
          radial-gradient(ellipse 560px 300px at 96% 0%, rgba(251, 191, 36, 0.06), transparent 52%),
          linear-gradient(178deg, #f8faf9 0%, #f0f4f1 55%, #eef2ef 100%);
      "
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute inset-0 -z-10 min-h-full opacity-[0.032]"
      style="
        background-image: url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.82%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E');
      "
      aria-hidden="true"
    />

    <div class="relative pb-12 pt-0.5">
      <!-- 压缩首屏：标题 + 统计徽章同一行 -->
      <header class="help-hero mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            class="font-editorial text-[clamp(2.25rem,4.2vw,2.85rem)] font-semibold italic leading-[1.05] tracking-[-0.02em] text-[#0f1f16]"
          >
            帮助与反馈
          </h1>
          <p class="mt-2 max-w-xl text-sm leading-snug text-[#5a6b62]">
            搜索或按分类浏览常见问题；底部可发邮件反馈。
          </p>
        </div>
        <div
          class="flex shrink-0 items-center gap-2 rounded-2xl border border-emerald-200/55 bg-white/65 px-3 py-2 text-xs font-semibold text-emerald-900 shadow-sm ring-1 ring-white/90 backdrop-blur-md"
        >
          <span class="material-symbols-outlined text-[18px] text-[#0a8f4a]" aria-hidden="true">quiz</span>
          <span>{{ faqs.length }} 个常见问题</span>
        </div>
      </header>

      <section
        class="help-panel mb-5 overflow-hidden rounded-[1.35rem] border border-white/85 bg-white/72 p-4 shadow-[0_22px_50px_-38px_rgba(12,48,32,0.35)] ring-1 ring-stone-200/45 backdrop-blur-md sm:p-5"
      >
        <div class="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-4">
          <label class="relative min-h-[44px] min-w-0 flex-1">
            <span
              class="material-symbols-outlined pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8faf9f]"
              aria-hidden="true"
              >search</span
            >
            <input
              v-model="searchQ"
              type="search"
              placeholder="搜索：草稿、模板、提交…"
              class="h-11 w-full rounded-xl border border-stone-200/90 bg-white/95 py-2 pl-11 pr-3 text-sm text-stone-900 shadow-inner outline-none transition focus:border-[#0a8f4a]/45 focus:ring-2 focus:ring-[#0a8f4a]/12"
              data-testid="help-search"
            />
          </label>
          <div
            class="flex flex-wrap gap-1 rounded-xl border border-stone-200/60 bg-stone-50/90 p-1 shadow-inner lg:max-w-[min(100%,28rem)]"
            role="tablist"
            aria-label="问题分类"
          >
            <button
              v-for="tab in categoryTabs"
              :key="tab.id"
              type="button"
              role="tab"
              class="rounded-lg px-3 py-2 text-xs font-bold transition sm:px-3.5 sm:text-sm"
              :class="
                activeCategory === tab.id
                  ? 'bg-white text-stone-900 shadow-sm ring-1 ring-emerald-200/70'
                  : 'text-stone-600 hover:bg-white/70 hover:text-stone-900'
              "
              :data-testid="`help-cat-${tab.id}`"
              :aria-selected="activeCategory === tab.id"
              @click="activeCategory = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <p class="mt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-[#8a9a92]">
          当前匹配 <span class="font-bold text-emerald-800">{{ filteredFaqs.length }}</span> 条
        </p>

        <ul
          v-if="filteredFaqs.length > 0"
          class="mt-4 space-y-2.5"
          data-testid="help-faq-list"
        >
          <li
            v-for="(item, index) in filteredFaqs"
            :key="item.id"
            class="help-faq-item rounded-xl border border-stone-200/70 bg-gradient-to-r from-white/95 to-stone-50/30 shadow-sm transition duration-300 hover:border-emerald-200/50 hover:shadow-md"
            :data-testid="`help-faq-item-${item.id}`"
            :style="{ animationDelay: `${Math.min(index, 10) * 0.045}s` }"
          >
            <details class="group overflow-hidden rounded-xl">
              <summary
                class="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3.5 pr-3 text-left marker:content-none [&::-webkit-details-marker]:hidden"
              >
                <span
                  class="hidden h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-[#34d399] to-[#0a8f4a] opacity-30 transition-opacity duration-300 group-open:opacity-100 sm:block"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1 text-sm font-bold leading-snug text-stone-900">{{ item.title }}</span>
                <span
                  class="material-symbols-outlined shrink-0 text-stone-400 transition duration-300 group-open:rotate-180 group-open:text-[#0a8f4a]"
                  aria-hidden="true"
                  >expand_more</span
                >
              </summary>
              <div class="border-t border-stone-100/90 bg-white/40 px-4 pb-4 pt-3 sm:pl-[1.35rem]">
                <p class="text-sm leading-relaxed text-[#4a5c54]">{{ item.body }}</p>
              </div>
            </details>
          </li>
        </ul>
        <div
          v-else
          class="mt-6 rounded-xl border border-dashed border-stone-300/70 bg-stone-50/60 px-5 py-10 text-center text-sm text-[#7c8a84]"
          data-testid="help-faq-empty"
        >
          <span class="material-symbols-outlined mb-2 block text-3xl text-stone-300" aria-hidden="true"
            >travel_explore</span
          >
          没有匹配的问题，换个关键词或分类试试。
        </div>

        <nav
          class="help-panel mt-5 flex flex-wrap items-center gap-x-0.5 gap-y-1 border-t border-stone-200/60 pt-4 text-[13px] text-[#6e7b75]"
          aria-label="常用页面"
        >
          <span class="mr-1 font-bold text-stone-500">常用</span>
          <template v-for="(link, i) in inlineNavLinks" :key="link.to">
            <span v-if="i > 0" class="px-1 text-stone-300" aria-hidden="true">·</span>
            <router-link
              :to="link.to"
              class="rounded-md px-0.5 font-medium text-[#0a8f4a] underline decoration-emerald-200/80 underline-offset-2 transition hover:decoration-[#0a8f4a]"
            >
              {{ link.label }}
            </router-link>
          </template>
        </nav>
      </section>

      <section
        class="help-panel relative overflow-hidden rounded-[1.35rem] border border-emerald-200/45 bg-gradient-to-br from-white via-emerald-50/15 to-amber-50/20 p-6 shadow-[0_20px_48px_-36px_rgba(10,100,60,0.22)] ring-1 ring-white/95 sm:p-7"
      >
        <div
          class="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-emerald-300/15 blur-3xl"
          aria-hidden="true"
        />
        <div class="relative flex flex-wrap items-start gap-3">
          <span
            class="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/90 to-[#0a8f4a] text-white shadow-lg shadow-emerald-600/25"
          >
            <span class="material-symbols-outlined text-[26px]" aria-hidden="true">mail</span>
          </span>
          <div class="min-w-0 flex-1">
            <h2 class="text-lg font-bold tracking-tight text-stone-900">反馈给我们</h2>
            <p class="mt-1 text-xs leading-relaxed text-[#5a6b62]">
              填写后通过本机邮件客户端发送至
              <span class="font-semibold text-stone-800">{{ supportEmail }}</span>
            </p>
          </div>
        </div>
        <div class="relative mt-5 grid gap-4 sm:grid-cols-[minmax(0,11rem)_1fr] sm:items-end">
          <label class="block text-xs font-bold uppercase tracking-wider text-stone-500">
            类型
            <select
              v-model="feedbackKind"
              class="mt-1.5 w-full rounded-xl border border-stone-200/90 bg-white/95 px-3 py-2.5 text-sm font-semibold text-stone-800 outline-none focus:border-[#0a8f4a]/40 focus:ring-2 focus:ring-[#0a8f4a]/12"
              data-testid="help-feedback-kind"
            >
              <option value="suggestion">产品建议</option>
              <option value="bug">故障反馈</option>
              <option value="other">其他</option>
            </select>
          </label>
          <label class="block sm:col-span-2">
            <span class="text-xs font-bold uppercase tracking-wider text-stone-500">详细描述</span>
            <textarea
              v-model="feedbackBody"
              rows="4"
              class="mt-1.5 w-full rounded-xl border border-stone-200/90 bg-white/95 px-3 py-2.5 text-sm leading-relaxed text-stone-800 outline-none focus:border-[#0a8f4a]/40 focus:ring-2 focus:ring-[#0a8f4a]/12"
              placeholder="场景、复现步骤或期望行为…"
              data-testid="help-feedback-body"
            />
          </label>
        </div>
        <button
          type="button"
          class="relative mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#22c55e] to-[#0a8f4a] px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-700/20 transition hover:brightness-[1.05] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100"
          :disabled="!feedbackBody.trim()"
          data-testid="help-feedback-submit"
          @click="submitFeedback"
        >
          <span class="material-symbols-outlined text-[20px]" aria-hidden="true">send</span>
          通过邮件发送
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.help-hero {
  animation: help-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

.help-panel {
  animation: help-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

.help-panel:nth-of-type(1) {
  animation-delay: 0.05s;
}
.help-panel:nth-of-type(2) {
  animation-delay: 0.12s;
}

.help-faq-item {
  animation: help-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

@keyframes help-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
