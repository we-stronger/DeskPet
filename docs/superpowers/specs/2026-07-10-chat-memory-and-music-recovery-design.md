# DeskPet Chat Memory And Music Recovery Design

## Goal

为桌宠增加两类稳定能力：

1. 桌宠在听音乐时被拖拽等临时动作打断后，如果音频仍在播放，应恢复到听音乐动作。
2. 聊天从“单次无状态调用”升级为“默认有记忆、可持久化、可压缩、可切换到临时对话”的本地记忆系统。

## Current State

### 音乐动作

- `src/renderer/renderer.js` 中，`music:listen` 会直接触发 `play("music")`。
- 拖拽结束后，`pointerup` 分支会直接回到 `play("idle")`。
- `playTemporary()` 的超时结束也会直接回到 `play("idle")`。
- 当前恢复逻辑不感知本地音频是否仍在播放，因此听歌动作会被拖拽或临时动作覆盖。

### 聊天

- `src/renderer/chat.js` 在窗口内维护 `history` 数组。
- `history` 只存在 renderer 内存中，窗口关闭即丢失。
- `src/main.js` 的 `llm:chat` 只是把传入的 `messages` 直接转发给 `src/llm-client.js`。
- 没有短期记忆、长期记忆、摘要压缩、临时模式或持久化存储。

## Non-Goals

- 不引入向量数据库、embedding、RAG 服务或外部记忆基础设施。
- 不实现多角色人格系统或复杂关系图谱。
- 不在这轮实现“逐条编辑长期记忆”的重型记忆管理界面。
- 不改变现有 LLM 提供方与主聊天 API 契约。

## User-Facing Behavior

### 1. 音乐动作恢复

- 当桌宠处于本地音频播放状态时，拖拽开始可以进入 `drag` 动作。
- 拖拽结束后，如果播放器仍在播放，桌宠恢复 `music` 动作。
- 其他会暂时打断动作的短时视觉反馈结束后，也应优先恢复 `music`，而不是无条件回到 `idle`。
- 如果音乐已暂停或停止，则按原有规则恢复 `sleep` 或 `idle`。

### 2. 记忆对话模式

- 聊天窗口默认进入“记忆对话”。
- 记忆对话会：
  - 读取持久化的长期记忆；
  - 读取最近保留的短期原始对话；
  - 在达到阈值时压缩较早上下文；
  - 把新的对话和记忆变化持久化到本地。

### 3. 临时对话模式

- 聊天窗口可切换为“临时对话”。
- 临时对话会：
  - 保留本窗口内的多轮上下文；
  - 不读取持久化长期记忆；
  - 不写入持久化短期历史；
  - 不更新长期记忆；
  - 关闭窗口后完全丢弃。

### 4. 基础记忆管理

- 用户可以看到当前模式是“记忆对话”还是“临时对话”。
- 用户可以清空当前临时会话。
- 用户可以清空持久化聊天记忆。
- 用户可以仅清空短期历史而保留长期记忆。

## Architecture

采用“本地 JSON 持久化 + 显式短期/长期分层 + 阈值压缩”的实现。

### Main Process Responsibilities

- 持有聊天记忆存储实例。
- 暴露 IPC：
  - 读取聊天状态
  - 发送聊天消息
  - 切换聊天模式
  - 清空短期历史
  - 清空全部记忆
  - 读取长期记忆摘要
- 在记忆模式下负责：
  - 构造发给 LLM 的上下文
  - 保存原始消息
  - 判断是否触发压缩
  - 执行压缩并写回存储

### Renderer Responsibilities

- `chat.js` 不再自行维护权威历史，只维护窗口态 UI 状态。
- 通过 preload bridge 调 main process 获取：
  - 当前模式
  - 当前可见对话
  - 持久化摘要状态
- 临时模式的窗口内会话仍由 renderer 内存维护，因为其生命周期被定义为“直到窗口关闭”。

### Storage Layer

新增独立记忆存储模块，风格对齐现有 `pet-settings-store.js`、`music-playback-store.js`。

建议文件：

- `src/chat/chat-memory-store.js`
- `src/chat/chat-memory-controller.js`

持久化文件建议放在：

- `app.getPath("userData")/chat-memory-state.json`

## Data Model

```json
{
  "version": 1,
  "profile": {
    "displayName": "",
    "relationshipTone": "",
    "preferences": [],
    "facts": [],
    "avoidances": []
  },
  "summary": {
    "conversation": "",
    "updatedAt": ""
  },
  "recentMessages": [
    {
      "role": "user",
      "content": "",
      "createdAt": ""
    },
    {
      "role": "assistant",
      "content": "",
      "createdAt": ""
    }
  ],
  "stats": {
    "compressCount": 0,
    "lastCompressedAt": ""
  }
}
```

### Field Semantics

- `profile`
  - 长期记忆，表示稳定事实与偏好。
  - 使用结构化字段，避免全部混在一段自然语言里。
- `summary.conversation`
  - 历史压缩摘要，记录较早对话的重要背景。
- `recentMessages`
  - 当前保留的原始近期对话。
  - 只保存最近窗口的高价值原文，不无限增长。
