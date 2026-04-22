import { onScopeDispose, watch, type Ref } from "vue";

/**
 * 弹窗打开时监听 Escape，调用 onClose。
 * 使用 window + 冒泡阶段，便于 Element Plus 等 Teleport 层先处理 Esc（如关闭下拉）。
 */
export function useCloseOnEscape(open: Ref<boolean>, onClose: () => void): void {
  const handler = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape") return;
    if (!open.value) return;
    onClose();
  };

  watch(
    open,
    (isOpen) => {
      if (!isOpen) {
        window.removeEventListener("keydown", handler);
        return;
      }
      window.addEventListener("keydown", handler);
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    window.removeEventListener("keydown", handler);
  });
}
