<script setup lang="ts">
type ActionKey = "edit" | "restore" | "withdrawAppeal";

type Action = {
  key: ActionKey;
  label: string;
  testid?: string;
  danger?: boolean;
  disabled?: boolean;
};

const props = defineProps<{
  actions: Action[];
}>();

const emit = defineEmits<{
  (e: "action", key: ActionKey): void;
}>();

function onClick(key: ActionKey) {
  emit("action", key);
}
</script>

<template>
  <ElDropdown
    trigger="click"
    placement="bottom-end"
    popper-class="ui-more-dropdown-popper"
  >
    <button
      type="button"
      class="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-[#dbe6df] bg-white px-2.5 py-1 text-xs font-semibold text-[#111813] shadow-[0_1px_0_rgba(255,255,255,0.9)] transition hover:bg-[#f6f8f6] disabled:opacity-50"
      data-testid="schedule-slot-more"
    >
      更多
      <span class="material-symbols-outlined text-[16px]" aria-hidden="true"
        >expand_more</span
      >
    </button>
    <template #dropdown>
      <ElDropdownMenu class="ui-more-dropdown-menu">
        <ElDropdownItem
          v-for="a in props.actions"
          :key="a.key"
          :disabled="!!a.disabled"
          :data-testid="a.testid"
          :class="a.danger ? 'ui-more-dropdown-danger' : ''"
          @click="onClick(a.key)"
        >
          <span class="text-xs font-semibold">{{ a.label }}</span>
        </ElDropdownItem>
      </ElDropdownMenu>
    </template>
  </ElDropdown>
</template>

<style>
.ui-more-dropdown-popper.el-popper {
  border-radius: 14px;
  border: 1px solid rgba(214, 229, 220, 0.95);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 247, 0.96));
  box-shadow: 0 18px 44px -28px rgba(12, 72, 48, 0.32);
  backdrop-filter: blur(8px);
  padding: 6px;
}
.ui-more-dropdown-popper .el-popper__arrow::before {
  border: 1px solid rgba(214, 229, 220, 0.95);
  background: rgba(255, 255, 255, 0.98);
}
.ui-more-dropdown-menu {
  border: 0;
  padding: 2px;
}
.ui-more-dropdown-menu .el-dropdown-menu__item {
  border-radius: 10px;
  padding: 9px 10px;
  color: #111813;
}
.ui-more-dropdown-menu .el-dropdown-menu__item:not(.is-disabled):hover {
  background: rgba(246, 248, 246, 0.95);
}
.ui-more-dropdown-menu .ui-more-dropdown-danger {
  color: #7b2f28;
}
.ui-more-dropdown-menu .ui-more-dropdown-danger:not(.is-disabled):hover {
  background: rgba(255, 247, 246, 0.92);
}
</style>

