<template>
  <div class="auth-brand-root">
    <div class="auth-brand-visual" aria-hidden="true">
      <div class="auth-brand-mark">AI PLAN <span>ADMIN</span></div>
      <div>
        <p class="auth-brand-kicker">Internal console</p>
        <h1 class="auth-brand-title">把增长与治理<br /><em>收进同一间档案室</em></h1>
        <p class="auth-brand-lede">
          登录后访问总览、Telemetry 分析与用户画像。自助注册仅在演示环境开放，且与权限包绑定——生产环境请走管理员开通。
        </p>
      </div>
    </div>
    <div class="auth-panel">
      <div class="auth-card">
        <slot />
      </div>
    </div>
  </div>
</template>
