import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getApiBaseURL,
  getApiClient,
  type PlanRecord,
} from "../../../../lib/api-client";
import {
  clearDraftStreamPayload,
  consumeAssistantDraftStream,
  consumeRegenerateDraftStream,
  peekDraftStreamPayload,
  type PendingDraftStreamPayload,
} from "../../../../lib/plan-assistant-stream";
import { trackEvent } from "../../../../lib/telemetry";
import { renderMarkdownToHtml } from "../../../../lib/render-markdown";
import { useCloseOnEscape } from "../../../../composables/useCloseOnEscape";
import { authState, refreshAuthBillingFromApi } from "../../../../stores/auth";

type DraftBundle = NonNullable<PlanRecord["draft"]>;
type DraftVersionSnapshot = DraftBundle["versions"][number];
type GranularityMode = "smart" | "deep" | "rough";
type VersionDiffMeta = {
  addedStages: number;
  removedStages: number;
  addedTasks: number;
  removedTasks: number;
  addedStageNames: Set<string>;
  addedTaskKeys: Set<string>;
};

export function usePlanDraft() {


const route = useRoute();
const router = useRouter();
const planId = computed(() => String(route.params.id ?? ""));

const loading = ref(false);
const operating = ref(false);
const planGoal = ref("");
const draftMeta = ref<DraftBundle | null>(null);
const selectedVersion = ref(1);
const errorToastMessage = ref("");
const confirmOpen = ref(false);
const confirmModalError = ref("");
const nextGranularityMode = ref<GranularityMode>("smart");
const granularityConfirmOpen = ref(false);
const assistantStreaming = ref(false);
/** v1：服务端已发出 body_complete（正文流结束，正在缓冲 JSON）至流结束/刷新前 */
const v1ScheduleJsonPhase = ref(false);
/** 再生成：同上，对应 regenerateStreamVersion 卡片 */
const regenerateScheduleJsonPhase = ref(false);
/** 自动滚动：卡片滚动容器（按版本号记录） */
const cardScrollEls = new Map<number, HTMLElement>();
/** 自动滚动：用户是否贴底（贴底才跟随；用户上滑则暂停） */
const cardStickyBottom = new Map<number, boolean>();
/** 流式结束后拉取完整草稿（含 schedule）期间为 true，用于禁用再生成与展示表格骨架 */
const draftBundleRefreshing = ref(false);
/** v1 流式覆盖文本；非 null 表示正在用流式内容展示 v1 版本说明 */
const v1StreamText = ref<string | null>(null);
/** 再生成流式：正在写入的版本号与缓冲区（点击再生成后立即出卡，正文逐字展示） */
const regenerateStreamVersion = ref<number | null>(null);
const regenerateStreamText = ref("");

const regenerateMenuOpen = ref(false);
const regenerateMenuRoot = ref<HTMLElement | null>(null);

/** 递增序号，丢弃过期的异步回写（路由/planId 快速切换时） */
let loadDraftSeq = 0;

const versions = computed(() => draftMeta.value?.versions ?? []);
const selectedSnapshot = computed(
  () =>
    versions.value.find((v) => v.version === selectedVersion.value) ??
    versions.value[versions.value.length - 1] ??
    null,
);
const selectedTaskCount = computed(() =>
  selectedSnapshot.value
    ? selectedSnapshot.value.stages.reduce(
        (sum, stage) => sum + stage.tasks.length,
        0,
      )
    : 0,
);
const totalTaskCount = computed(() =>
  versions.value.reduce((versionSum, version) => {
    return (
      versionSum +
      version.stages.reduce(
        (stageSum, stage) => stageSum + stage.tasks.length,
        0,
      )
    );
  }, 0),
);
const versionDiffMetaMap = computed(() => {
  const map = new Map<number, VersionDiffMeta>();
  versions.value.forEach((version, index) => {
    if (index === 0) {
      map.set(version.version, {
        addedStages: 0,
        removedStages: 0,
        addedTasks: 0,
        removedTasks: 0,
        addedStageNames: new Set<string>(),
        addedTaskKeys: new Set<string>(),
      });
      return;
    }
    const prev = versions.value[index - 1];
    const currentStageNames = new Set(
      version.stages.map((stage) => stage.name),
    );
    const previousStageNames = new Set(prev.stages.map((stage) => stage.name));
    const addedStageNames = new Set(
      [...currentStageNames].filter((name) => !previousStageNames.has(name)),
    );
    const removedStageCount = [...previousStageNames].filter(
      (name) => !currentStageNames.has(name),
    ).length;

    const toTaskKey = (stageName: string, taskTitle: string) =>
      `${stageName}::${taskTitle}`;
    const currentTaskKeys = new Set(
      version.stages.flatMap((stage) =>
        stage.tasks.map((task) => toTaskKey(stage.name, task.title)),
      ),
    );
    const previousTaskKeys = new Set(
      prev.stages.flatMap((stage) =>
        stage.tasks.map((task) => toTaskKey(stage.name, task.title)),
      ),
    );
    const addedTaskKeys = new Set(
      [...currentTaskKeys].filter((key) => !previousTaskKeys.has(key)),
    );
    const removedTaskCount = [...previousTaskKeys].filter(
      (key) => !currentTaskKeys.has(key),
    ).length;

    map.set(version.version, {
      addedStages: addedStageNames.size,
      removedStages: removedStageCount,
      addedTasks: addedTaskKeys.size,
      removedTasks: removedTaskCount,
      addedStageNames,
      addedTaskKeys,
    });
  });
  return map;
});
const selectedDiffMeta = computed(() => {
  if (!selectedSnapshot.value) return null;
  return versionDiffMetaMap.value.get(selectedSnapshot.value.version) ?? null;
});

const remainingRegenerateCount = computed(() => {
  if (!draftMeta.value) return 0;
  return Math.max(
    draftMeta.value.maxVersions - draftMeta.value.versions.length,
    0,
  );
});

const canRegenerate = computed(() => Boolean(draftMeta.value?.canRegenerate));
/** 初版流式生成或同步打卡表未完成前，不允许再次重新生成 */
const regenerateLocked = computed(
  () =>
    assistantStreaming.value ||
    draftBundleRefreshing.value ||
    loading.value ||
    regenerateStreamVersion.value != null,
);
const selectedGranularityMode = computed<GranularityMode>(() => {
  const snapshot = selectedSnapshot.value;
  if (!snapshot) return "smart";
  const allTasks = snapshot.stages.flatMap((stage) => stage.tasks);
  if (
    allTasks.some(
      (task) =>
        task.taskType === "monthly_summary" ||
        task.taskType === "weekly_summary",
    )
  )
    return "deep";
  if (allTasks.some((task) => task.timeSlotType === "week")) return "rough";
  return "smart";
});

function showError(message: string) {
  errorToastMessage.value = message;
}

function clearError() {
  errorToastMessage.value = "";
}

function toggleRegenerateMenu() {
  if (operating.value || regenerateLocked.value || !canRegenerate.value) return;
  regenerateMenuOpen.value = !regenerateMenuOpen.value;
}

function closeRegenerateMenu() {
  regenerateMenuOpen.value = false;
}

function setNextGranularityModeFromMenu(value: GranularityMode) {
  nextGranularityMode.value = value;
  closeRegenerateMenu();
}

function onDocPointerDown(e: PointerEvent) {
  if (!regenerateMenuOpen.value) return;
  const root = regenerateMenuRoot.value;
  const t = e.target;
  if (!root || !(t instanceof Node)) return;
  if (!root.contains(t)) closeRegenerateMenu();
}

function isDraftClosedError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return /\b409\b/.test(msg) && /draft is closed/i.test(msg);
}

