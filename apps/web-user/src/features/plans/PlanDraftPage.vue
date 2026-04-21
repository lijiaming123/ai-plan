<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import UiErrorToast from "../../components/UiErrorToast.vue";
import {
  getApiBaseURL,
  getApiClient,
  type PlanRecord,
} from "../../lib/api-client";
import {
  clearDraftStreamPayload,
  consumeAssistantDraftStream,
  consumeRegenerateDraftStream,
  peekDraftStreamPayload,
  type PendingDraftStreamPayload,
} from "../../lib/plan-assistant-stream";
import { renderMarkdownToHtml } from "../../lib/render-markdown";
import { authState } from "../../stores/auth";

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

function setCardScrollEl(version: number, el: Element | null) {
  if (!el) {
    cardScrollEls.delete(version);
    cardStickyBottom.delete(version);
    return;
  }
  if (el instanceof HTMLElement) {
    cardScrollEls.set(version, el);
    if (!cardStickyBottom.has(version)) cardStickyBottom.set(version, true);
  }
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
    showError(error instanceof Error ? error.message : "刷新草稿失败");
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
    showError(e instanceof Error ? e.message : "保存失败");
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
    showError(e instanceof Error ? e.message : "恢复失败");
  } finally {
    scheduleSaving.value = false;
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
    granularityMode: prev.granularityMode,
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
          showError(msg);
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
</script>

<template>
  <div
    class="draft-view relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[linear-gradient(168deg,#f5fbf7_0%,#e8f3ec_38%,#eef6f1_72%,#f8fcfa_100%)] font-display text-[#111813]"
  >
    <UiErrorToast :message="errorToastMessage" @close="clearError" />

    <div
      class="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <div class="draft-bg-grid absolute inset-0 opacity-[0.45]"></div>
      <div class="draft-bg-orb draft-bg-orb--left"></div>
      <div class="draft-bg-orb draft-bg-orb--right"></div>
      <div class="draft-bg-grain"></div>
    </div>

    <header
      class="draft-header relative z-20 shrink-0 border-b border-[#dbe8e1]/90"
    >
      <div class="draft-header-sheen" aria-hidden="true"></div>
      <div class="relative px-4 py-3.5 md:px-8 md:py-4">
        <div
          class="mx-auto flex max-w-[1600px] flex-col gap-4 md:flex-row md:items-center md:justify-between"
        >
          <div class="draft-header-main min-w-0">
            <div
              class="mb-2 flex flex-wrap items-center gap-2 text-sm text-[#5f7d70]"
            >
              <router-link
                to="/plans"
                class="font-semibold transition hover:text-[#0f8b4e]"
                >我的计划</router-link
              >
              <span class="text-[#b8d0c4]">/</span>
              <span
                class="rounded-lg bg-[#e8f4ed] px-2.5 py-0.5 font-mono text-xs font-bold tracking-tight text-[#1a6b45] ring-1 ring-[#0f8b4e]/12"
              >
                草稿中心
              </span>
            </div>
            <h1
              class="draft-title truncate text-2xl font-black tracking-[-0.03em] md:text-3xl"
            >
              {{ planGoal || "计划草稿" }}
            </h1>
            <div
              class="mt-2.5 flex flex-wrap items-center gap-2 text-xs font-semibold"
            >
              <span class="draft-pill draft-pill--accent">草稿待确认</span>
              <span class="draft-pill">版本数 {{ versions.length }}</span>
              <span class="draft-pill">总任务 {{ totalTaskCount }}</span>
              <span class="draft-pill">当前任务 {{ selectedTaskCount }}</span>
              <span
                v-if="
                  selectedSnapshot &&
                  selectedSnapshot.version !== versions[0]?.version &&
                  selectedDiffMeta
                "
                class="draft-pill draft-pill--diff"
              >
                对比上一版：+{{ selectedDiffMeta.addedTasks }} / -{{
                  selectedDiffMeta.removedTasks
                }}
                任务
              </span>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2.5">
            <div
              ref="regenerateMenuRoot"
              class="relative inline-flex items-stretch"
              @keydown.esc.stop.prevent="closeRegenerateMenu"
            >
              <button
                type="button"
                class="draft-btn draft-btn--ghost rounded-r-none"
                :class="{ 'is-busy': operating }"
                :disabled="!canRegenerate || operating || regenerateLocked"
                data-testid="draft-regenerate"
                @click="handleRegenerate"
              >
                重新生成（剩余 {{ remainingRegenerateCount }} 次）
              </button>
              <button
                type="button"
                class="draft-btn draft-btn--ghost -ml-px rounded-l-none px-3"
                :disabled="!canRegenerate || operating || regenerateLocked"
                data-testid="draft-regenerate-menu"
                :aria-expanded="regenerateMenuOpen ? 'true' : 'false'"
                aria-haspopup="menu"
                @click.stop="toggleRegenerateMenu"
              >
                <span class="mr-1 text-xs font-black tracking-tight text-[#35624f]">
                  {{ granularityLabel(nextGranularityMode) }}
                </span>
                <span class="sr-only">选择颗粒度</span>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  class="h-4 w-4 text-[#35624f]"
                  aria-hidden="true"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>

              <div
                v-if="regenerateMenuOpen"
                class="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[240px] overflow-hidden rounded-xl border border-[#cfe4d8] bg-white shadow-[0_18px_44px_-18px_rgba(17,24,19,0.35)]"
                role="menu"
                data-testid="draft-regenerate-menu-panel"
              >
                <div class="border-b border-[#edf4f0] px-4 py-3">
                  <p class="text-xs font-black text-[#111813]">颗粒度</p>
                  <p class="mt-0.5 text-[10px] font-semibold text-[#6b857a]">
                    仅影响下次重新生成
                  </p>
                </div>
                <div class="p-2">
                  <button
                    type="button"
                    class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-bold text-[#203029] hover:bg-[#f6faf8]"
                    role="menuitemradio"
                    :aria-checked="nextGranularityMode === 'smart' ? 'true' : 'false'"
                    data-testid="draft-regenerate-granularity-smart"
                    @click="setNextGranularityModeFromMenu('smart')"
                  >
                    <span>智能推荐</span>
                    <span v-if="nextGranularityMode === 'smart'">✓</span>
                  </button>
                  <button
                    type="button"
                    class="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-bold text-[#203029] hover:bg-[#f6faf8]"
                    role="menuitemradio"
                    :aria-checked="nextGranularityMode === 'deep' ? 'true' : 'false'"
                    data-testid="draft-regenerate-granularity-deep"
                    @click="setNextGranularityModeFromMenu('deep')"
                  >
                    <span>深度计划</span>
                    <span v-if="nextGranularityMode === 'deep'">✓</span>
                  </button>
                  <button
                    type="button"
                    class="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-bold text-[#203029] hover:bg-[#f6faf8]"
                    role="menuitemradio"
                    :aria-checked="nextGranularityMode === 'rough' ? 'true' : 'false'"
                    data-testid="draft-regenerate-granularity-rough"
                    @click="setNextGranularityModeFromMenu('rough')"
                  >
                    <span>粗略计划</span>
                    <span v-if="nextGranularityMode === 'rough'">✓</span>
                  </button>
                </div>
              </div>
            </div>
            <button
              type="button"
              class="draft-btn draft-btn--primary"
              :disabled="!selectedSnapshot || operating || regenerateLocked"
              data-testid="draft-open-confirm"
              @click="openConfirmModal"
            >
              确认 v{{ selectedSnapshot?.version ?? "—" }} 并保存
            </button>
          </div>
        </div>

        <div class="mx-auto mt-4 max-w-[1600px] md:hidden">
          <label class="mb-1.5 block text-xs font-bold text-[#466257]"
            >当前查看版本</label
          >
          <UiSunriseSelect
            v-model.number="selectedVersion"
            data-testid="draft-version-select"
          >
            <ElOption
              v-for="v in versions"
              :key="`m-${v.version}`"
              :value="v.version"
              :label="`v${v.version}`"
            />
          </UiSunriseSelect>
        </div>
      </div>
    </header>

    <main
      class="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-3 pt-4 md:px-8 md:pb-3 md:pt-5"
    >
      <div
        v-if="loading"
        class="draft-loading flex flex-1 flex-col items-center justify-center gap-5 py-20"
      >
        <div class="draft-loading__rings" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <p class="text-sm font-bold tracking-tight text-[#4a7a63]">
          加载草稿中…
        </p>
      </div>

      <div
        v-else
        class="draft-main-enter mx-auto flex w-full max-w-[1600px] flex-1 min-h-0 flex-col"
      >
        <div class="flex min-h-0 flex-1 flex-col">
          <div
            class="draft-version-grid hidden min-h-0 w-full flex-1 auto-rows-[minmax(0,1fr)] gap-4 md:grid md:gap-4 md:pb-0 md:pt-1"
            :style="{
              gridTemplateColumns: `repeat(${Math.max(versions.length, 1)}, minmax(0, 1fr))`,
            }"
          >
            <div
              v-for="(ver, idx) in versions"
              :key="ver.version"
              class="draft-version-card group relative flex min-h-0 min-w-0 flex-col self-stretch rounded-2xl text-left outline-none"
              :class="[
                selectedVersion === ver.version
                  ? 'draft-version-card--selected draft-card-active'
                  : 'draft-version-card--idle',
              ]"
              :style="{ animationDelay: `${idx * 75}ms` }"
              :data-testid="`draft-card-v${ver.version}`"
            >
              <div
                class="draft-card-head shrink-0 cursor-pointer rounded-t-2xl px-4 py-3.5 transition-colors hover:bg-black/[0.02]"
                role="button"
                tabindex="0"
                :aria-current="
                  selectedVersion === ver.version ? 'true' : undefined
                "
                :aria-label="`选择版本 v${ver.version}`"
                @click.stop="selectVersion(ver.version)"
                @keydown="onVersionCardHeadKeydown($event, ver.version)"
              >
                <div class="flex items-center justify-between gap-2">
                  <p
                    class="draft-card-version-label text-lg font-black tracking-tight"
                  >
                    v{{ ver.version }}
                  </p>
                  <span
                    class="draft-card-status inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-[background,color,box-shadow] duration-300"
                    :class="
                      selectedVersion === ver.version
                        ? 'draft-card-status--on'
                        : 'draft-card-status--off'
                    "
                  >
                    <span
                      class="draft-card-status-dot"
                      aria-hidden="true"
                    ></span>
                    {{
                      selectedVersion === ver.version ? "当前选中" : "待评估"
                    }}
                  </span>
                </div>
                <p class="mt-1.5 text-xs font-medium text-[#61896f]">
                  {{ formatCreatedAt(ver.createdAt) }}
                </p>
                <div class="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
                  <template v-if="ver.version === versions[0]?.version">
                    <span
                      class="rounded-full bg-[#edf4f0] px-2 py-0.5 text-[#5d786b] ring-1 ring-[#dbe8e2]"
                      >基线版本</span
                    >
                  </template>
                  <template v-else>
                    <span
                      class="rounded-full bg-[#e8f7ee] px-2 py-0.5 text-[#0f8b4e]"
                      >+阶段
                      {{ getDiffMeta(ver.version)?.addedStages ?? 0 }}</span
                    >
                    <span
                      class="rounded-full bg-[#e8f7ee] px-2 py-0.5 text-[#0f8b4e]"
                      >+任务
                      {{ getDiffMeta(ver.version)?.addedTasks ?? 0 }}</span
                    >
                    <span
                      class="rounded-full bg-[#fff4f2] px-2 py-0.5 text-[#a34e45]"
                      >-阶段
                      {{ getDiffMeta(ver.version)?.removedStages ?? 0 }}</span
                    >
                    <span
                      class="rounded-full bg-[#fff4f2] px-2 py-0.5 text-[#a34e45]"
                      >-任务
                      {{ getDiffMeta(ver.version)?.removedTasks ?? 0 }}</span
                    >
                  </template>
                </div>
              </div>
              <div
                :ref="(el) => setCardScrollEl(ver.version, el)"
                class="draft-card-scroll ui-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-y-contain rounded-b-2xl px-4 py-4"
                @scroll.passive="onCardScroll(ver.version)"
              >
                <div class="draft-requirement-sheet mb-5">
                  <p class="draft-requirement-label">版本说明</p>
                  <div
                    class="relative max-w-full"
                    :class="[
                      versions.length >= 2 &&
                      !isRequirementExpanded(ver.version)
                        ? 'draft-requirement-body draft-requirement-body--clamped'
                        : '',
                    ]"
                  >
                    <div
                      class="draft-md"
                      v-html="renderRequirementMd(requirementForDisplay(ver))"
                    ></div>
                    <span
                      v-if="
                        (assistantStreaming && ver.version === 1) ||
                        regenerateStreamVersion === ver.version
                      "
                      class="draft-stream-caret ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-sm bg-[#0f8b4e] align-[-0.15em]"
                      aria-hidden="true"
                    />
                  </div>
                  <button
                    v-if="versions.length >= 2"
                    type="button"
                    class="draft-requirement-toggle mt-2 text-xs font-bold text-[#0f8b4e] underline-offset-2 hover:underline"
                    :data-testid="`draft-requirement-toggle-v${ver.version}`"
                    @click.stop="toggleRequirementExpanded(ver.version, $event)"
                  >
                    {{
                      isRequirementExpanded(ver.version)
                        ? "收起版本说明"
                        : "展开全文"
                    }}
                  </button>
                </div>
                <div
                  v-if="scheduleSkeletonForVersion(ver)"
                  class="draft-version-schedule border-t border-[#edf4f0] pt-5"
                  :data-testid="`draft-schedule-skeleton-v${ver.version}`"
                  aria-busy="true"
                  aria-label="打卡计划加载中"
                  @click.stop
                >
                  <div
                    class="mb-3 flex flex-wrap items-end justify-between gap-2"
                  >
                    <div class="min-w-0">
                      <p class="text-xs font-black text-[#111813]">打卡计划</p>
                      <p
                        class="mt-0.5 text-[10px] font-medium leading-snug text-[#7a9086]"
                      >
                        正在加载表格，请稍候…
                      </p>
                    </div>
                    <div
                      class="h-3 w-24 animate-pulse rounded bg-[#dfe8e3]"
                      aria-hidden="true"
                    />
                  </div>
                  <div
                    class="draft-schedule-x-scroll ui-scrollbar max-w-full overflow-x-auto overscroll-x-contain rounded-xl pb-0.5"
                  >
                    <div
                      class="min-w-[600px] overflow-hidden rounded-xl border border-[#e6efe9] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
                    >
                      <div
                        class="grid grid-cols-[148px,minmax(260px,1fr),128px] items-center gap-3 border-b border-[#edf4f0] bg-[#f8fcfa] px-4 py-2"
                      >
                        <div
                          class="h-2.5 w-14 rounded bg-[#dfe8e3]"
                          aria-hidden="true"
                        />
                        <div
                          class="h-2.5 w-20 rounded bg-[#dfe8e3]"
                          aria-hidden="true"
                        />
                        <div
                          class="ml-auto h-2.5 w-10 rounded bg-[#dfe8e3]"
                          aria-hidden="true"
                        />
                      </div>
                      <div
                        v-for="row in 4"
                        :key="row"
                        class="grid grid-cols-[148px,minmax(260px,1fr),128px] items-center gap-3 border-b border-[#f1f5f3] px-4 py-3 last:border-b-0"
                      >
                        <div
                          class="h-3 w-[5.5rem] animate-pulse rounded bg-[#e8f0ec]"
                          aria-hidden="true"
                        />
                        <div
                          class="h-3 max-w-[280px] animate-pulse rounded bg-[#e8f0ec]"
                          aria-hidden="true"
                        />
                        <div
                          class="ml-auto h-8 w-[4.5rem] animate-pulse rounded bg-[#e8f0ec]"
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div
                  v-else-if="scheduleVisibleForVersion(ver) && ver.schedule"
                  class="draft-version-schedule border-t border-[#edf4f0] pt-5"
                  :data-testid="`draft-schedule-v${ver.version}`"
                  @click.stop
                >
                  <div
                    class="mb-3 flex flex-wrap items-end justify-between gap-2"
                  >
                    <div class="min-w-0">
                      <p class="text-xs font-black text-[#111813]">打卡计划</p>
                      <p
                        class="mt-0.5 text-[10px] font-medium leading-snug text-[#7a9086]"
                      >
                        并排对比时卡片较窄，表格可左右滑动查看
                      </p>
                    </div>
                    <p class="text-[11px] font-semibold text-[#61896f]">
                      {{ ver.schedule.granularity === "day" ? "按天" : "按周" }}
                      · 共 {{ ver.schedule.slots.length }} 个时间槽
                    </p>
                  </div>
                  <div
                    class="draft-schedule-x-scroll ui-scrollbar max-w-full overflow-x-auto overscroll-x-contain rounded-xl pb-0.5"
                  >
                    <div
                      class="min-w-[600px] overflow-hidden rounded-xl border border-[#e6efe9] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
                    >
                      <div
                        class="grid grid-cols-[148px,minmax(260px,1fr),128px] items-center gap-3 border-b border-[#edf4f0] bg-[#f8fcfa] px-4 py-2 text-[11px] font-black tracking-[0.12em] text-[#4d6a5e]"
                      >
                        <div>时间槽</div>
                        <div>内容</div>
                        <div class="text-right">操作</div>
                      </div>
                      <div
                        v-for="slot in ver.schedule.slots"
                        :key="slot.slotKey"
                        class="grid grid-cols-[148px,minmax(260px,1fr),128px] items-start gap-3 border-b border-[#f1f5f3] px-4 py-3 last:border-b-0"
                      >
                        <div class="min-w-0">
                          <p
                            class="text-xs font-semibold tracking-[0.08em] text-[#61896f]"
                          >
                            {{ slot.slotKey }}
                            <span
                              v-if="slot.contentSource === 'edited'"
                              class="ml-2 inline-flex rounded-full bg-[#f1f5f3] px-2 py-0.5 text-[10px] font-bold text-[#2a3832]"
                            >
                              已编辑
                            </span>
                          </p>
                        </div>
                        <div class="min-w-0">
                          <p
                            class="whitespace-pre-wrap text-sm leading-relaxed text-[#111813]"
                          >
                            {{ slot.content }}
                          </p>
                        </div>
                        <div
                          class="flex justify-end gap-2 sm:flex-col sm:items-end"
                        >
                          <button
                            type="button"
                            class="rounded-lg border border-[#dbe6df] bg-white px-3 py-1.5 text-xs font-semibold text-[#111813] hover:bg-[#f6f8f6] disabled:opacity-50"
                            :disabled="scheduleSaving"
                            @click.stop="
                              openScheduleEdit(
                                slot.slotKey,
                                slot.content,
                                ver.version,
                              )
                            "
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            class="rounded-lg border border-[#f0d8d6] bg-white px-3 py-1.5 text-xs font-semibold text-[#7b2f28] hover:bg-[#fff7f6] disabled:opacity-50"
                            :disabled="scheduleSaving"
                            @click.stop="
                              restoreScheduleSlot(slot.slotKey, ver.version)
                            "
                          >
                            恢复
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="selectedSnapshot"
            class="flex min-h-0 flex-1 flex-col md:hidden"
          >
            <article
              class="draft-mobile-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-[#0f8b4e] bg-white shadow-[0_12px_40px_-14px_rgba(15,139,78,0.35)] ring-2 ring-[#0f8b4e]/18"
              :data-testid="`draft-card-v${selectedSnapshot.version}`"
            >
              <div
                class="shrink-0 border-b border-[#e8f0ec] bg-[linear-gradient(180deg,#fbfffd_0%,#f0faf4_100%)] px-4 py-3.5"
              >
                <p class="text-lg font-black tracking-tight text-[#163025]">
                  v{{ selectedSnapshot.version }}
                </p>
                <p class="mt-1 text-xs font-medium text-[#61896f]">
                  {{ formatCreatedAt(selectedSnapshot.createdAt) }}
                </p>
              </div>
              <div
                :ref="(el) => setCardScrollEl(selectedSnapshot.version, el)"
                class="draft-card-scroll ui-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4"
                @scroll.passive="onCardScroll(selectedSnapshot.version)"
              >
                <div class="draft-requirement-sheet mb-5">
                  <p class="draft-requirement-label">版本说明</p>
                  <div class="relative inline-block max-w-full">
                    <div
                      class="draft-md"
                      v-html="
                        renderRequirementMd(
                          requirementForDisplay(selectedSnapshot),
                        )
                      "
                    ></div>
                    <span
                      v-if="
                        (assistantStreaming &&
                          selectedSnapshot.version === 1) ||
                        regenerateStreamVersion === selectedSnapshot.version
                      "
                      class="draft-stream-caret ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-sm bg-[#0f8b4e] align-[-0.15em]"
                      aria-hidden="true"
                    />
                  </div>
                </div>
                <div
                  v-if="scheduleSkeletonForVersion(selectedSnapshot)"
                  class="draft-version-schedule border-t border-[#edf4f0] pt-5"
                  :data-testid="`draft-schedule-skeleton-v${selectedSnapshot.version}`"
                  aria-busy="true"
                  aria-label="打卡计划加载中"
                  @click.stop
                >
                  <div
                    class="mb-3 flex flex-wrap items-end justify-between gap-2"
                  >
                    <div class="min-w-0">
                      <p class="text-xs font-black text-[#111813]">打卡计划</p>
                      <p
                        class="mt-0.5 text-[10px] font-medium leading-snug text-[#7a9086]"
                      >
                        正在加载表格，请稍候…
                      </p>
                    </div>
                    <div
                      class="h-3 w-24 animate-pulse rounded bg-[#dfe8e3]"
                      aria-hidden="true"
                    />
                  </div>
                  <div
                    class="draft-schedule-x-scroll ui-scrollbar max-w-full overflow-x-auto overscroll-x-contain rounded-xl pb-0.5"
                  >
                    <div
                      class="min-w-[600px] overflow-hidden rounded-xl border border-[#e6efe9] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
                    >
                      <div
                        class="grid grid-cols-[148px,minmax(260px,1fr),128px] items-center gap-3 border-b border-[#edf4f0] bg-[#f8fcfa] px-4 py-2"
                      >
                        <div
                          class="h-2.5 w-14 rounded bg-[#dfe8e3]"
                          aria-hidden="true"
                        />
                        <div
                          class="h-2.5 w-20 rounded bg-[#dfe8e3]"
                          aria-hidden="true"
                        />
                        <div
                          class="ml-auto h-2.5 w-10 rounded bg-[#dfe8e3]"
                          aria-hidden="true"
                        />
                      </div>
                      <div
                        v-for="row in 4"
                        :key="row"
                        class="grid grid-cols-[148px,minmax(260px,1fr),128px] items-center gap-3 border-b border-[#f1f5f3] px-4 py-3 last:border-b-0"
                      >
                        <div
                          class="h-3 w-[5.5rem] animate-pulse rounded bg-[#e8f0ec]"
                          aria-hidden="true"
                        />
                        <div
                          class="h-3 max-w-[280px] animate-pulse rounded bg-[#e8f0ec]"
                          aria-hidden="true"
                        />
                        <div
                          class="ml-auto h-8 w-[4.5rem] animate-pulse rounded bg-[#e8f0ec]"
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div
                  v-else-if="
                    scheduleVisibleForVersion(selectedSnapshot) &&
                    selectedSnapshot.schedule
                  "
                  class="draft-version-schedule border-t border-[#edf4f0] pt-5"
                  :data-testid="`draft-schedule-v${selectedSnapshot.version}`"
                  @click.stop
                >
                  <div
                    class="mb-3 flex flex-wrap items-end justify-between gap-2"
                  >
                    <div class="min-w-0">
                      <p class="text-xs font-black text-[#111813]">打卡计划</p>
                      <p
                        class="mt-0.5 text-[10px] font-medium leading-snug text-[#7a9086]"
                      >
                        表格较宽时可左右滑动
                      </p>
                    </div>
                    <p class="text-[11px] font-semibold text-[#61896f]">
                      {{
                        selectedSnapshot.schedule.granularity === "day"
                          ? "按天"
                          : "按周"
                      }}
                      · 共 {{ selectedSnapshot.schedule.slots.length }} 个时间槽
                    </p>
                  </div>
                  <div
                    class="draft-schedule-x-scroll ui-scrollbar max-w-full overflow-x-auto overscroll-x-contain rounded-xl pb-0.5"
                  >
                    <div
                      class="min-w-[600px] overflow-hidden rounded-xl border border-[#e6efe9] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
                    >
                      <div
                        class="grid grid-cols-[148px,minmax(260px,1fr),128px] items-center gap-3 border-b border-[#edf4f0] bg-[#f8fcfa] px-4 py-2 text-[11px] font-black tracking-[0.12em] text-[#4d6a5e]"
                      >
                        <div>时间槽</div>
                        <div>内容</div>
                        <div class="text-right">操作</div>
                      </div>
                      <div
                        v-for="slot in selectedSnapshot.schedule.slots"
                        :key="slot.slotKey"
                        class="grid grid-cols-[148px,minmax(260px,1fr),128px] items-start gap-3 border-b border-[#f1f5f3] px-4 py-3 last:border-b-0"
                      >
                        <div class="min-w-0">
                          <p
                            class="text-xs font-semibold tracking-[0.08em] text-[#61896f]"
                          >
                            {{ slot.slotKey }}
                            <span
                              v-if="slot.contentSource === 'edited'"
                              class="ml-2 inline-flex rounded-full bg-[#f1f5f3] px-2 py-0.5 text-[10px] font-bold text-[#2a3832]"
                            >
                              已编辑
                            </span>
                          </p>
                        </div>
                        <div class="min-w-0">
                          <p
                            class="whitespace-pre-wrap text-sm leading-relaxed text-[#111813]"
                          >
                            {{ slot.content }}
                          </p>
                        </div>
                        <div
                          class="flex justify-end gap-2 sm:flex-col sm:items-end"
                        >
                          <button
                            type="button"
                            class="rounded-lg border border-[#dbe6df] bg-white px-3 py-1.5 text-xs font-semibold text-[#111813] hover:bg-[#f6f8f6] disabled:opacity-50"
                            :disabled="scheduleSaving"
                            @click.stop="
                              openScheduleEdit(
                                slot.slotKey,
                                slot.content,
                                selectedSnapshot.version,
                              )
                            "
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            class="rounded-lg border border-[#f0d8d6] bg-white px-3 py-1.5 text-xs font-semibold text-[#7b2f28] hover:bg-[#fff7f6] disabled:opacity-50"
                            :disabled="scheduleSaving"
                            @click.stop="
                              restoreScheduleSlot(
                                slot.slotKey,
                                selectedSnapshot.version,
                              )
                            "
                          >
                            恢复
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>

        <div
          v-if="!loading && !versions.length"
          class="draft-empty mx-auto my-auto max-w-xl rounded-2xl border border-[#cfe4d8] bg-white/90 p-10 text-center shadow-[0_16px_48px_-20px_rgba(18,74,49,0.2)] backdrop-blur-sm"
        >
          <p class="mb-2 text-lg font-black text-[#1a3d2e]">
            还没有可比较的草稿版本
          </p>
          <p class="text-sm leading-relaxed text-[#61896f]">
            点击顶部「重新生成」创建新版本，或返回创建页完善输入信息。
          </p>
        </div>
      </div>
    </main>

    <Teleport to="body">
      <div
        v-if="scheduleEditOpen"
        class="draft-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
        data-testid="draft-schedule-edit-dialog"
        @click.self="scheduleEditOpen = false"
      >
        <div
          class="draft-modal-panel w-full max-w-xl rounded-2xl border border-[#d5e8df] bg-[linear-gradient(165deg,#ffffff_0%,#f6fcf9_100%)] p-6 shadow-[0_24px_64px_-24px_rgba(18,74,49,0.45)]"
          role="dialog"
          aria-modal="true"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-base font-black tracking-tight text-[#111813]">
                编辑打卡内容
              </h2>
              <p class="mt-1 text-xs font-semibold text-[#61896f]">
                版本 v{{ scheduleEditVersion ?? "—" }} · 时间槽：{{
                  scheduleEditSlotKey
                }}
              </p>
            </div>
            <button
              type="button"
              class="draft-btn draft-btn--ghost h-9 px-3"
              @click="scheduleEditOpen = false"
            >
              关闭
            </button>
          </div>
          <textarea
            v-model="scheduleEditContent"
            rows="7"
            class="mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed"
            placeholder="仅编辑内容文本，不改变 slotKey"
          />
          <div class="mt-6 flex justify-end gap-2">
            <button
              type="button"
              class="draft-btn draft-btn--ghost h-10 px-4"
              :disabled="scheduleSaving"
              @click="scheduleEditOpen = false"
            >
              取消
            </button>
            <button
              type="button"
              class="draft-btn draft-btn--primary h-10 px-4 disabled:opacity-60"
              :disabled="scheduleSaving"
              @click="saveScheduleEdit"
            >
              {{ scheduleSaving ? "保存中…" : "保存" }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 二次确认 -->
    <Teleport to="body">
      <div
        v-if="confirmOpen"
        class="draft-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
        data-testid="draft-confirm-modal"
        @click.self="closeConfirmModal"
      >
        <div
          class="draft-modal-panel w-full max-w-md rounded-2xl border border-[#d5e8df] bg-[linear-gradient(165deg,#ffffff_0%,#f6fcf9_100%)] p-6 shadow-[0_24px_64px_-24px_rgba(18,74,49,0.45)]"
          role="dialog"
          aria-modal="true"
        >
          <h2 class="text-lg font-black tracking-tight text-[#111813]">
            确认保存该版本？
          </h2>
          <p class="mt-2 text-sm leading-relaxed text-[#41534a]">
            确认后计划将进入执行阶段，当前选中的
            <span class="font-bold text-[#0f8b4e]"
              >v{{ selectedSnapshot?.version }}</span
            >
            将作为正式版本保存，此操作不可撤销。
          </p>
          <p
            v-if="confirmModalError"
            class="mt-3 text-sm font-medium text-red-700"
            data-testid="draft-confirm-error"
          >
            {{ confirmModalError }}
          </p>
          <div class="mt-6 flex justify-end gap-2">
            <button
              type="button"
              class="draft-btn draft-btn--ghost h-10 px-4"
              data-testid="draft-confirm-cancel"
              @click="closeConfirmModal"
            >
              取消
            </button>
            <button
              type="button"
              class="draft-btn draft-btn--primary h-10 px-4 disabled:opacity-60"
              data-testid="draft-confirm-submit"
              :disabled="operating"
              @click="submitConfirm"
            >
              {{ operating ? "提交中…" : "确认保存" }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="granularityConfirmOpen"
        class="draft-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
        data-testid="draft-granularity-confirm-modal"
        @click.self="closeGranularityConfirmModal"
      >
        <div
          class="draft-modal-panel w-full max-w-md rounded-2xl border border-[#d5e8df] bg-[linear-gradient(165deg,#ffffff_0%,#f6fcf9_100%)] p-6 shadow-[0_24px_64px_-24px_rgba(18,74,49,0.45)]"
          role="dialog"
          aria-modal="true"
        >
          <h2 class="text-lg font-black tracking-tight text-[#111813]">
            确认切换颗粒度并重新生成？
          </h2>
          <p class="mt-2 text-sm leading-relaxed text-[#41534a]">
            当前版本颗粒度为
            <span class="font-bold text-[#0f8b4e]">{{
              selectedGranularityMode
            }}</span>
            ，将切换为
            <span class="font-bold text-[#0f8b4e]">{{
              nextGranularityMode
            }}</span>
            并生成新的草稿版本。
          </p>
          <div class="mt-6 flex justify-end gap-2">
            <button
              type="button"
              class="draft-btn draft-btn--ghost h-10 px-4"
              data-testid="draft-granularity-confirm-cancel"
              @click="closeGranularityConfirmModal"
            >
              取消
            </button>
            <button
              type="button"
              class="draft-btn draft-btn--primary h-10 px-4 disabled:opacity-60"
              data-testid="draft-granularity-confirm-submit"
              :disabled="operating || regenerateLocked"
              @click="submitGranularitySwitch"
            >
              {{ operating ? "生成中…" : "确认并生成" }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* —— 氛围背景 —— */
.draft-bg-grid {
  background-image:
    linear-gradient(rgba(27, 111, 73, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(27, 111, 73, 0.06) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: radial-gradient(
    ellipse 85% 70% at 50% 20%,
    #000 20%,
    transparent 72%
  );
}

.draft-bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(58px);
  opacity: 0.38;
  animation: draftOrbFloat 22s ease-in-out infinite;
}

.draft-bg-orb--left {
  width: min(42vw, 22rem);
  height: min(42vw, 22rem);
  left: -8%;
  top: 18%;
  background: radial-gradient(
    circle at 30% 30%,
    rgba(53, 205, 117, 0.55),
    transparent 68%
  );
}

.draft-bg-orb--right {
  width: min(48vw, 26rem);
  height: min(48vw, 26rem);
  right: -10%;
  bottom: 8%;
  background: radial-gradient(
    circle at 70% 40%,
    rgba(15, 139, 78, 0.4),
    transparent 65%
  );
  animation-delay: -9s;
}

.draft-bg-grain {
  position: absolute;
  inset: 0;
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  pointer-events: none;
}

@keyframes draftOrbFloat {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(18px, -22px) scale(1.05);
  }
}

/* —— 顶栏 —— */
.draft-header {
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.97) 0%,
    rgba(244, 252, 247, 0.94) 100%
  );
  backdrop-filter: blur(14px) saturate(1.12);
  -webkit-backdrop-filter: blur(14px) saturate(1.12);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.88) inset,
    0 10px 32px -22px rgba(18, 74, 49, 0.22);
}

.draft-header-sheen {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 0%,
    transparent 38%,
    rgba(53, 205, 117, 0.12) 48%,
    transparent 58%,
    transparent 100%
  );
  background-size: 220% 100%;
  pointer-events: none;
}

