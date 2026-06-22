# General-RAG PRD Phase 1 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans.

**Goal:** 将现有 MVP 对齐 PRD 的架构分层、六大知识分类、标准元数据与工作台三栏首页。

**Architecture:** 集合 = 知识库实例，绑定 PRD 一级分类；文档 chunk 携带 10 项元数据子集；Node BFF 鉴权+转发；Python 加工入库+检索；Vue 工作台为默认入口。

**Tech Stack:** Vue 3, Express, FastAPI, Chroma

---

### Task 1: 领域常量与元数据 schema

**Files:**
- Create: `rag_node/src/domain/taxonomy.js`, `rag_node/src/domain/metadata.js`
- Create: `rag_python/rag/knowledge_metadata.py`
- Create: `rag_frontend/src/constants/knowledge-categories.ts`, `rag_frontend/src/types/knowledge.ts`

### Task 2: 集合 category + 入库元数据透传

**Files:**
- Modify: `rag_node/src/collections-admin.js`, `rag_node/src/permissions.js`, `rag_node/src/server.js`
- Modify: `rag_python/main.py`, `rag_python/rag/llm.py`, `rag_python/rag/store.py`

### Task 3: 工作台三栏与路由

**Files:**
- Create: `rag_frontend/src/views/WorkspaceView.vue`, `components/CategoryTree.vue`, `KnowledgeAside.vue`, `ChatPanel.vue`
- Modify: `rag_frontend/src/router/index.ts`, `layouts/AppLayout.vue`, `components/AppSidebar.vue`, `styles/ui.css`

### Task 4: 文档上传元数据表单

**Files:**
- Modify: `rag_frontend/src/views/DocumentView.vue`

### Task 5: 验证

- `rag_node`: `npm test`
- `rag_frontend`: `npm run build`
