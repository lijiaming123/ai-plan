import { ref } from "vue";

/** 统一错误 Toast 状态（配合 UiErrorToast） */
export function useErrorToast() {
  const errorToastMessage = ref("");

  function showError(message: string) {
    errorToastMessage.value = message;
  }

  function clearError() {
    errorToastMessage.value = "";
  }

  return {
    errorToastMessage,
    showError,
    clearError,
  };
}
