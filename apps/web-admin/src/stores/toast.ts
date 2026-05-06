import { reactive } from 'vue';

type ToastKind = 'info' | 'success' | 'warn' | 'error';

export const toastState = reactive({
  open: false,
  kind: 'info' as ToastKind,
  message: '',
});

let timer: number | null = null;

export function showToast(message: string, kind: ToastKind = 'info', durationMs = 1800) {
  toastState.open = true;
  toastState.kind = kind;
  toastState.message = message;

  if (timer != null) {
    window.clearTimeout(timer);
    timer = null;
  }
  timer = window.setTimeout(() => {
    toastState.open = false;
  }, durationMs);
}

export function closeToast() {
  toastState.open = false;
}
