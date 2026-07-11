# DeskPet Bubble And Clock Widget Design

## Goal

本次改动只处理两件事：

1. 统一桌宠状态气泡的位置和样式，包括点击反馈、专注反馈、音乐反馈、聊天回复等现有普通气泡。
2. 为右侧日期时间块增加显示/隐藏能力，并将该开关持久化。

## Current State

### 气泡

- `src/renderer/renderer.js` 当前只维护一个 `#mood-bubble`。
- 这个气泡同时承担普通状态反馈和聊天回复展示。
- 气泡位置由 `syncWidgetPositions()` 结合 `widget-anchor.js` 计算，当前默认更偏向角色正上方。
- `src/renderer/styles.css` 中 `.mood-bubble::after` 的尖角在底部中间，视觉上也服务于“上方提示气泡”。

### 日期时间块

- 右侧日期时间块对应 `#clock`，样式类为 `.clock-widget`。
- `renderer.js` 已有 `clockEnabled` 运行态变量和 `clock-enabled-input` 控件，当前逻辑是主界面内切换。
- 该能力需要明确保留为用户可感知的“显示/隐藏”设置，并继续走持久化设置。

## User-Facing Behavior

### 1. 统一状态气泡

- 所有现有普通状态气泡统一出现在角色右上角。
- 气泡与角色保持固定的视觉关系：不压脸、不离得过远，且会随角色显示尺寸变化自动调整。
- 长文本优先向右侧展开，减少遮挡角色本体。
- 气泡改为明确的对话气泡视觉，带尖角，尖角朝向角色。

### 2. 日期时间块显示/隐藏

- 用户可以显式关闭或重新打开日期时间块。
- 关闭后组件立即隐藏，不再参与界面展示。
- 重新打开后恢复现有时间刷新和拖拽行为。
- 开关状态随设置持久化，下次启动继续生效。

## Non-Goals

- 不修改歌词框、音乐状态条、音乐面板布局。
- 不修改专注计时小组件 `focus-indicator` 的功能定义。
- 不新增新的气泡类型或新的通知系统。
- 不调整桌宠主窗口尺寸策略。

## Approaches

### Approach A: 继续复用 `#mood-bubble`，只改定位和样式

优点：

- 改动面最小。
- 不需要改 IPC 或命令分发。

缺点：

- 普通状态气泡和聊天回复继续强耦合。
- 后续若要区分聊天气泡和普通反馈气泡的视觉层级，会继续受限。
- 现有 `widget-anchor` 逻辑会被塞进更多“例外规则”。

### Approach B: 保留一个气泡节点，但引入统一的“右上角气泡”定位模型

优点：

- 仍然不增加新的 DOM 节点。
- 可以把当前“顶部提示气泡”模型整体替换为“右上角气泡”模型。

缺点：

- 所有气泡共享一套视觉和行为，后续扩展空间一般。
- 需要重写 `syncWidgetPositions()` 对 bubble 的锚点计算。

### Approach C: 抽象出状态气泡布局层，但这一轮只保留一个可见气泡实例

优点：

- 把“气泡显示内容”和“气泡布局策略”分离，后续更干净。
- 当前功能上仍只显示一个气泡，不改变用户交互模型。
- 为以后区分聊天气泡和状态气泡保留演进空间。

缺点：

- 比直接改 CSS 多一层结构调整。

### Recommendation

采用 Approach C。

原因很直接：这轮用户要求已经从“只改聊天回复气泡”扩大到“所有普通状态气泡统一改位”，继续把布局逻辑散落在 `renderer.js` 和 CSS 里，只会让后续维护更难。抽出一个很薄的气泡布局层，成本不高，但能把这次改动做稳。

## Design

### Bubble Layout Model

- 保留当前单实例气泡展示模型，即任意时刻仍只显示一个状态气泡。
- 将“气泡内容控制”与“气泡位置计算”分开：
  - 内容控制仍由现有 `showMoodBubble()`、`showCustomBubble()` 一类调用负责。
  - 位置计算统一走新的“角色右上角气泡锚点”逻辑。
- 锚点不再依赖“角色上方透明边距”，而是基于桌宠实际渲染区域的可视边界计算。

### Bubble Anchor Rules

