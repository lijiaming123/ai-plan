<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { LegalSection } from './legal-content';
import {
  getLegalEffectiveDate,
  getLegalOperatorAddress,
  getLegalOperatorName,
  getSupportEmail,
  LEGAL_PRODUCT_NAME,
  LEGAL_ROUTES,
} from '../../lib/legal-meta';

const props = defineProps<{
  title: string;
  sections: LegalSection[];
  /** 页内锚点 id 前缀，用于 aria */
  docId: string;
}>();

const operatorName = computed(() => getLegalOperatorName());
const operatorAddress = computed(() => getLegalOperatorAddress());
const supportEmail = computed(() => getSupportEmail());
const effectiveDate = computed(() => getLegalEffectiveDate());

function contactBlock(section: LegalSection): boolean {
  return section.id === 'contact';
}
</script>

<template>
  <div
    class="legal-doc-root relative flex min-h-screen w-full flex-col bg-[#f6f8f6] font-plan text-stone-800"
  >
    <header
      class="sticky top-0 z-10 border-b border-emerald-900/10 bg-white/90 backdrop-blur-md"
    >
      <div
        class="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4"
      >
        <RouterLink
          to="/auth/login"
          class="inline-flex items-center gap-1.5 text-sm font-semibold text-[#61896f] transition hover:text-[#0a8f4a]"
        >
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true"
            >arrow_back</span
          >
          返回登录
        </RouterLink>
        <nav class="flex items-center gap-4 text-sm">
          <RouterLink
            :to="LEGAL_ROUTES.privacy"
            class="font-medium text-stone-600 transition hover:text-[#0a8f4a]"
            :class="{ 'font-bold text-[#0a8f4a]': docId === 'privacy' }"
          >
            隐私政策
          </RouterLink>
          <RouterLink
            :to="LEGAL_ROUTES.terms"
            class="font-medium text-stone-600 transition hover:text-[#0a8f4a]"
            :class="{ 'font-bold text-[#0a8f4a]': docId === 'terms' }"
          >
            用户协议
          </RouterLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
      <div
        class="rounded-2xl border border-[#dbe6df] bg-white p-8 shadow-sm md:p-10"
      >
        <p class="text-sm font-medium text-[#61896f]">{{ LEGAL_PRODUCT_NAME }}</p>
        <h1
          class="mt-2 text-2xl font-extrabold tracking-tight text-stone-900 md:text-3xl"
          :data-testid="`${docId}-title`"
        >
          {{ title }}
        </h1>
        <p class="mt-3 text-sm leading-relaxed text-stone-500">
          运营主体：{{ operatorName }}
          <template v-if="operatorAddress"> · {{ operatorAddress }}</template>
          <br />
          生效日期：{{ effectiveDate }}
        </p>

        <article class="mt-10 space-y-10">
          <section
            v-for="section in sections"
            :id="`${docId}-${section.id}`"
            :key="section.id"
            class="scroll-mt-24"
          >
            <h2 class="text-lg font-bold text-stone-900">{{ section.title }}</h2>
            <div class="mt-3 space-y-3 text-sm leading-relaxed text-stone-600">
              <p v-for="(para, i) in section.paragraphs" :key="i">{{ para }}</p>
              <ul
                v-if="section.bullets?.length"
                class="list-disc space-y-2 pl-5"
              >
                <li v-for="(item, j) in section.bullets" :key="j">{{ item }}</li>
              </ul>
              <div
                v-if="contactBlock(section)"
                class="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-stone-700"
                :data-testid="`${docId}-contact`"
              >
                <p>
                  电子邮箱：
                  <a
                    :href="`mailto:${supportEmail}`"
                    class="font-semibold text-[#0a8f4a] underline decoration-emerald-300 underline-offset-2"
                    >{{ supportEmail }}</a
                  >
                </p>
                <p class="mt-2 text-xs text-stone-500">
                  我们将在收到您的请求后尽快答复。涉及账号注销、个人信息查询或投诉的，请说明注册手机号与具体问题。
                </p>
              </div>
            </div>
          </section>
        </article>

        <footer
          class="mt-12 border-t border-stone-100 pt-6 text-center text-xs text-stone-400"
        >
          <p>© {{ new Date().getFullYear() }} {{ LEGAL_PRODUCT_NAME }}. All Rights Reserved.</p>
          <p class="mt-2">
            查阅
            <RouterLink
              :to="LEGAL_ROUTES.privacy"
              class="text-[#61896f] underline underline-offset-2"
              >隐私政策</RouterLink
            >
            ·
            <RouterLink
              :to="LEGAL_ROUTES.terms"
              class="text-[#61896f] underline underline-offset-2"
              >用户协议</RouterLink
            >
          </p>
        </footer>
      </div>
    </main>
  </div>
</template>
