<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import PageSectionHeading from "../../components/PageSectionHeading.vue";
import UiErrorToast from "../../components/UiErrorToast.vue";
import {
  getApiClient,
  type DeletedPlanListRow,
} from "../../lib/api-client";
import { authState } from "../../stores/auth";

type DeletedPlanCard = {
  id: string;
  goal: string;
  deadline: string;
  createdAt: string;
  deletedAt: string | null;
};

const deletedPlans = ref<DeletedPlanCard[]>([]);
const listLoading = ref(true);
const errorToastMessage = ref("");
const okBanner = ref("");

function dayFromIso(iso: string): string {
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : iso;
}

function rowToCard(row: DeletedPlanListRow): DeletedPlanCard {
  return {
    id: row.id,
    goal: row.goal,
    deadline: dayFromIso(row.deadline),
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
  };
}

const isAuthed = computed(() => Boolean(authState.token));

async function loadDeletedPlans() {
  if (!authState.token) {
    deletedPlans.value = [];
    listLoading.value = false;
    return;
  }

  listLoading.value = true;
  errorToastMessage.value = "";
  try {
    const { plans } = await getApiClient().listDeletedPlans({
      token: authState.token,
    });
    deletedPlans.value = plans.map(rowToCard);
  } catch (e) {
    errorToastMessage.value =
      e instanceof Error ? e.message : "没能加载最近删除，请稍后再试";
    deletedPlans.value = [];
  } finally {
    listLoading.value = false;
  }
}

async function onRestore(plan: Pick<DeletedPlanCard, "id">) {
  if (!authState.token) {
    errorToastMessage.value = "请先登录";
    return;
  }
  try {
    await getApiClient().restorePlan({ id: plan.id, token: authState.token });
    deletedPlans.value = deletedPlans.value.filter((p) => p.id !== plan.id);
    okBanner.value = "已恢复到「我的计划」";
    window.setTimeout(() => {
      okBanner.value = "";
    }, 3200);
  } catch (e) {
    errorToastMessage.value =
      e instanceof Error ? e.message : "没恢复成功，请稍后再试";
  }
}

function deletedAtText(plan: Pick<DeletedPlanCard, "deletedAt" | "createdAt">) {
  const iso = plan.deletedAt ?? plan.createdAt;
  const label = plan.deletedAt ? "删除于" : "创建于";
  return `${label} ${dayFromIso(iso)}`;
}

onMounted(() => {
  void loadDeletedPlans();
});
</script>

<template>
  <div
    class="flex h-full min-h-0 w-full flex-col font-plan text-stone-800"
    data-testid="plan-trash-root"
  >
    <header class="mb-6 shrink-0 sm:mb-8">
      <PageSectionHeading kicker="计划与执行" title="最近删除">
        <p>可在这里恢复被删除的计划</p>
      </PageSectionHeading>

      <div class="mt-3 flex items-center justify-end">
        <router-link
          to="/plans"
          class="inline-flex items-center gap-2 rounded-2xl bg-white/40 px-2.5 py-2 text-sm font-semibold text-stone-600 ring-1 ring-white/60 backdrop-blur-sm transition hover:bg-white/65 hover:text-stone-900"
          data-testid="back-to-plans"
        >
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true"
            >arrow_back</span
          >
          返回我的计划
        </router-link>
      </div>
    </header>

    <UiErrorToast
      :message="errorToastMessage"
      @close="errorToastMessage = ''"
    />

    <div class="ui-scrollbar min-h-0 flex-1 overflow-y-auto pr-1 pb-2">
      <div
        v-if="okBanner"
        class="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3 text-sm font-semibold text-emerald-950 ring-1 ring-white/70"
        data-testid="plan-trash-ok-banner"
      >
        <span class="min-w-0 truncate">{{ okBanner }}</span>
        <button
          type="button"
          class="shrink-0 rounded-xl bg-white/70 px-3 py-1.5 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-200/70 transition hover:bg-white"
          aria-label="关闭提示"
          @click="okBanner = ''"
        >
          关闭
        </button>
      </div>
      <div
        v-if="listLoading"
        class="flex min-h-[220px] flex-col items-center justify-center gap-2 text-stone-500"
      >
        <span
          class="inline-block h-8 w-8 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
          aria-hidden="true"
        />
        <span class="text-sm font-medium">加载最近删除中…</span>
      </div>

      <div v-else class="space-y-4">
        <div
          v-if="!isAuthed"
          class="flex min-h-[240px] flex-col items-center justify-center rounded-3xl border border-dashed border-stone-300/90 bg-white/60 px-8 py-12 text-center"
          data-testid="plan-trash-login-hint"
        >
          <span class="text-lg font-semibold text-stone-800">请先登录</span>
          <span class="mt-2 text-sm leading-relaxed text-stone-600"
            >登录后才能查看并恢复最近删除的计划。</span
          >
        </div>

        <div
          v-else-if="deletedPlans.length === 0"
          class="flex min-h-[240px] flex-col items-center justify-center rounded-3xl border border-dashed border-stone-300/90 bg-white/60 px-8 py-12 text-center"
          data-testid="plan-trash-empty"
        >
          <span class="text-lg font-semibold text-stone-800">暂无最近删除</span>
          <span class="mt-2 text-sm leading-relaxed text-stone-600"
            >你删除的计划会出现在这里，便于恢复。</span
          >
          <router-link
            to="/plans"
            class="mt-5 inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-[0_10px_24px_-16px_rgba(16,185,129,0.65)] transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            data-testid="empty-go-plans"
          >
            回到我的计划
          </router-link>
        </div>

        <ul v-else class="space-y-3" data-testid="plan-trash-list">
          <li
            v-for="plan in deletedPlans"
            :key="plan.id"
            class="flex items-start justify-between gap-3 rounded-3xl border border-stone-200/80 bg-white/85 p-5 shadow-[0_14px_44px_-26px_rgba(10,60,38,0.18)] ring-1 ring-white/85"
            data-testid="plan-trash-row"
          >
            <div class="min-w-0">
              <p class="text-base font-bold text-stone-900" data-testid="plan-goal">
                {{ plan.goal }}
              </p>
              <p class="mt-1 text-sm font-semibold text-stone-600">
                截止 {{ plan.deadline }}
              </p>
              <p class="mt-1 text-xs font-semibold text-stone-500">
                {{ deletedAtText(plan) }}
              </p>
            </div>

            <button
              type="button"
              class="shrink-0 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-[0_10px_24px_-16px_rgba(16,185,129,0.65)] transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              :data-testid="`plan-restore-${plan.id}`"
              @click="onRestore(plan)"
            >
              恢复
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

