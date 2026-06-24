import { onUnmounted, ref } from "vue";

/** OTP 发送冷却倒计时 */
export function useOtpCooldown(defaultSeconds = 60) {
  const cooldownLeft = ref(0);
  let timer: number | null = null;

  function startCooldown(seconds: number = defaultSeconds) {
    cooldownLeft.value = Math.max(0, Math.floor(seconds));
    if (timer != null) window.clearInterval(timer);
    timer = window.setInterval(() => {
      cooldownLeft.value = Math.max(0, cooldownLeft.value - 1);
      if (cooldownLeft.value <= 0 && timer != null) {
        window.clearInterval(timer);
        timer = null;
      }
    }, 1000);
  }

  onUnmounted(() => {
    if (timer != null) window.clearInterval(timer);
    timer = null;
  });

  return { cooldownLeft, startCooldown };
}
