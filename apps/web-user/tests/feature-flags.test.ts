import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../src/router';
import { clearAuthToken, setAuthToken } from '../src/stores/auth';
import {
  isTemplatesFeatureEnabled,
  showEmbeddedPresetExamples,
} from '../src/lib/feature-flags';

describe('feature-flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('默认测试环境应开启模板功能（便于模板域单测）', () => {
    expect(isTemplatesFeatureEnabled()).toBe(true);
    expect(showEmbeddedPresetExamples()).toBe(false);
  });

  it('VITE_FEATURE_TEMPLATES=false 时应关闭模板并展示内嵌预设', () => {
    vi.stubEnv('VITE_FEATURE_TEMPLATES', 'false');
    expect(isTemplatesFeatureEnabled()).toBe(false);
    expect(showEmbeddedPresetExamples()).toBe(true);
  });
});

describe('templates 路由（MVP 关闭时）', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearAuthToken();
  });

  it('/templates 应重定向到 /plans/new', async () => {
    vi.stubEnv('VITE_FEATURE_TEMPLATES', 'false');
    setAuthToken('token_mvp');
    const router = createAppRouter(createMemoryHistory());
    await router.push('/templates');
    await router.isReady();
    expect(router.currentRoute.value.path).toBe('/plans/new');
  });
});