async function goToDetail(targetId: string) {
  await router.replace({ name: "plan-detail", params: { id: targetId } });
}

function requirementForDisplay(ver: { version: number; requirement: string }) {
  if (
    regenerateStreamVersion.value !== null &&
    ver.version === regenerateStreamVersion.value
  ) {
    const streamed = regenerateStreamText.value;
    return streamed.length > 0
      ? stripLastJsonCodeBlock(streamed)
      : ver.requirement;
  }
  if (
    assistantStreaming.value &&
    ver.version === 1 &&
    v1StreamText.value !== null
  ) {
    const streamed = v1StreamText.value;
    // 流式阶段可能会在尾部逐步输出 ```json；前端展示需要隐藏协议块，避免污染正文区域
    return streamed.length > 0
      ? stripLastJsonCodeBlock(streamed)
      : ver.requirement;
  }
  return ver.requirement;
}

function stripLastJsonCodeBlock(text: string) {
  if (!text) return "";
  const re = /```json\s*[\s\S]*?\s*```/gi;
  let m: RegExpExecArray | null = null;
  let last: { start: number; end: number } | null = null;
  while ((m = re.exec(text)) !== null) {
    last = { start: m.index, end: m.index + m[0].length };
  }
  if (!last) return text;
  return `${text.slice(0, last.start)}\n\n${text.slice(last.end)}`.trim();
}

