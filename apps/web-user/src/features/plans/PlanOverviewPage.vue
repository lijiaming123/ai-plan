<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

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

const filteredPlans = computed(() => {
  if (activeFilter.value === '全部') return plans.value;
  return plans.value.filter((plan) => plan.status === activeFilter.value);
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
  if (status === '进行中') return 'bg-[#d7fbe5] text-[#0f7d47]';
  if (status === '已完成') return 'bg-[#e6f9ec] text-[#118c4f]';
  return 'bg-[#efefef] text-[#666]';
}

watch(
  () => route.query.status,
  (status) => {
    activeFilter.value = normalizeFilter(status);
  }
);
</script>

<template>
  <div class="relative flex h-screen w-full overflow-hidden bg-[#f5f7f6] font-display text-[#111813]">
    <aside class="hidden h-screen w-[206px] shrink-0 flex-col justify-between border-r border-[#e6ebe8] bg-[#f5f7f6] px-5 py-5 lg:flex">
      <div class="flex flex-col gap-7">
        <div>
          <h2 class="text-[30px] font-black leading-8 tracking-[-0.03em]">计划大师</h2>
          <p class="mt-1 text-sm text-[#7c8a84]">PlanMaster System</p>
        </div>
        <nav class="flex flex-col gap-2">
          <a class="flex items-center gap-3 rounded-xl px-3 py-2 text-[#6e7b75]">
            <span class="material-symbols-outlined text-[20px]">dashboard</span>
            <span class="text-[15px] font-medium">仪表盘</span>
          </a>
          <router-link to="/plans" class="flex items-center gap-3 rounded-xl bg-[#eef9f3] px-3 py-2 text-[#0a8f4a]">
            <span class="material-symbols-outlined text-[20px]">folder</span>
            <span class="text-[15px] font-semibold">我的计划</span>
          </router-link>
          <a class="flex items-center gap-3 rounded-xl px-3 py-2 text-[#6e7b75]">
            <span class="material-symbols-outlined text-[20px]">layers</span>
            <span class="text-[15px] font-medium">模板</span>
          </a>
          <a class="flex items-center gap-3 rounded-xl px-3 py-2 text-[#6e7b75]">
            <span class="material-symbols-outlined text-[20px]">settings</span>
            <span class="text-[15px] font-medium">设置</span>
          </a>
        </nav>
      </div>
      <div class="space-y-3">
        <button class="h-12 w-full rounded-xl bg-primary text-sm font-bold text-[#111813]">获取专业版</button>
        <div class="flex items-center gap-3 rounded-xl border border-[#e6ebe8] bg-white p-2">
          <img
            alt="avatar"
            class="h-9 w-9 rounded-full object-cover"
            src="https://images.unsplash.com/photo-1633332755192-727a05c4013d?auto=format&fit=crop&w=120&q=80"
          />
          <div>
            <p class="text-sm font-semibold">账户信息</p>
            <p class="text-xs text-[#7c8a84]">kinetic-user@v.ai</p>
          </div>
        </div>
      </div>
    </aside>

    <main class="h-screen flex-1 overflow-hidden px-3 py-4 sm:px-4 sm:py-5">
      <div class="flex h-full w-full flex-col">
        <div class="mb-6 flex items-center justify-between gap-4">
          <div class="relative max-w-[320px] flex-1">
            <span class="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8d9993]">search</span>
            <input
              class="h-11 w-full rounded-xl border border-[#e5ebe7] bg-white pl-10 pr-4 text-sm outline-none focus:border-primary/40"
              placeholder="搜索计划..."
            />
          </div>
          <div class="flex items-center gap-3">
            <router-link to="/plans/new" class="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-[#111813]">
              创建新计划
            </router-link>
            <span class="material-symbols-outlined text-[#555]">notifications</span>
            <span class="material-symbols-outlined text-[#555]">account_circle</span>
          </div>
        </div>

        <h1 class="mb-4 text-[46px] font-black leading-none tracking-[-0.03em]">我的计划</h1>

        <div class="mb-7 flex flex-wrap gap-2">
          <button
            v-for="filter in filters"
            :key="filter"
            :data-testid="`filter-${filter}`"
            class="rounded-full px-6 py-2 text-sm font-semibold transition"
            :class="activeFilter === filter ? 'bg-primary text-[#111813]' : 'bg-[#f0f2f1] text-[#4c5551]'"
            @click="setFilter(filter)"
          >
            {{ filter }}
          </button>
        </div>

        <div class="plan-scrollbar flex-1 overflow-y-auto pr-1">
          <div class="grid grid-cols-1 gap-6 pb-6 sm:grid-cols-2 lg:grid-cols-3">
            <router-link
              v-for="plan in filteredPlans"
              :key="plan.id"
              :to="`/plans/${plan.id}`"
              data-testid="plan-card"
              class="group flex flex-col overflow-hidden rounded-2xl border border-[#e6ebe8] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div class="aspect-[16/9] w-full bg-cover bg-center" :style="{ backgroundImage: `url('${plan.image}')` }" />
              <div class="flex flex-1 flex-col p-4">
                <div class="mb-3 flex items-center justify-between gap-2">
                  <span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="statusClass(plan.status)">{{ plan.status }}</span>
                  <span class="text-xs text-[#727f79]">截止: {{ plan.deadline }}</span>
                </div>
                <p class="mb-2 text-[34px] font-black leading-9 tracking-[-0.02em]">{{ plan.title }}</p>
                <p class="mb-4 line-clamp-2 text-sm leading-6 text-[#5d6a64]">{{ plan.description }}</p>
                <div class="mt-auto">
                  <div class="mb-1 flex items-center justify-between text-xs font-semibold text-[#505b56]">
                    <span>进度</span>
                    <span>{{ plan.progress }}%</span>
                  </div>
                  <div class="h-2 rounded-full bg-[#ecf0ee]">
                    <div class="h-2 rounded-full bg-primary transition-all" :style="{ width: `${plan.progress}%` }" />
                  </div>
                </div>
              </div>
            </router-link>

            <router-link
              to="/plans/new"
              class="flex min-h-[330px] flex-col justify-between rounded-2xl bg-primary p-6 text-[#111813] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div>
                <div class="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-black/10">
                  <span class="material-symbols-outlined text-3xl">add</span>
                </div>
                <p class="text-[42px] font-black leading-10 tracking-[-0.02em]">创建<br />新的项目计划</p>
              </div>
              <p class="text-sm text-black/70">点击开始您的下一个效率征程</p>
            </router-link>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.plan-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.plan-scrollbar::-webkit-scrollbar {
  width: 10px;
}

.plan-scrollbar::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 999px;
}

.plan-scrollbar::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 999px;
  border: 2px solid transparent;
}

.plan-scrollbar:hover {
  scrollbar-color: #87a89b #edf1ef;
}

.plan-scrollbar:hover::-webkit-scrollbar-track {
  background: #edf1ef;
}

.plan-scrollbar:hover::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #93b4a5 0%, #7e9f92 100%);
  border: 2px solid #edf1ef;
}

.plan-scrollbar:hover::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #88a99b 0%, #719285 100%);
}
</style>
