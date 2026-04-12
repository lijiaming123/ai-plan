<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { planListSearchQuery } from '../../stores/plan-search-query';

type PlanStatus = '进行中' | '已完成' | '未开始';
type FilterType = '全部' | PlanStatus;

type PlanCard = {
  id: string;
  title: string;
  description: string;
  deadline: string;
  progress: number;
  status: PlanStatus;
  image: string;
};

const plans = ref<PlanCard[]>([
  {
    id: 'plan_1',
    title: '2024年第一季度营销活动',
    description: '针对核心产品的全球发布会和社交媒体矩阵营销推广计划。',
    deadline: '2024-03-31',
    progress: 75,
    status: '进行中',
    image: 'https://images.unsplash.com/photo-1556155092-490a1ba16284?auto=format&fit=crop&w=1400&q=80',
  },
  {
    id: 'plan_2',
    title: '个人健身年度目标',
    description: '建立科学的饮食结构与高强度间歇训练计划，维持理想体脂。',
    deadline: '2024-12-31',
    progress: 0,
    status: '未开始',
    image: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?auto=format&fit=crop&w=1400&q=80',
  },
  {
    id: 'plan_3',
    title: 'Emerald Kinetic 网站重构',
    description: '全面升级UI/UX组件库，提升全平台的响应速度与交互体验。',
    deadline: '2024-05-20',
    progress: 42,
    status: '进行中',
    image: 'https://images.unsplash.com/photo-1526378800651-c32d170fe6f8?auto=format&fit=crop&w=1400&q=80',
  },
  {
    id: 'plan_4',
    title: '核心产品 V2.0 工业设计',
    description: '该项目已顺利结项。完成了从概念草图到3D建模的所有设计迭代，目前已进入量产准备阶段。',
    deadline: '2023-12-15',
    progress: 100,
    status: '已完成',
    image: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?auto=format&fit=crop&w=1400&q=80',
  },
  {
    id: 'plan_5',
    title: '新季度内容运营体系',
    description: '建立内容选题库与分发节奏，提升自然流量和注册转化率。',
    deadline: '2024-08-10',
    progress: 0,
    status: '未开始',
    image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1400&q=80',
  },
]);

const filters: FilterType[] = ['全部', '进行中', '已完成', '未开始'];
const route = useRoute();
const router = useRouter();

function normalizeFilter(value: unknown): FilterType {
  if (typeof value === 'string' && filters.includes(value as FilterType)) {
    return value as FilterType;
  }
  return '全部';
}

const activeFilter = ref<FilterType>(normalizeFilter(route.query.status));

const searchText = computed(() => planListSearchQuery.value.trim().toLowerCase());

const filteredPlans = computed(() => {
  let list = plans.value;
  if (activeFilter.value !== '全部') {
    list = list.filter((plan) => plan.status === activeFilter.value);
  }
  const q = searchText.value;
  if (q) {
    list = list.filter(
      (plan) => plan.title.toLowerCase().includes(q) || plan.description.toLowerCase().includes(q)
    );
  }
  return list;
});

const totalPlanCount = computed(() => plans.value.length);

const filterSummary = computed(() => {
  const n = filteredPlans.value.length;
  if (searchText.value) {
    return `找到 ${n} 个与搜索相关的计划`;
  }
  if (activeFilter.value === '全部') {
    return `共 ${totalPlanCount.value} 个计划，慢慢来，每一步都算数`;
  }
  return `当前筛选下共 ${n} 个计划`;
});

function setFilter(filter: FilterType) {
  activeFilter.value = filter;

  const nextQuery = { ...route.query };
  if (filter === '全部') {
    delete nextQuery.status;
  } else {
    nextQuery.status = filter;
  }
  router.replace({ query: nextQuery });
}

function statusClass(status: PlanStatus) {
  if (status === '进行中') {
    return 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80';
  }
  if (status === '已完成') {
    return 'bg-teal-50 text-teal-900 ring-1 ring-teal-200/70';
  }
  return 'bg-stone-100 text-stone-600 ring-1 ring-stone-200/80';
}

watch(
  () => route.query.status,
  (status) => {
    activeFilter.value = normalizeFilter(status);
  }
);
</script>

