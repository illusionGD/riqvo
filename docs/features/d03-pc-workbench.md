# D03 PC 录制、编辑与回放原型

状态：已实现并验证，待用户 review。沿用 D02 协议，使用 Playwright 1.64.1 的公开接口。这里验证 PC 的完整基本流程；安卓、iPhone、平台设备注册及桌面安装包分别在后续功能交付。

## 在哪里运行

本功能的工作台由**测试电脑上的执行器**提供：用浏览器打开本机工作台，点击录制后，执行器在这台电脑打开独立受控浏览器。手动操作发生在该窗口，工作台显示步骤并负责编辑。回放也由同一个本机执行器启动浏览器。

M0 工作台独立于 NestJS/MySQL，便于先验证驱动。后续 D09 再把执行器接入平台的设备管理、任务派发与租约。当前 Linux 云环境只是此次开发验收主机，不代表所有用户的测试都改到平台服务器运行。本次没有 AI 调用或模型凭据处理。

## 启动与体验

使用 Node 22、pnpm 11.25.0。在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium ffmpeg
pnpm fixture:start
```

另开终端：

```bash
pnpm pc:start
```

打开 `http://127.0.0.1:4318/pc`。录制要求当前电脑有可用的图形桌面；Linux 无显示环境只能后台回放，或显式配置用于验收的虚拟显示器。首次下载浏览器后，如系统缺少浏览器共享库，按 Playwright 的平台安装说明补齐。

1. 默认站点为演示环境 `http://127.0.0.1:4174/`。选择 Chromium、Chrome 或 Edge；Chrome/Edge 需在本机安装，或通过下表指定其真实二进制。
2. 点击「开始新录制」。当前草稿被替换，录制总是可见窗口。使用演示账号 `tester` / `riqvo-demo` 登录；通过点击按钮提交，录制创建记录等基础表单操作。
3. 点击工作台「停止录制」，等待视频收尾。密码输入生成 `secret_1` 等变量引用，在「本次运行变量」补填值后才能回放。
4. 选择步骤，修改定位、输入、超时，或上移、下移、删除。「添加步骤 / 断言」默认插入文本检查，也可以切换为其他支持动作。只有加入并通过业务断言，结果才显示「通过」。
5. 点击「回放用例」，默认后台，可切换可视。回放创建隔离上下文，不共享录制时的登录状态；需要保留登录步骤。
6. 将站点地址切换为 `http://127.0.0.1:4175/`，再运行同一用例。步骤仍保留逻辑站点及相对路径，不替换操作文本。
7. 查看逐步结果、截图与可播放录像。结果展示实际运行的用例版本；编辑当前草稿不会改写上次报告。

也可导入 `examples/d02/task.json` 直接体验：样例自带公开演示变量，导入后可编辑；该样例 `artifacts: []` 不要求媒体。新建工作台草稿默认采集截图和视频，导入文件则遵循文件的 `artifacts` 配置。

## 本机配置

这些环境变量由启动执行器的终端设置；不自动加载 `.env.runner`，也不接受 HTTP 请求指定浏览器路径或产物目录。

| 变量                        | 默认值 / 用途                                                 |
| --------------------------- | ------------------------------------------------------------- |
| `RIQVO_PC_PORT`             | `4318`；只绑定 `127.0.0.1`                                    |
| `RIQVO_PC_ARTIFACT_DIR`     | 仓库 `.local/pc-artifacts`；相对自定义路径以启动目录解析      |
| `RIQVO_CHROMIUM_EXECUTABLE` | 未设置时使用 Playwright 安装的 Chromium                       |
| `RIQVO_CHROME_EXECUTABLE`   | 未设置时使用 Playwright 的 `chrome` channel 查找已安装 Chrome |
| `RIQVO_EDGE_EXECUTABLE`     | 未设置时使用 `msedge` channel 查找已安装 Edge                 |
| `PLAYWRIGHT_BROWSERS_PATH`  | Playwright 的浏览器和 FFmpeg 缓存配置；遵循其官方行为         |
| `DISPLAY`                   | Linux 可视会话使用的显示服务；不会自动创建                    |

例如已有系统 Chromium 时：

```bash
RIQVO_CHROMIUM_EXECUTABLE=/usr/bin/chromium pnpm pc:start
```

即使指定系统浏览器，录像仍需要 Playwright 可用的 FFmpeg。关闭终端会取消活动任务并释放浏览器；工作台关闭/刷新本身不取消已经明确启动的任务。

## 支持范围

| 能力       | D03 行为                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| 自动录制   | 导航、点击、文本输入、单选下拉、勾选；连续同一输入合并；点击引发的导航生成地址检查                                    |
| 定位       | 录制优先唯一 `data-testid`，其次唯一 id / CSS 层级；编辑和回放支持 testId、label、role、CSS；不默认取多匹配中的第一个 |
| 编辑和回放 | D02 的十种动作：navigate、fill、select、check、click、waitFor、assertText、assertVisible、assertUrl、screenshot       |
| 等待与断言 | 原生自动等待及步骤超时；文本、可见性、地址检查；等待本身不当作业务断言                                                |
| 截图、视频 | 受控引用下载；PNG / WebM；失败与缺失分开显示，录像在上下文关闭后完成                                                  |
| 环境       | 逻辑站点 + 相对路径 + query；支持导入多个站点映射，界面逐个编辑地址                                                   |
| 运行       | 单会话互斥，后台默认、可视可选，支持取消，不同时控制同一浏览器                                                        |
| 数据保存   | 显式 JSON 导入/导出；导出移除运行变量值；没有正式用例库或版本历史                                                     |

