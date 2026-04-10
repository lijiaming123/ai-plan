---
name: vue3-element-plus
description: 专业使用 Vue3 + <script setup> + Element Plus 开发组件、表单、表格、弹窗、页面，遵循最佳实践、类型安全、优雅结构、可维护性。
isSkill: true
---

# Vue3 + Element Plus 开发规范（Cursor 专用）

## 触发关键词

element-plus, el组件, vue3 element, 表单, 表格, 弹窗, 上传, 分页, 搜索页, 管理后台

## 核心规则（强制执行）

- 使用 **Vue3 <script setup>**
- 使用 **TypeScript**（优先）
- 组件按需使用，不冗余
- 结构：template → script → style
- 遵循 Element Plus 官方最佳实践
- 表单：校验、重置、提交完整
- 表格：数据、分页、选择、操作列完整
- 弹窗：关闭、确认、销毁逻辑正确
- 样式使用 scoped，不污染全局

## 标准组件结构

```vue
<template>
  <!-- 业务布局 -->
  <div class="page-container">
    <!-- El Components -->
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";

// 变量
const formRef = ref();
const formData = reactive({});
const tableData = ref([]);

// 方法
function submit() {}
function reset() {}
</script>

<style scoped>
/* 局部样式 */
</style>
```
