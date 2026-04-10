---
name: stitch-to-vue3
description: 将 Stitch 设计稿一键转换成高质量、可直接运行的 Vue3 组件，使用 <script setup>、Tailwind CSS、Typescript符合 Cursor 工程规范，保持设计还原度与可维护性。
isSkill: true
---

# Stitch to Vue3 组件转换（Cursor 专用）

## 触发条件

用户输入包含以下任意内容时自动启用：

- stitch 转 vue3
- 把stitch 设计稿转代码
- 把 stitch 转 vue 组件
- convert stitch to vue3
- 导出 stitch 为 vue3

## 核心能力

1. 解析 Stitch 导出的结构、图层、样式、布局、间距
2. 自动生成 **Vue 3 <script setup> 单文件组件**
3. 样式输出：**Tailwind CSS v3**
4. 1:1 还原设计稿：排版、颜色、间距、圆角、层级
5. 自动识别：按钮、输入框、卡片、容器、图片、文字、图标
6. 自动处理响应式布局
7. 自动提取可复用变量、避免硬编码
8. 自动优化结构，减少多余 div 嵌套

## 输出格式（强制执行）

```vue
<script setup>
// 业务逻辑、props、事件、状态
// 简洁、无冗余
</script>

<template>
  <!-- 语义化结构，严格按 Stitch 图层 -->
</template>

<style scoped>
/* 仅在 Tailwind 无法实现时使用 */
</style>
```