@media (prefers-reduced-motion: no-preference) {
  .draft-header-sheen {
    animation: draftSheenPan 11s ease-in-out infinite;
  }
}

@keyframes draftSheenPan {
  0%,
  100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

.draft-title {
  background: linear-gradient(115deg, #0a2418 0%, #0f8b4e 42%, #163025 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.draft-pill {
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  padding: 0.28rem 0.75rem;
  color: #486255;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.95),
    0 0 0 1px rgba(27, 111, 73, 0.12);
}

.draft-pill--accent {
  background: linear-gradient(
    135deg,
    rgba(207, 245, 223, 0.95),
    rgba(232, 247, 238, 0.98)
  );
  color: #06703d;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    0 0 0 1px rgba(15, 139, 78, 0.2);
}

.draft-pill--diff {
  background: rgba(237, 248, 242, 0.95);
  color: #35624f;
  box-shadow: 0 0 0 1px rgba(15, 139, 78, 0.15);
}

/* —— 按钮 —— */
.draft-btn {
  position: relative;
  display: inline-flex;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  padding-left: 1rem;
  padding-right: 1rem;
  font-size: 0.875rem;
  font-weight: 800;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    filter 0.2s ease;
}

.draft-btn:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.draft-btn--ghost {
  border: 1px solid rgba(27, 111, 73, 0.22);
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.98),
    rgba(244, 251, 247, 0.96)
  );
  color: #244236;
  box-shadow: 0 6px 16px -8px rgba(18, 74, 49, 0.2);
}