- 水平方向：
  - 锚点落在角色可视区域右边缘外侧的一个小偏移量上。
  - 偏移量按当前角色显示宽度做比例缩放，并设置最小值与最大值，避免小尺寸过近或大尺寸过远。
- 垂直方向：
  - 锚点落在角色可视区域上边缘稍下方，使气泡靠近头部右上角而不是完全飘在头顶。
  - 同样采用比例缩放并做上下限约束。
- 边界处理：
  - 若计算后超出舞台右边界，则向左回收。
  - 若超出顶部边界，则向下回收。
- 结果要求：
  - 在常见桌面边缘位置下，气泡尽量保持完整可见。
  - 不与角色本体重叠到影响识别。

### Bubble Visual Style

- `.mood-bubble` 改成右上角对话气泡样式：
  - 更明确的圆角和阴影。
  - 尖角移动到左下侧或左侧偏下，指向角色。
  - 文本采用更稳定的换行与最大宽度控制。
- 保持现有玻璃质感主题，不另外引入新的色彩体系。
- 由于所有普通状态气泡都共用这个样式，本轮不区分“聊天风格”和“系统提示风格”。

### Clock Toggle Design

- 继续使用 `clockEnabled` 作为日期时间块的开关语义。
- 将其明确视作“日期时间块显示/隐藏”设置，而不是仅在局部界面中临时控制。
- UI 层要求：
  - 保留一个清晰可见的开关入口。
  - 开关改变后立即调用现有 `updateClockWidget()` 刷新界面。
- 持久化要求：
  - 继续通过 `pet-settings-store.js` 保存和恢复 `clockEnabled`。
  - 读取旧配置时默认值仍为 `true`，保证兼容旧用户数据。

## Data Flow

### Bubble

1. 某个行为触发普通状态反馈或聊天回复。
2. 现有气泡显示 API 更新文本与显示时长。
3. `syncWidgetPositions()` 或等价刷新入口重新计算右上角锚点。
4. 气泡按新锚点显示。

### Clock Toggle

1. 用户切换日期时间块开关。
2. Renderer 更新 `clockEnabled`。
3. Renderer 调用 `updateClockWidget()` 立即刷新显示状态。
4. 设置保存到 `deskpet-settings.json`。
5. 下次启动时恢复同样的显示状态。

## File Plan

- Modify: `src/renderer/renderer.js`
  - 调整 bubble 锚点计算。
  - 继续统一通过 `clockEnabled` 控制日期时间块显示。
- Modify: `src/renderer/styles.css`
  - 更新 `.mood-bubble` 的位置表现和尖角样式。
- Modify: `src/renderer/index.html` only if the existing clock toggle entry needs label or placement adjustment; otherwise keep current markup.
- Modify: `src/pet-settings-store.js` to ensure `clockEnabled` keeps a stable default and normalization path.
- Modify: renderer-related tests that assert widget behavior.
- Add tests for:
  - 右上角气泡锚点计算
  - `clockEnabled` 显示/隐藏行为

## Error Handling

- 若角色可视边界数据缺失，气泡回退到稳定的右上角默认位置，而不是恢复到正上方旧行为。
- 若时钟组件 DOM 不存在，`updateClockWidget()` 保持无害返回。
- 若旧设置文件中缺少 `clockEnabled`，默认按显示处理。

## Testing Strategy

### Unit / Logic Tests

- 气泡锚点在不同角色尺寸下落点稳定。
- 角色靠近窗口右边缘时，气泡会回收而不是被裁掉大半。
- `clockEnabled=false` 时，时钟组件隐藏。
- `clockEnabled=true` 时，时钟组件恢复显示。

### UI / Regression Checks

- 点击、专注、音乐反馈、聊天回复都走同一套新气泡位置。
- 长文本气泡不会盖住角色脸部主体区域。
- 日期时间块关闭后，拖拽状态和其他组件不受影响。

## Self-Review

- 范围已限定在“统一状态气泡 + 日期时间块显示开关”。
- 已明确“时间组件”指的是日期时间块，而不是专注计时组件。
- 已明确“气泡”覆盖聊天回复和普通状态反馈，不再只限聊天回复。
- 没有把音乐、歌词、其他浮层一并带入本轮范围。