function setCardScrollEl(
  version: number,
  el: Element | { $el?: Element | null } | null,
) {
  const resolved =
    el instanceof HTMLElement
      ? el
      : el &&
          typeof el === "object" &&
          "$el" in el &&
          el.$el instanceof HTMLElement
        ? el.$el
        : null;

  if (!resolved) {
    cardScrollEls.delete(version);
    cardStickyBottom.delete(version);
    return;
  }

  cardScrollEls.set(version, resolved);
  if (!cardStickyBottom.has(version)) cardStickyBottom.set(version, true);
}

function isNearBottom(el: HTMLElement, thresholdPx = 80) {
  const bottomGap = el.scrollHeight - (el.scrollTop + el.clientHeight);
  return bottomGap <= thresholdPx;
}

function onCardScroll(version: number) {
  const el = cardScrollEls.get(version);
  if (!el) return;
  cardStickyBottom.set(version, isNearBottom(el));
}

async function maybeAutoScrollCardToBottom(version: number) {
  const el = cardScrollEls.get(version);
  if (!el) return;
  if (!cardStickyBottom.get(version)) return;
  await nextTick();
  const cur = cardScrollEls.get(version);
  if (!cur) return;
  if (!cardStickyBottom.get(version)) return;
  cur.scrollTop = cur.scrollHeight;
}

const scheduleEditOpen = ref(false);
const scheduleEditSlotKey = ref("");
const scheduleEditContent = ref("");
const scheduleEditVersion = ref<number | null>(null);
const scheduleSaving = ref(false);
const scheduleSwapOpen = ref(false);
const scheduleSwapVersion = ref<number | null>(null);
const scheduleSwapSlotKeyA = ref("");
const scheduleSwapSlotKeyB = ref("");
const scheduleSwapping = ref(false);

function scheduleVisibleForVersion(ver: DraftVersionSnapshot) {
  const sch = ver.schedule;
  if (!sch || !Array.isArray(sch.slots) || sch.slots.length === 0) return false;
  // v1 流式生成未完成前不展示表格（避免半成品 JSON / 旧表混杂）
  if (assistantStreaming.value && ver.version === 1) return false;
  if (
    regenerateStreamVersion.value !== null &&
    ver.version === regenerateStreamVersion.value
  )
    return false;
  return true;
}

function scheduleSkeletonForVersion(ver: DraftVersionSnapshot) {
  if (scheduleVisibleForVersion(ver)) return false;
  if (
    regenerateStreamVersion.value !== null &&
    ver.version === regenerateStreamVersion.value
  ) {
    return (
      draftBundleRefreshing.value || regenerateScheduleJsonPhase.value
    );
  }
  if (ver.version !== 1) return false;
  return (
    draftBundleRefreshing.value ||
    (assistantStreaming.value && v1ScheduleJsonPhase.value)
  );
}

function openScheduleEdit(
  slotKey: string,
  content: string,
  planVersion: number,
) {
  scheduleEditSlotKey.value = slotKey;
  scheduleEditContent.value = content;
  scheduleEditVersion.value = planVersion;
  scheduleEditOpen.value = true;
}