.draft-btn--ghost:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: rgba(15, 139, 78, 0.35);
  box-shadow: 0 10px 22px -10px rgba(18, 74, 49, 0.28);
}

.draft-btn--primary {
  overflow: hidden;
  border: 1px solid rgba(15, 139, 78, 0.35);
  background: linear-gradient(100deg, #12a65d 0%, #0f8b4e 48%, #0a6b3d 100%);
  color: #fff;
  box-shadow:
    0 8px 22px -6px rgba(15, 139, 78, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.22);
}

.draft-btn--primary:hover:not(:disabled) {
  transform: translateY(-2px);
  filter: brightness(1.05);
}

@media (prefers-reduced-motion: no-preference) {
  .draft-btn--primary::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      105deg,
      transparent 0%,
      transparent 42%,
      rgba(255, 255, 255, 0.35) 50%,
      transparent 58%,
      transparent 100%
    );
    transform: translateX(-100%);
    animation: draftBtnShine 3.5s ease-in-out infinite;
    pointer-events: none;
  }
}

@keyframes draftBtnShine {
  0%,
  40% {
    transform: translateX(-100%);
  }
  55%,
  100% {
    transform: translateX(100%);
  }
}

.draft-btn.is-busy {
  animation: draftBtnPulse 1.2s ease-in-out infinite;
}

