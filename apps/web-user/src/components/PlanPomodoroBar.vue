<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    /** 用于展示上下文（计划标题） */
    title: string;
    /** 默认 25 分钟；测试可缩短 */
    workSeconds?: number;
    /** 默认 5 分钟；测试可缩短 */
    breakSeconds?: number;
  }>(),
  {
    workSeconds: 25 * 60,
    breakSeconds: 5 * 60,
  },
);

const WORK_SEC = computed(() => Math.max(1, props.workSeconds));
const BREAK_SEC = computed(() => Math.max(1, props.breakSeconds));

const expanded = ref(false);
/** idle：未开始或已完全结束；work：专注；break：短休 */
const phase = ref<"idle" | "work" | "break">("idle");
const remainingSec = ref(WORK_SEC.value);
const running = ref(false);
const doneHint = ref("");

let tick: ReturnType<typeof setInterval> | null = null;

const timeLabel = computed(() => {
  const s = Math.max(0, remainingSec.value);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
});

function stopTick() {
  if (tick) {
    clearInterval(tick);
    tick = null;
  }
}

function pause() {
  running.value = false;
  stopTick();
}

function resetAll() {
  pause();
  phase.value = "idle";
  remainingSec.value = WORK_SEC.value;
  doneHint.value = "";
}

function startWork() {
  doneHint.value = "";
  phase.value = "work";
  remainingSec.value = WORK_SEC.value;
  running.value = true;
  startTick();
}

function resume() {
  if (phase.value === "idle") return;
  running.value = true;
  startTick();
}

function startTick() {
  stopTick();
  tick = setInterval(() => {
    if (!running.value) return;
    if (remainingSec.value <= 0) return;

    remainingSec.value -= 1;
    if (remainingSec.value > 0) return;

    stopTick();
    if (phase.value === "work") {
      doneHint.value = "本轮专注已完成，进入短休。";
      phase.value = "break";
      remainingSec.value = BREAK_SEC.value;
      running.value = true;
      startTick();
      return;
    }
    if (phase.value === "break") {
      phase.value = "idle";
      remainingSec.value = WORK_SEC.value;
      running.value = false;
      doneHint.value = "短休结束。需要时随时再开始一轮专注。";
      window.setTimeout(() => {
        doneHint.value = "";
      }, 4500);
    }
  }, 1000);
}

function toggleExpanded() {
  expanded.value = !expanded.value;
}

function scrollToSchedule() {
  document
    .querySelector('[data-testid="plan-schedule-panel"]')
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

watch(
  () => props.title,
  () => {
    resetAll();
    expanded.value = false;
  },
);

watch(
  () => [props.workSeconds, props.breakSeconds],
  () => {
    resetAll();
  },
);

onBeforeUnmount(() => {
  pause();
});
</script>

<template>
  <div
    class="mt-5 border-t border-slate-100 pt-4"
    data-testid="plan-pomodoro-root"
  >
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-[#f6faf7] px-3 py-2.5 text-left text-sm font-semibold text-[#203029] transition hover:bg-[#eef5f0]"
      data-testid="plan-pomodoro-toggle"
      :aria-expanded="expanded"
      @click="toggleExpanded"
    >
      <span class="inline-flex min-w-0 items-center gap-2">
        <span class="material-symbols-outlined shrink-0 text-[#0a8f4a]" aria-hidden="true"
          >timer</span
        >
        <span class="min-w-0 truncate">专注番茄</span>
      </span>
      <span class="shrink-0 tabular-nums text-[#5a6f62]">{{ timeLabel }}</span>
    </button>

    <div
      v-show="expanded"
      class="mt-3 rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm"
      data-testid="plan-pomodoro-panel"
    >
      <p class="text-xs leading-relaxed text-[#61896f]">
        轻量计时：默认 25 分钟专注 + 5 分钟短休。离开本页会自动停止计时（不记录历史）。
      </p>
      <p
        v-if="props.title.trim()"
        class="mt-2 truncate text-sm font-semibold text-[#111813]"
        :title="props.title"
      >
        {{ props.title }}
      </p>

      <div
        class="mt-3 flex flex-wrap items-center justify-between gap-3"
        aria-live="polite"
      >
        <div class="text-3xl font-black tabular-nums tracking-tight text-[#0f1f16]">
          {{ timeLabel }}
        </div>
        <span
          class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200/80"
          data-testid="plan-pomodoro-phase"
        >
          <template v-if="phase === 'idle'">就绪</template>
          <template v-else-if="phase === 'work'">专注中</template>
          <template v-else>短休中</template>
        </span>
      </div>

      <p v-if="doneHint" class="mt-2 text-xs font-medium text-emerald-800">
        {{ doneHint }}
      </p>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          v-if="phase === 'idle'"
          type="button"
          class="inline-flex items-center gap-1 rounded-lg bg-[#0a8f4a] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#088a42]"
          data-testid="plan-pomodoro-start"
          @click="startWork"
        >
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">play_arrow</span>
          开始专注
        </button>
        <template v-else>
          <button
            v-if="running"
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#111813] transition hover:bg-slate-50"
            data-testid="plan-pomodoro-pause"
            @click="pause"
          >
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">pause</span>
            暂停
          </button>
          <button
            v-else
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#111813] transition hover:bg-slate-50"
            data-testid="plan-pomodoro-resume"
            @click="resume"
          >
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">play_arrow</span>
            继续
          </button>
        </template>
        <button
          v-if="phase !== 'idle'"
          type="button"
          class="inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold text-[#61896f] transition hover:bg-slate-50"
          data-testid="plan-pomodoro-reset"
          @click="resetAll"
        >
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">restart_alt</span>
          结束并重置
        </button>
      </div>

      <div class="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <button
          type="button"
          class="text-xs font-semibold text-[#0a8f4a] underline underline-offset-2 hover:text-[#088a42]"
          data-testid="plan-pomodoro-goto-checkin"
          @click="scrollToSchedule"
        >
          跳到打卡计划
        </button>
      </div>
    </div>
  </div>
</template>