function scheduleSlotsForVersion(version: number | null) {
  if (version == null) return [];
  return (
    draftMeta.value?.versions.find((v) => v.version === version)?.schedule?.slots ??
    []
  );
}

const scheduleSwapPreview = computed(() => {
  const slots = scheduleSlotsForVersion(scheduleSwapVersion.value);
  const slotA = slots.find((s) => s.slotKey === scheduleSwapSlotKeyA.value);
  const slotB = slots.find((s) => s.slotKey === scheduleSwapSlotKeyB.value);
  return {
    slotA,
    slotB,
  };
});

function openScheduleSwap(slotKey: string, planVersion: number) {
  const slots = scheduleSlotsForVersion(planVersion);
  const firstOther = slots.find((s) => s.slotKey !== slotKey);
  if (!firstOther) {
    showError("当前版本可交换的打卡段不足");
    return;
  }
  scheduleSwapVersion.value = planVersion;
  scheduleSwapSlotKeyA.value = slotKey;
  scheduleSwapSlotKeyB.value = firstOther.slotKey;
  scheduleSwapOpen.value = true;
}

function closeScheduleSwap() {
  if (scheduleSwapping.value) return;
  scheduleSwapOpen.value = false;
}

async function refreshDraftBundleOnly(capturedSeq: number) {
  const id = planId.value;
  try {
    const full = await getApiClient().getPlanDraft({
      id,
      token: authState.token,
    });
    if (capturedSeq !== loadDraftSeq) return;

    const prevVers = draftMeta.value?.versions ?? [];
    const prevMax = prevVers.reduce((m, v) => Math.max(m, v.version), 0);
    const nextMax = full.versions.reduce((m, v) => Math.max(m, v.version), 0);
    if (
      prevVers.length > 0 &&
      (full.versions.length < prevVers.length || nextMax < prevMax)
    ) {
      return;
    }

    planGoal.value = full.goal;
    draftMeta.value = {
      versions: full.versions,
      maxVersions: full.maxVersions,
      confirmedVersion: full.confirmedVersion,
      canRegenerate: full.canRegenerate,
    };
  } catch (error) {
    if (capturedSeq !== loadDraftSeq) return;
    showError(error instanceof Error ? error.message : "没能刷新草稿，请稍后再试");
  }
}

async function saveScheduleEdit() {
  if (!authState.token) return;
  const slotKey = scheduleEditSlotKey.value;
  const planVersion = scheduleEditVersion.value;
  if (!slotKey || planVersion == null) return;
  scheduleSaving.value = true;
  try {
    const res = await getApiClient().patchPlanScheduleSlot({
      id: planId.value,
      slotKey,
      token: authState.token,
      content: scheduleEditContent.value,
      version: planVersion,
    });
    if (draftMeta.value?.versions?.length) {
      const idx = draftMeta.value.versions.findIndex(
        (v) => v.version === planVersion,
      );
      if (idx >= 0)
        draftMeta.value.versions[idx] = {
          ...draftMeta.value.versions[idx],
          schedule: res.schedule,
        };
    }
    scheduleEditOpen.value = false;
  } catch (e) {
    showError(e instanceof Error ? e.message : "没保存成功，请稍后再试");
  } finally {
    scheduleSaving.value = false;
  }
}

async function restoreScheduleSlot(slotKey: string, planVersion: number) {
  if (!authState.token) return;
  scheduleSaving.value = true;
  try {
    const res = await getApiClient().patchPlanScheduleSlot({
      id: planId.value,
      slotKey,
      token: authState.token,
      restore: true,
      version: planVersion,
    });
    if (draftMeta.value?.versions?.length) {
      const idx = draftMeta.value.versions.findIndex(
        (v) => v.version === planVersion,
      );
      if (idx >= 0)
        draftMeta.value.versions[idx] = {
          ...draftMeta.value.versions[idx],
          schedule: res.schedule,
        };
    }
  } catch (e) {
    showError(e instanceof Error ? e.message : "没恢复成功，请稍后再试");
  } finally {
    scheduleSaving.value = false;
  }
}