@keyframes draftBtnPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.72;
  }
}

/* —— 版本卡片：未选中 / 选中（强对比 + 切换过渡） —— */
.draft-version-grid {
  /* 与父级 min-h-0 配合，避免 grid 子项被 min-height:auto 撑破导致底边被裁切 */
  min-height: 0;
}

.draft-card-scroll {
  -webkit-overflow-scrolling: touch;
}

.draft-schedule-x-scroll {
  -webkit-overflow-scrolling: touch;
}

.draft-version-card {
  z-index: 1;
  box-sizing: border-box;
  border-radius: 1rem;
  transition:
    transform 0.38s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.38s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.32s ease,
    filter 0.32s ease,
    background 0.32s ease;
}

/* 未选中：压低饱和度与对比，像「背景卡片」 */
.draft-version-card--idle {
  border: 1px solid rgba(120, 145, 132, 0.38);
  background: linear-gradient(
    168deg,
    rgba(248, 250, 249, 0.98) 0%,
    rgba(235, 241, 237, 0.94) 42%,
    rgba(242, 246, 243, 0.99) 100%
  );
  box-shadow:
    0 1px 2px rgba(20, 51, 39, 0.04),
    0 6px 20px -10px rgba(20, 51, 39, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.65);
  filter: saturate(0.9) brightness(0.99);
}

