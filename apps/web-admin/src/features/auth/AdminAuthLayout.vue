<template>
  <div class="auth-brand-root">
    <section class="auth-brand-visual" aria-hidden="true">
      <div class="auth-brand-mark">AI PLAN <span>ADMIN</span></div>
      <div class="auth-brand-panel">
        <p class="auth-brand-kicker">Internal console</p>
        <h1 class="auth-brand-title">清晰、克制、够用的管理后台</h1>
        <p class="auth-brand-lede">
          登录后查看运营总览、增长分析、用户管理和权限矩阵。界面保持轻量，把注意力留给数据和操作本身。
        </p>
        <ul class="auth-brand-points">
          <li>一处查看核心数据</li>
          <li>一眼识别账号权限</li>
          <li>更适合日常高频使用</li>
        </ul>
      </div>
    </section>

    <div class="auth-panel">
      <div class="auth-card">
        <slot />
      </div>
    </div>
  </div>
</template>