async function submitScheduleSwap() {
  if (!authState.token) return;
  const planVersion = scheduleSwapVersion.value;
  if (planVersion == null) return;
  scheduleSwapping.value = true;
  try {
    const res = await getApiClient().postPlanScheduleSwapContent({
      id: planId.value,
      token: authState.token,
      slotKeyA: scheduleSwapSlotKeyA.value,
      slotKeyB: scheduleSwapSlotKeyB.value,
      version: planVersion,
    });
    if (draftMeta.value?.versions?.length) {
      const idx = draftMeta.value.versions.findIndex(
        (v) => v.version === planVersion,
      );
      if (idx >= 0) {
        draftMeta.value.versions[idx] = {
          ...draftMeta.value.versions[idx],
          schedule: res.schedule,
        };
      }
    }
    scheduleSwapOpen.value = false;
  } catch (e) {
    showError(e instanceof Error ? e.message : "没交换成功，请稍后再试");
  } finally {
    scheduleSwapping.value = false;
  }
}

async function startAssistantDraftStream(
  capturedSeq: number,
  payload: PendingDraftStreamPayload,
) {
  const id = planId.value;
  const base = getApiBaseURL();
  const token = authState.token;
  if (!token) {
    showError("未登录，无法流式生成");
    return;
  }
  /** base 可为空：使用同源相对路径 `/plans/...`（开发环境由 Vite 代理到 API） */
  assistantStreaming.value = true;
  v1ScheduleJsonPhase.value = false;
  v1StreamText.value = "";
  selectedVersion.value = 1;

  await consumeAssistantDraftStream(base, id, token, payload, {
    onDelta: (t) => {
      if (capturedSeq !== loadDraftSeq || planId.value !== id) return;
      v1StreamText.value = (v1StreamText.value ?? "") + t;
      void maybeAutoScrollCardToBottom(1);
    },
    onBodyComplete: () => {
      if (capturedSeq !== loadDraftSeq || planId.value !== id) return;
      v1ScheduleJsonPhase.value = true;
    },
    onDone: () => {
      if (capturedSeq !== loadDraftSeq || planId.value !== id) return;
      assistantStreaming.value = false;
      v1ScheduleJsonPhase.value = false;
      v1StreamText.value = null;
      void (async () => {
        draftBundleRefreshing.value = true;
        try {
          await refreshDraftBundleOnly(capturedSeq);
        } finally {
          if (capturedSeq === loadDraftSeq && planId.value === id) {
            draftBundleRefreshing.value = false;
          }
        }
      })();
    },
    onError: (msg) => {
      if (capturedSeq !== loadDraftSeq || planId.value !== id) return;
      assistantStreaming.value = false;
      v1ScheduleJsonPhase.value = false;
      v1StreamText.value = null;
      showError(msg);
    },
  });
}