.draft-version-card--idle:hover {
  border-color: rgba(15, 139, 78, 0.42);
  filter: saturate(0.98) brightness(1);
  transform: translateY(-3px);
  box-shadow:
    0 2px 4px rgba(20, 51, 39, 0.05),
    0 14px 36px -12px rgba(20, 51, 39, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.85);
}

/* 选中：抬升、绿色光晕（不用 scale，避免绘制超出格子被父级 overflow 裁掉底边框） */
.draft-version-card--selected {
  z-index: 3;
  border: 2px solid #0f8b4e;
  background: linear-gradient(
    165deg,
    #ffffff 0%,
    rgba(236, 252, 244, 0.65) 38%,
    #ffffff 72%,
    rgba(245, 252, 248, 0.95) 100%
  );
  box-shadow:
    0 0 0 1px rgba(53, 205, 117, 0.22),
    0 4px 12px -2px rgba(15, 139, 78, 0.18),
    0 20px 48px -14px rgba(15, 139, 78, 0.32),
    0 32px 64px -24px rgba(18, 74, 49, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
  filter: saturate(1.05);
  transform: translateY(-3px);
}

.draft-card-head {
  border-bottom: 1px solid rgba(27, 111, 73, 0.12);
  transition:
    background 0.32s ease,
    border-color 0.32s ease;
}

.draft-version-card--idle .draft-card-head {
  background: linear-gradient(
    180deg,
    rgba(252, 252, 252, 0.95) 0%,
    rgba(236, 239, 237, 0.92) 100%
  );
  border-bottom-color: rgba(120, 145, 132, 0.22);
}

.draft-version-card--selected .draft-card-head {
  background: linear-gradient(
    155deg,
    rgba(255, 255, 255, 0.99) 0%,
    rgba(220, 248, 232, 0.55) 52%,
    rgba(255, 255, 255, 0.96) 100%
  );
  border-bottom-color: rgba(15, 139, 78, 0.2);
}

.draft-card-version-label {
  color: #1a2e24;
  transition: color 0.28s ease;
}

.draft-version-card--idle .draft-card-version-label {
  color: #4a5e54;
}

.draft-version-card--selected .draft-card-version-label {
  color: #0d3d24;
}

.draft-card-status-dot {
  display: inline-block;
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  flex-shrink: 0;
  transition:
    background 0.3s ease,
    box-shadow 0.3s ease,
    transform 0.3s ease;
}

.draft-card-status--off {
  background: rgba(240, 244, 242, 0.98);
  color: #5d7067;
  box-shadow: inset 0 0 0 1px rgba(120, 145, 132, 0.35);
}

.draft-card-status--off .draft-card-status-dot {
  background: #a8b8b0;
  box-shadow: 0 0 0 2px rgba(168, 184, 176, 0.25);
}

.draft-card-status--on {
  background: linear-gradient(
    135deg,
    rgba(207, 245, 223, 0.98),
    rgba(178, 235, 200, 0.95)
  );
  color: #045c2e;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    0 0 0 1px rgba(15, 139, 78, 0.28),
    0 4px 12px -4px rgba(15, 139, 78, 0.25);
}

.draft-card-status--on .draft-card-status-dot {
  background: linear-gradient(180deg, #35cd75, #0f8b4e);
  box-shadow: 0 0 0 2px rgba(53, 205, 117, 0.35);
  animation: draftStatusDotPulse 2s ease-in-out infinite;
}

@keyframes draftStatusDotPulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.12);
    opacity: 0.92;
  }
}