- `stats`
  - 仅用于调试、测试和后续 UI 展示。

## Context Construction

记忆模式下，发给 LLM 的消息顺序为：

1. 基础系统提示词：来自现有设置里的 `llm.systemPrompt`
2. 记忆系统附加系统消息：
   - 关系语气
   - 长期事实
   - 偏好与禁忌
   - 历史摘要
3. `recentMessages`
4. 当前用户消息

临时模式下，发给 LLM 的消息顺序为：

1. 基础系统提示词
2. 当前窗口的临时历史
3. 当前用户消息

临时模式不注入持久化长期记忆，也不写回压缩结果。

## Compression Strategy

### Trigger

当满足以下任一条件时触发压缩：

- `recentMessages` 超过轮次阈值；
- `recentMessages` 的总字符数超过阈值。

阈值不写死在 renderer，统一由 main process 记忆控制层管理，便于测试。

### Compression Output

压缩函数输出两部分：

1. 更新后的 `summary.conversation`
2. 更新后的 `profile` 条目

### Compression Source Window

- 只压缩“较早的一段消息”。
- 始终保留最近若干轮原文不压缩，保证模型仍能看到最新互动细节。

### Compression Execution

优先使用现有 LLM 做摘要与长期记忆抽取：

- 输入：待压缩的旧消息块 + 当前已有摘要 + 当前已有长期记忆
- 输出：新的摘要和记忆字段

### Failure Fallback

如果 LLM 压缩失败：

- 不中断当前聊天主流程；
- 使用规则兜底：
  - 截断保留最近若干条原文；
  - 将被压缩段落按时间顺序拼成简化摘要；
  - 不更新结构化长期记忆，或只做最小更新。

## Music Action Recovery Design

新增统一恢复入口，而不是在各处直接写 `play("idle")`。

恢复优先级：

1. 如果本地音频播放器当前处于播放中，恢复 `music`
2. 否则如果宠物处于睡眠状态，恢复 `sleep`
3. 否则恢复 `idle`

触发点：

- 拖拽结束
- 临时视觉动作结束
- 其他当前已知会强制回 `idle` 的短时反馈结束点

这样可以把“动作恢复”从具体事件中抽离出来，避免后续继续出现“某处忘记恢复音乐动作”的重复 bug。

## UI Design

### Chat Window Additions

- 模式切换控件：
  - `记忆对话`
  - `临时对话`
- 状态标签：
  - 当前模式说明
  - 记忆模式下显示“会保存并持续记住”
  - 临时模式下显示“仅本窗口有效，关闭后清空”
- 操作入口：
  - 清空当前临时会话
  - 清空短期历史
  - 清空全部记忆
  - 查看长期记忆摘要

### UX Constraints

- 切换到临时模式时，不自动抹掉当前持久化记忆。
- 临时模式的窗口内历史单独管理，避免和持久历史混杂。
- 从临时模式切回记忆模式后，重新拉取持久化上下文。

## Error Handling

- 记忆文件不存在：自动初始化默认状态。
- 记忆文件损坏：回退默认状态，不让聊天窗口崩溃。
- 持久化失败：当前回复仍可展示，但 UI 给出“记忆保存失败”的状态提示。
- 压缩失败：聊天继续，采用摘要兜底或仅保留最近原文。
- 模式切换失败：保留当前模式并提示失败。

## Testing Strategy

### Unit Tests

- `chat-memory-store`
  - 默认状态加载
  - 损坏文件回退
  - 原子写入
  - 数据规范化
- `chat-memory-controller`
  - 记忆模式上下文构造
  - 临时模式上下文构造
  - 达阈值触发压缩
  - 压缩失败兜底
  - 清空短期历史 / 全部记忆
- `renderer` 动作恢复
  - 拖拽结束时播放中恢复 `music`
  - 未播放时恢复 `idle`
  - 睡眠状态恢复 `sleep`

### Renderer/UI Tests

- 聊天窗口模式切换控件存在
- 临时模式说明文案存在
- 记忆管理按钮存在
- 模式切换后调用正确 bridge 方法

## File Plan

预计新增或修改这些文件：

- Create: `src/chat/chat-memory-store.js`
- Create: `src/chat/chat-memory-controller.js`
- Modify: `src/main.js`
- Modify: `src/preload.js`
- Modify: `src/renderer/chat.js`
- Modify: `src/renderer/chat.html`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/renderer.js`
- Modify: `src/pet-settings-store.js` if mode preference needs persistence
- Create: `test/chat-memory-store.test.js`
- Create: `test/chat-memory-controller.test.js`
- Modify: existing chat and renderer tests as needed

## Open Decisions Resolved

- 默认模式：记忆对话
- 临时模式：保留本窗口内历史，关闭窗口后丢弃
- 记忆范围：尽量保留大部分聊天内容，但在超长时压缩；稳定事实单独进入长期记忆

## Self-Review

- 无占位符。
- 需求范围聚焦在“动作恢复 + 聊天记忆 + 临时模式”，没有扩展到向量检索或人格系统。
- 数据流、UI 行为、压缩失败回退和测试范围彼此一致。