async function loadDraftPage() {
  const seq = ++loadDraftSeq;
  const id = planId.value;
  loading.value = true;
  clearError();
  assistantStreaming.value = false;
  draftBundleRefreshing.value = false;
  v1ScheduleJsonPhase.value = false;
  v1StreamText.value = null;
  regenerateScheduleJsonPhase.value = false;
  regenerateStreamVersion.value = null;
  regenerateStreamText.value = "";
  draftMeta.value = null;
  planGoal.value = "";
  selectedVersion.value = 1;
  confirmOpen.value = false;
  confirmModalError.value = "";
  try {
    const full = await getApiClient().getPlanDraft({
      id,
      token: authState.token,
    });
    if (seq !== loadDraftSeq) return;
    planGoal.value = full.goal;
    draftMeta.value = {
      versions: full.versions,
      maxVersions: full.maxVersions,
      confirmedVersion: full.confirmedVersion,
      canRegenerate: full.canRegenerate,
    };
    const latest = full.versions.length
      ? full.versions[full.versions.length - 1].version
      : 1;
    selectedVersion.value = full.confirmedVersion ?? latest;
    nextGranularityMode.value = selectedGranularityMode.value;

    /**
     * 普通版：创建接口往往已写入用户说明，仍应在草稿页流式生成完整 v1。
     * 专业版：若创建时已落库完整初稿（proPending），跳过流式以免覆盖。
     */
    const pending = peekDraftStreamPayload(id);
    if (pending) {
      const v1Snap = full.versions.find((v) => v.version === 1);
      const v1Req = (v1Snap?.requirement ?? "").trim();
      const tier = pending.createTier ?? "pro";
      const skipStream = tier === "pro" && v1Req.length > 0;
      if (skipStream) {
        clearDraftStreamPayload(id);
      } else {
        clearDraftStreamPayload(id);
        void startAssistantDraftStream(seq, pending);
      }
    }
  } catch (error) {
    if (seq !== loadDraftSeq) return;
    try {
      await getApiClient().getPlan({
      id,
      token: authState.token,
    });
    if (seq !== loadDraftSeq) return;
      await goToDetail(id);
      return;
    } catch {
      /* 非已定稿计划 */
    }
    if (isDraftClosedError(error)) {
      if (seq !== loadDraftSeq) return;
      await goToDetail(id);
      return;
    }
    showError(error instanceof Error ? error.message : "加载草稿失败");
  } finally {
    if (seq === loadDraftSeq) {
      loading.value = false;
    }
  }
}

function selectVersion(version: number) {
  selectedVersion.value = version;
}

/** 多版本并排时折叠长「版本说明」，减轻纵向压力；显式状态优先于默认 */
const requirementExpandedByVersion = ref<Record<number, boolean>>({});

function isRequirementExpanded(version: number): boolean {
  if (
    regenerateStreamVersion.value !== null &&
    version === regenerateStreamVersion.value
  )
    return true;
  if (assistantStreaming.value && version === 1) return true;
  const explicit = requirementExpandedByVersion.value[version];
  if (explicit !== undefined) return explicit;
  return versions.value.length < 2 || selectedVersion.value === version;
}

function toggleRequirementExpanded(version: number, event: MouseEvent) {
  event.stopPropagation();
  const next = !isRequirementExpanded(version);
  requirementExpandedByVersion.value = {
    ...requirementExpandedByVersion.value,
    [version]: next,
  };
}

function onVersionCardHeadKeydown(e: KeyboardEvent, version: number) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    selectVersion(version);
  }
}

function makeRegeneratePlaceholderVersion(
  prev: DraftVersionSnapshot,
  nextVersion: number,
): DraftVersionSnapshot {
  return {
    version: nextVersion,
    requirement: "",
    deadline: prev.deadline,
    createdAt: new Date().toISOString(),
    stages: JSON.parse(JSON.stringify(prev.stages)) as DraftVersionSnapshot["stages"],
  };
}

function rollbackRegeneratePlaceholder(version: number) {
  if (!draftMeta.value) return;
  const dm = draftMeta.value;
  const remaining = dm.versions.filter((v) => v.version !== version);
  draftMeta.value = {
    ...dm,
    versions: remaining,
    canRegenerate: remaining.length < dm.maxVersions,
  };
  regenerateStreamVersion.value = null;
  regenerateStreamText.value = "";
  regenerateScheduleJsonPhase.value = false;
  if (selectedVersion.value === version && remaining.length) {
    selectedVersion.value = remaining[remaining.length - 1].version;
  }
}

async function handleRegenerate() {
  if (
    !canRegenerate.value ||
    operating.value ||
    regenerateLocked.value ||
    !selectedSnapshot.value
  )
    return;
  if (nextGranularityMode.value !== selectedGranularityMode.value) {
    granularityConfirmOpen.value = true;
    return;
  }
  await submitRegenerate();
}