/* —— 主内容入场 / 版本卡片 —— */
@media (prefers-reduced-motion: no-preference) {
  .draft-main-enter {
    animation: draftMainIn 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .draft-version-card {
    animation: draftCardRise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .draft-empty {
    animation: draftMainIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .draft-mobile-card {
    animation: draftCardRise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
}

@keyframes draftMainIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes draftCardRise {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.draft-card-active::after {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: 1.08rem;
  pointer-events: none;
  box-shadow: 0 0 0 0 rgba(53, 205, 117, 0.35);
  animation: draftCardPulse 2.4s ease-out infinite;
}

@keyframes draftCardPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(53, 205, 117, 0.32);
  }
  70% {
    box-shadow: 0 0 0 16px rgba(53, 205, 117, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(53, 205, 117, 0);
  }
}

/* —— 加载 —— */
.draft-loading__rings {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
}

.draft-loading__rings span {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  background: linear-gradient(180deg, #35cd75, #0f8b4e);
  animation: draftDotBounce 0.9s ease-in-out infinite;
}

.draft-loading__rings span:nth-child(2) {
  animation-delay: 0.12s;
}

.draft-loading__rings span:nth-child(3) {
  animation-delay: 0.24s;
}

@keyframes draftDotBounce {
  0%,
  80%,
  100% {
    transform: scale(0.86);
    opacity: 0.55;
  }
  40% {
    transform: scale(1.15);
    opacity: 1;
  }
}

/* —— 版本说明 + Markdown —— */
.draft-requirement-sheet {
  border-radius: 0.85rem;
  border: 1px solid rgba(27, 111, 73, 0.12);
  background: linear-gradient(
    155deg,
    rgba(255, 255, 255, 0.96) 0%,
    rgba(241, 250, 245, 0.88) 100%
  );
  padding: 1rem 1.05rem;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 4px 20px -12px rgba(18, 74, 49, 0.18);
}

.draft-requirement-label {
  margin-bottom: 0.65rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #5f8a72;
}

/* 多版本并排：收起长说明，减轻单卡纵向滚动距离 */
.draft-requirement-body--clamped {
  max-height: 11rem;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, #000 50%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 50%, transparent 100%);
}

.draft-card-head:focus-visible {
  outline: 2px solid #0f8b4e;
  outline-offset: 2px;
}

.draft-md :deep(h1),
.draft-md :deep(h2),
.draft-md :deep(h3) {
  margin: 1rem 0 0.5rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  line-height: 1.25;
  color: #142820;
}

.draft-md :deep(h1) {
  font-size: 1.15rem;
}
.draft-md :deep(h2) {
  font-size: 1.05rem;
  color: #1a3d2e;
}
.draft-md :deep(h3) {
  font-size: 0.98rem;
  color: #234236;
}

.draft-md :deep(h1:first-child),
.draft-md :deep(h2:first-child),
.draft-md :deep(h3:first-child) {
  margin-top: 0;
}

.draft-md :deep(p) {
  margin: 0.5rem 0;
  font-size: 0.875rem;
  line-height: 1.65;
  color: #2a3832;
}

.draft-md :deep(ul),
.draft-md :deep(ol) {
  margin: 0.45rem 0 0.65rem;
  padding-left: 1.25rem;
}

.draft-md :deep(li) {
  margin: 0.25rem 0;
  font-size: 0.875rem;
  line-height: 1.55;
  color: #334a40;
}

.draft-md :deep(strong) {
  color: #0d5c36;
  font-weight: 800;
}

.draft-md :deep(code) {
  border-radius: 0.35rem;
  background: rgba(15, 139, 78, 0.08);
  padding: 0.1rem 0.35rem;
  font-size: 0.8em;
  font-weight: 600;
  color: #0b5c34;
}

.draft-md :deep(pre) {
  margin: 0.65rem 0;
  overflow-x: auto;
  border-radius: 0.65rem;
  border: 1px solid rgba(27, 111, 73, 0.12);
  background: rgba(248, 252, 250, 0.98);
  padding: 0.75rem 0.85rem;
  font-size: 0.8rem;
  line-height: 1.5;
}

.draft-md :deep(pre code) {
  padding: 0;
  background: none;
}

.draft-md :deep(blockquote) {
  margin: 0.65rem 0;
  border-left: 3px solid rgba(15, 139, 78, 0.45);
  padding-left: 0.85rem;
  color: #4a6358;
  font-style: italic;
}

.draft-md :deep(a) {
  color: #0f8b4e;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.draft-md :deep(hr) {
  margin: 1rem 0;
  border: none;
  border-top: 1px solid rgba(27, 111, 73, 0.15);
}

.draft-stage-title {
  font-size: 0.875rem;
  font-weight: 900;
  color: #203029;
  letter-spacing: -0.02em;
}

.draft-tag-new {
  border-radius: 999px;
  background: rgba(207, 245, 223, 0.95);
  padding: 0.15rem 0.5rem;
  font-size: 0.625rem;
  font-weight: 800;
  color: #06703d;
}

/* —— 弹层 —— */
.draft-modal-backdrop {
  background: rgba(10, 30, 22, 0.42);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: draftBackdropIn 0.22s ease-out both;
}

.draft-modal-panel {
  animation: draftModalIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes draftBackdropIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes draftModalIn {
  from {
    opacity: 0;
    transform: scale(0.94) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .draft-header-sheen,
  .draft-bg-orb,
  .draft-btn--primary::after,
  .draft-card-active::after,
  .draft-btn.is-busy,
  .draft-loading__rings span,
  .draft-main-enter,
  .draft-version-card,
  .draft-empty,
  .draft-mobile-card,
  .draft-modal-backdrop,
  .draft-modal-panel,
  .draft-card-status--on .draft-card-status-dot {
    animation: none !important;
  }

  .draft-btn:hover:not(:disabled),
  .draft-btn--ghost:hover:not(:disabled),
  .draft-version-card--idle:hover,
  .draft-version-card--selected {
    transform: none;
  }
}
</style>
