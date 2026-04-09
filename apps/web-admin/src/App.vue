<template>
  <div class="app-shell">
    <div class="bg-orb orb-a" />
    <div class="bg-orb orb-b" />
    <main class="page-shell">
      <nav class="top-nav">
        <div class="brand">AI PLAN <span class="brand-mark">ADMIN</span></div>
        <div class="nav-links">
          <router-link class="nav-link" to="/admin/dashboard">总览</router-link>
          <router-link class="nav-link" to="/admin/rules">规则</router-link>
          <router-link class="nav-link" to="/admin/submissions">提交</router-link>
        </div>
      </nav>
      <router-view />
    </main>
  </div>
</template>