async function submitRegenerate() {
  if (operating.value) return;
  operating.value = true;
  if (
    !canRegenerate.value ||
    regenerateLocked.value ||
    !selectedSnapshot.value ||
    !draftMeta.value
  ) {
    operating.value = false;
    return;
  }
  const token = authState.token;
  if (!token) {
    showError("未登录，无法重新生成");
    operating.value = false;
    return;
  }
  const seq = loadDraftSeq;
  const id = planId.value;
  const base = getApiBaseURL();
  const prevSnap = selectedSnapshot.value;
  const nextV = draftMeta.value.versions.length + 1;

  clearError();

  const placeholder = makeRegeneratePlaceholderVersion(prevSnap, nextV);
    draftMeta.value = {
      ...draftMeta.value,
    versions: [...draftMeta.value.versions, placeholder],
    canRegenerate: nextV < draftMeta.value.maxVersions,
  };
  selectedVersion.value = nextV;
  regenerateStreamVersion.value = nextV;
  regenerateStreamText.value = "";
  regenerateScheduleJsonPhase.value = false;

  let streamFinishedOk = false;
  try {
    await consumeRegenerateDraftStream(
      base,
      id,
      token,
      {
        requirement: prevSnap.requirement,
        granularityMode: nextGranularityMode.value,
      },
      {
        onDelta: (t) => {
          if (seq !== loadDraftSeq || planId.value !== id) return;
          regenerateStreamText.value += t;
          void maybeAutoScrollCardToBottom(nextV);
        },
        onBodyComplete: () => {
          if (seq !== loadDraftSeq || planId.value !== id) return;
          regenerateScheduleJsonPhase.value = true;
        },
        onDone: () => {
          if (seq !== loadDraftSeq || planId.value !== id) return;
          streamFinishedOk = true;
        },
        onError: (msg) => {
          if (seq !== loadDraftSeq || planId.value !== id) return;
          rollbackRegeneratePlaceholder(nextV);
          showError(
            /次数|用尽|额度/i.test(msg)
              ? `${msg} · 可在「设置」查看会员与额度`
              : msg,
          );
          void refreshAuthBillingFromApi();
        },
      },
    );

    if (streamFinishedOk && seq === loadDraftSeq && planId.value === id) {
      draftBundleRefreshing.value = true;
      try {
        await refreshDraftBundleOnly(seq);
      } finally {
        draftBundleRefreshing.value = false;
        regenerateStreamVersion.value = null;
        regenerateStreamText.value = "";
        regenerateScheduleJsonPhase.value = false;
      }
      const synced = draftMeta.value?.versions;
      if (synced?.length) {
        selectedVersion.value = synced[synced.length - 1].version;
      }
      trackEvent("draft_regenerate", {
        properties: {
          planId: id,
          version:
            synced?.[synced.length - 1]?.version ?? nextV,
          mode: nextGranularityMode.value,
        },
      });
      nextGranularityMode.value = selectedGranularityMode.value;
    }
  } catch (error) {
    rollbackRegeneratePlaceholder(nextV);
    showError(error instanceof Error ? error.message : "重新生成失败");
  } finally {
    operating.value = false;
  }
}

function closeGranularityConfirmModal() {
  if (operating.value) return;
  granularityConfirmOpen.value = false;
}

async function submitGranularitySwitch() {
  if (operating.value || regenerateLocked.value) return;
  granularityConfirmOpen.value = false;
  await submitRegenerate();
}

function openConfirmModal() {
  if (!selectedSnapshot.value || operating.value || regenerateLocked.value)
    return;
  confirmModalError.value = "";
  confirmOpen.value = true;
}

function closeConfirmModal() {
  if (operating.value) return;
  confirmOpen.value = false;
  confirmModalError.value = "";
  granularityConfirmOpen.value = false;
}

useCloseOnEscape(scheduleEditOpen, () => {
  scheduleEditOpen.value = false;
});
useCloseOnEscape(scheduleSwapOpen, () => {
  closeScheduleSwap();
});
useCloseOnEscape(confirmOpen, () => {
  closeConfirmModal();
});
useCloseOnEscape(granularityConfirmOpen, () => {
  closeGranularityConfirmModal();
});

