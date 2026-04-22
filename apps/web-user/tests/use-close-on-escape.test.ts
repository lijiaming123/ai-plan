import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { useCloseOnEscape } from "../src/composables/useCloseOnEscape";

describe("useCloseOnEscape", () => {
  it("Escape 时调用 onClose，关闭后移除监听", async () => {
    const open = ref(false);
    let closes = 0;
    const Comp = defineComponent({
      setup() {
        useCloseOnEscape(open, () => {
          closes += 1;
          open.value = false;
        });
        return () => h("div");
      },
    });
    mount(Comp);
    open.value = true;
    await nextTick();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(closes).toBe(1);
    expect(open.value).toBe(false);
    const before = closes;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(closes).toBe(before);
  });
});