录制不调用 Playwright 内部 recorder / codegen SDK，也不解析生成的任意脚本。采集器通过公开 `BrowserContext` API 接收真实 DOM 事件并转换为严格协议。非法事件或无法保存的定位不会污染最后有效草稿。

当前遇到文件选择、iframe 内交互、弹窗/新标签页、多选列表、拖拽、回车/部分快捷键和富文本编辑时，会停止采集并提示。用户仍需停止会话、检查已录步骤；提示不代表已经录得完整用例。hash 路由、重复 query 键、未配置站点或协议不允许的路径也会明确拒绝。复杂鼠标手势、悬停触发菜单、任意快捷键和浏览器自身 UI 不在本次录制验收范围。选择器在页面布局变化后可能需要人工修改。

本阶段不提供脚本扩展、Trace、断点调试、自动重试、并发调度、定时任务、账号复用、权限体系、手机控制或 AI。对应既定功能仍按总体计划交付，普通定时测试与 AI 定时功能的范围约定不变。

## 数据和接口边界

- 草稿与运行变量保留在工作台当前页面内存；刷新会丢弃未导出的编辑和变量。执行器仅保留最近一次任务/报告的内存快照，查询快照不包含 `variables` 的值。没有写入平台数据库或浏览器持久存储。
- 密码采集针对 `type=password`：采集端不读取其值，仅发送变量标记。普通输入文本、页面截图与录像仍可包含业务数据；用户主动将固定文本写入步骤时，文本会进入 JSON。
- 媒体保存在本机产物目录，本原型没有自动过期删除。服务重启后媒体文件还在，但下载索引不恢复。可停止执行器后自行清理；正式保留策略与报告库在 D16/D18 实现。
- 控制接口只用于本机工作台：校验 Host、Origin、Fetch Metadata 与随机会话令牌；变更操作必须带自定义令牌头。没有对跨源调用开放 CORS，不把它当作已经实现 D09 的远程认证。
- `GET /api/pc/bootstrap` 初始化令牌与 HttpOnly / SameSite=Strict Cookie；`GET /api/pc/state` 获取状态。`POST /api/pc/record`、`run` 接收 D02 任务，`stop`、`cancel` 结束会话。并发启动返回 409，无效任务返回 400，未认证返回 403。
- 媒体仅通过 `GET /api/pc/artifacts/<opaque-reference>` 访问，不接受任意路径；视频支持普通字节 Range 请求。错误不回显任务值、页面文本或本机路径。
- `@riqvo/contracts` 增加公开 `STEP_SCHEMA` 导出，供编辑器校验单个步骤；D02 协议版本与格式不变。

## 代码与维护

- `packages/driver-playwright`：公开 PC 能力、隔离浏览器生命周期、录制器、单次回放和媒体引用。
- `apps/runner/src/pc-main.ts`：本机 HTTP/静态工作台入口；`pc-workbench.ts`：单会话状态与取消。既有 Runner 连通检查入口保留。
- `apps/web/src/views/pc`、`stores/pc.ts`、`services/pc-service.ts`：Naive UI 工作台、草稿状态、严格接口解析；服务返回值按 unknown 校验。
- [维护 skill](../../.codex/skills/pc-workbench/SKILL.md) 记录后续修改约束。

## 验证记录

2026-10-29，实际 Node **22.23.4**、pnpm **11.25.0**、Linux x64：

- `pnpm test`：**22 项通过**，包括既有 14 项和新增 8 项，无失败、跳过或禁用。覆盖录制—修改—回放、密码变量、错误断言、取消、无断言、不支持交互、非法定位、HTTP 鉴权/互斥、UI 编辑及导入导出、真实媒体下载和浏览器播放。
- 独立兼容性套件 **3 项通过**：真实 Chrome **156.0.8078.73**、Edge **155.0.4283.62** 分别可视录制，再用修改后的步骤在两套随机端口环境后台/可视回放；所有录制/回放录像通过 ffprobe 检查与 FFmpeg 完整解码。第三项从工作台页面启动、停止可视录制并播放录像。
- 可视模式使用 **Xvfb :93**。品牌浏览器从厂商发行源下载并校验包 SHA256 后解包运行；没有把 Chromium 当作 Chrome/Edge。本次使用系统 FFmpeg 接入工作区内 Playwright 的 FFmpeg 路径，并以实际解码和浏览器播放确认兼容性；普通安装使用官方 `playwright install ... ffmpeg`。
- 界面桌面截图及 390px 窄屏布局已检查，无横向溢出；截图在 `.local/review/d03-*.png`，不提交产物。
- lint、typecheck、格式检查、构建、冻结依赖安装均通过。Vite 提示工作台按需加载的 JS chunk 约 773 kB（gzip 约 179 kB），属于当前原型体积提示，未关闭告警。
- 没有数据库/迁移改动，本次未重复运行 MySQL/Redis 集成；D02 的 MySQL 8.0.26 历史结果不计入本次 25 项。

复现品牌浏览器验证需要实际 Chrome/Edge、可用显示环境以及 `ffmpeg` / `ffprobe`，指定真实路径后运行：

```bash
pnpm build
RIQVO_CHROMIUM_EXECUTABLE=/path/to/chromium \
RIQVO_CHROME_EXECUTABLE=/path/to/google-chrome \
RIQVO_EDGE_EXECUTABLE=/path/to/microsoft-edge \
node --test tests/compatibility/pc-browsers.test.mjs
```

Linux 无桌面时可自行启动 Xvfb 并设置 `DISPLAY`。未提供品牌浏览器路径会使该套件失败，不能静默跳过。Windows/macOS 物理桌面、安卓、iPhone 和第三方真机未在此功能验收；不由 Linux 结果推断这些平台兼容性。
