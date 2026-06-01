import { ref } from "vue";
import { getApiClient } from "../lib/api-client";

/** 短信 OTP 发送前的图形验证码：拉取 SVG 与刷新 */
export function useAuthCaptcha() {
  const captchaId = ref("");
  const imageDataUrl = ref("");
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function refresh(): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      const r = await getApiClient().getCaptcha();
      captchaId.value = r.captchaId;
      imageDataUrl.value =
        "data:image/svg+xml;charset=utf-8," + encodeURIComponent(r.imageSvg);
      return true;
    } catch (e) {
      // 在某些页面（如静态拼接页）会预加载该 composable；拉取失败不应导致未处理异常中断测试或页面
      captchaId.value = "";
      imageDataUrl.value = "";
      error.value = e instanceof Error ? e.message : "captcha refresh failed";
      return false;
    } finally {
      loading.value = false;
    }
  }

  function clear() {
    captchaId.value = "";
    imageDataUrl.value = "";
    error.value = null;
  }

  return { captchaId, imageDataUrl, loading, error, refresh, clear };
}