<template>
  <div
    class="plan-home relative flex h-full min-h-0 w-full flex-col font-plan text-stone-800"
    data-testid="plan-overview-root"
  >
    <!-- 柔和氛围底：渐变 + 轻噪点 -->
    <div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl opacity-90">
      <div
        class="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-[#c8f5d4]/35 blur-3xl"
        aria-hidden="true"
      />
      <div
        class="absolute -bottom-16 right-0 h-80 w-80 rounded-full bg-[#e8f7ed]/80 blur-3xl"
        aria-hidden="true"
      />
      <div class="plan-home-grain absolute inset-0" aria-hidden="true" />
    </div>

    <header class="relative mb-6 shrink-0 sm:mb-8">
      <p class="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700/70">今天的小步前进</p>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 class="text-4xl font-extrabold tracking-tight text-stone-900 sm:text-[2.75rem] sm:leading-[1.1]">
            我的计划
          </h1>
          <p class="mt-2 max-w-xl text-[15px] leading-relaxed text-stone-600">
            {{ filterSummary }}
          </p>
        </div>
      </div>

      <div
        class="mt-6 flex flex-wrap gap-2 rounded-2xl border border-white/60 bg-white/50 p-1.5 shadow-[0_1px_0_rgba(255,255,255,0.85)_inset,0_8px_24px_-12px_rgba(15,60,40,0.12)] backdrop-blur-sm"
        role="tablist"
        aria-label="计划筛选"
      >
        <button
          v-for="filter in filters"
          :key="filter"
          type="button"
          :data-testid="`filter-${filter}`"
          class="rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200"
          :class="
            activeFilter === filter
              ? 'bg-white text-stone-900 shadow-[0_2px_8px_-2px_rgba(16,80,50,0.15)] ring-1 ring-emerald-200/60'
              : 'text-stone-600 hover:bg-white/70 hover:text-stone-900'
          "
          :aria-selected="activeFilter === filter"
          role="tab"
          @click="setFilter(filter)"
        >
          {{ filter }}
        </button>
      </div>
    </header>

    <div class="ui-scrollbar min-h-0 flex-1 overflow-y-auto pr-1 pb-2">
      <div class="grid grid-cols-1 gap-5 pb-8 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        <router-link
          v-for="(plan, index) in filteredPlans"
          :key="plan.id"
          :to="`/plans/${plan.id}`"
          data-testid="plan-card"
          class="animate-plan-card group flex flex-col overflow-hidden rounded-3xl border border-stone-200/80 bg-white/90 shadow-[0_12px_40px_-24px_rgba(15,50,30,0.25)] ring-1 ring-white/80 transition duration-300 hover:-translate-y-1 hover:border-emerald-200/60 hover:shadow-[0_20px_48px_-20px_rgba(16,100,60,0.22)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
          :style="{ '--stagger': `${index * 45}ms` }"
        >
          <div class="relative aspect-[16/10] w-full overflow-hidden bg-stone-100">
            <div
              class="absolute inset-0 bg-cover bg-center transition duration-500 ease-out group-hover:scale-[1.04]"
              :style="{ backgroundImage: `url('${plan.image}')` }"
            />
            <div
              class="absolute inset-0 bg-gradient-to-t from-stone-900/55 via-stone-900/10 to-transparent"
              aria-hidden="true"
            />
            <div class="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
              <span
                class="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide backdrop-blur-md"
                :class="statusClass(plan.status)"
              >
                {{ plan.status }}
              </span>
              <span
                class="rounded-lg bg-white/90 px-2 py-1 text-[11px] font-medium text-stone-700 shadow-sm backdrop-blur-sm"
              >
                截止 {{ plan.deadline }}
              </span>
            </div>
          </div>

          <div class="flex flex-1 flex-col p-5">
            <h2 class="mb-2 line-clamp-2 text-lg font-bold leading-snug tracking-tight text-stone-900 sm:text-xl">
              {{ plan.title }}
            </h2>
            <p class="mb-5 line-clamp-2 text-[14px] leading-relaxed text-stone-600">
              {{ plan.description }}
            </p>
            <div class="mt-auto">
              <div class="mb-2 flex items-center justify-between text-xs font-semibold text-stone-500">
                <span>完成进度</span>
                <span class="tabular-nums text-stone-800">{{ plan.progress }}%</span>
              </div>
              <div
                class="h-2.5 overflow-hidden rounded-full bg-stone-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]"
              >
                <div
                  class="plan-progress-fill h-full rounded-full bg-gradient-to-r from-emerald-400 to-primary shadow-[0_0_12px_-2px_rgba(19,236,91,0.5)] transition-all duration-500"
                  :style="{ width: `${plan.progress}%` }"
                />
              </div>
            </div>
          </div>
        </router-link>

        <div
          v-if="filteredPlans.length === 0"
          class="flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-dashed border-stone-300/90 bg-white/60 px-8 py-12 text-center lg:col-span-2"
        >
          <span class="material-symbols-outlined mb-3 text-4xl text-stone-400">search_off</span>
          <p class="text-lg font-semibold text-stone-800">这里暂时空空如也</p>
          <p class="mt-2 max-w-sm text-sm leading-relaxed text-stone-600">
            换个筛选条件，或清空顶栏搜索看看。也可以新建一个计划，从小目标开始。
          </p>
        </div>

        <router-link
          to="/plans/new"
          class="animate-plan-card group relative flex min-h-[300px] flex-col justify-between overflow-hidden rounded-3xl border border-emerald-400/30 bg-gradient-to-br from-primary via-[#5ef082] to-emerald-300 p-6 text-stone-900 shadow-[0_16px_40px_-18px_rgba(19,180,80,0.55)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_-16px_rgba(19,160,70,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
          :style="{ '--stagger': `${filteredPlans.length * 45 + 60}ms` }"
        >
          <div class="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/25 blur-2xl" />
          <div class="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/5 to-transparent" />
          <div class="relative">
            <div
              class="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-900/10 shadow-inner ring-1 ring-white/40 backdrop-blur-[2px] transition group-hover:scale-105"
            >
              <span class="material-symbols-outlined text-3xl text-stone-900" style="font-variation-settings: 'wght' 600">add</span>
            </div>
            <p class="text-2xl font-extrabold leading-tight tracking-tight sm:text-[1.65rem]">
              新建一个<br /><span class="text-stone-800/90">属于你的计划</span>
            </p>
          </div>
          <p class="relative text-sm font-medium leading-relaxed text-stone-800/75">
            不用一次想完所有步骤，先写下目标，后面再慢慢拆解。
          </p>
        </router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plan-home-grain {
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

@keyframes plan-card-in {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-plan-card {
  animation: plan-card-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: var(--stagger, 0ms);
}
</style>