async function submitConfirm() {
  if (!selectedSnapshot.value || operating.value) return;
  operating.value = true;
  confirmModalError.value = "";
  try {
    await getApiClient().confirmPlan({
      id: planId.value,
      token: authState.token,
      version: selectedSnapshot.value.version,
    });
    trackEvent("plan_publish", {
      properties: {
        planId: planId.value,
      },
    });
    confirmOpen.value = false;
    await router.push({ name: "plan-detail", params: { id: planId.value } });
  } catch (error) {
    confirmModalError.value =
      error instanceof Error ? error.message : "确认失败";
  } finally {
    operating.value = false;
  }
}

function renderRequirementMd(raw: string) {
  return renderMarkdownToHtml(raw);
}

function formatCreatedAt(iso: string) {
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  } catch {
    return iso;
  }
}

function getDiffMeta(version: number): VersionDiffMeta | null {
  return versionDiffMetaMap.value.get(version) ?? null;
}

function isAddedTask(version: number, stageName: string, taskTitle: string) {
  return (
    getDiffMeta(version)?.addedTaskKeys.has(`${stageName}::${taskTitle}`) ??
    false
  );
}

function granularityLabel(mode: GranularityMode) {
  if (mode === "deep") return "深度";
  if (mode === "rough") return "粗略";
  return "智能";
}

watch(
  () => route.params.id,
  () => {
    void loadDraftPage();
  },
  { immediate: true },
);

watch(
  selectedGranularityMode,
  (value) => {
    nextGranularityMode.value = value;
  },
  { immediate: true },
);

onMounted(() => {
  document.addEventListener("pointerdown", onDocPointerDown, { capture: true });
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointerDown, {
    capture: true,
  } as EventListenerOptions);
});
  return {
    assistantStreaming,
    canRegenerate,
    cardScrollEls,
    cardStickyBottom,
    clearError,
    closeConfirmModal,
    closeGranularityConfirmModal,
    closeRegenerateMenu,
    closeScheduleSwap,
    confirmModalError,
    confirmOpen,
    draftBundleRefreshing,
    draftMeta,
    errorToastMessage,
    formatCreatedAt,
    getDiffMeta,
    goToDetail,
    granularityConfirmOpen,
    granularityLabel,
    handleRegenerate,
    isAddedTask,
    isDraftClosedError,
    isNearBottom,
    isRequirementExpanded,
    loadDraftPage,
    loading,
    makeRegeneratePlaceholderVersion,
    maybeAutoScrollCardToBottom,
    nextGranularityMode,
    onCardScroll,
    onDocPointerDown,
    onVersionCardHeadKeydown,
    openConfirmModal,
    openScheduleEdit,
    openScheduleSwap,
    operating,
    planGoal,
    planId,
    refreshDraftBundleOnly,
    regenerateLocked,
    regenerateMenuOpen,
    regenerateMenuRoot,
    regenerateScheduleJsonPhase,
    regenerateStreamText,
    regenerateStreamVersion,
    remainingRegenerateCount,
    renderRequirementMd,
    requirementExpandedByVersion,
    requirementForDisplay,
    restoreScheduleSlot,
    rollbackRegeneratePlaceholder,
    route,
    router,
    saveScheduleEdit,
    scheduleEditContent,
    scheduleEditOpen,
    scheduleEditSlotKey,
    scheduleEditVersion,
    scheduleSaving,
    scheduleSkeletonForVersion,
    scheduleSlotsForVersion,
    scheduleSwapOpen,
    scheduleSwapping,
    scheduleSwapPreview,
    scheduleSwapSlotKeyA,
    scheduleSwapSlotKeyB,
    scheduleSwapVersion,
    scheduleVisibleForVersion,
    selectedDiffMeta,
    selectedGranularityMode,
    selectedSnapshot,
    selectedTaskCount,
    selectedVersion,
    selectVersion,
    setCardScrollEl,
    setNextGranularityModeFromMenu,
    showError,
    startAssistantDraftStream,
    stripLastJsonCodeBlock,
    submitConfirm,
    submitGranularitySwitch,
    submitRegenerate,
    submitScheduleSwap,
    toggleRegenerateMenu,
    toggleRequirementExpanded,
    totalTaskCount,
    v1ScheduleJsonPhase,
    v1StreamText,
    versionDiffMetaMap,
    versions,
  };
}
