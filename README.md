# riqvo

面向测试团队的 Web 自动化测试平台。产品目标覆盖 PC 浏览器、安卓 Chrome 真机和 iPhone Safari 真机，支持可视化录制、编辑、回放、视频报告和 AI 辅助。

当前已完成 **D01 工程基础**、**D02 最小协议/可控测试站**与 **D03 PC 录制回放原型**。PC 工作台支持受控浏览器录制、步骤编辑、双环境回放、截图和录像；平台设备注册、正式用例库、手机控制、AI 和桌面安装包按后续功能交付。每个功能完成并验证后，提交并 push 到 `dev`，随后暂停，等待用户 review 再继续。协作约定见 [AGENTS.md](AGENTS.md)。

前端采用 Vue 3 + TypeScript + Pinia + **Naive UI**。PC 工作台采用侧栏导航、顶部状态栏与主工作区布局，支持浅色、深色和跟随系统的主题切换。根部 `NConfigProvider` 统一中文 locale 与组件主题，布局样式使用 SCSS。

当前范围：自管 PC、安卓和 iPhone；第三方真机接入暂缓。保留普通固定步骤定时回放和飞书周期更新检查，不做 AI 定时生成、探索、分析或修复。团队模型可选，个人模型可独立用于 AI 功能。

## 本地开发

准备 Node.js **22**（推荐 **22.23.4**，最低 **22.13.0**；版本文件见 `.node-version`）、pnpm **11.25.0**、Docker Engine / Docker Desktop 和 Compose v2。在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm env:init
pnpm infra:up
pnpm db:migrate
pnpm dev
```

- `env:init` 创建 `.env` 和 `.env.runner`，生成随机本地数据库密码；重复执行保留已有文件。配置及产物均被 Git 忽略。
- Web 默认监听 **0.0.0.0:5177**，本机访问 `http://localhost:5177/`；API 默认监听本机回环地址 **3000**。Web 首页统一进入平台工作台，左侧「系统状态」查看基础依赖；通过同源 `/api` 访问后端。
- MySQL **8.0.26** / Redis **7.4.12** 的宿主机端口默认为 **13306 / 16379**，仅绑定回环地址；开发与集成测试使用相同固定版本和镜像 digest。Compose 是本地开发配置，正式部署在 D26 交付。
- `pnpm dev` 统一启动 Web、NestJS API 和 PC 浏览器执行器；前端热更新，后端与执行器修改后自动重启。终端 Ctrl+C 停止进程；`pnpm infra:stop` 停止依赖并保留数据。
- `.env` 为服务器及开发 Web 配置；`.env.runner` 仅包含执行器的后端地址和检查间隔。服务器数据库凭据不需要复制给执行器。
- API 启动不运行迁移；修改端口时，同步调整 `.env` 的 `WEB_API_PROXY_TARGET` 及 `.env.runner` 的 `RUNNER_API_URL`。
- `ARTIFACT_DIR` 的相对路径始终以仓库为基准；默认 `.local/artifacts`。当前只验证读写能力，正式上传/下载和保留策略在 D16/D18 实现。

MySQL 8.0.26 官方镜像仅提供 `linux/amd64`，Compose 已显式指定平台；ARM 主机需要 Docker 的 amd64 模拟能力，本次仅在 Linux x64 实测。

数据库使用新数据卷 `riqvo-dev_mysql-8-0-26-data`。从此前的 8.4 配置切换后，首次启动会初始化新库，需执行 `pnpm db:migrate`；旧卷 `riqvo-dev_mysql-data` 保留，但不会挂载或自动导入。不要将 8.4 数据目录直接交给 8.0.26 打开；已有业务数据需要另行验证逻辑导出/导入。

本云环境已在工作区安装 Node 22；新终端先激活它，并为 pnpm 指定工作区目录，避免使用系统默认 Node 或不可写的用户目录：

```bash
export PATH="/workspace/riqvo/.cache/toolchains/node-v22.23.4-linux-x64/bin:$PATH"
export PNPM_HOME=/workspace/riqvo/.cache/pnpm/home
pnpm install --frozen-lockfile
```

## 检查与构建

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
pnpm db:status
pnpm --filter @riqvo/runner check
```

`GET /api/health/live` 检查进程存活；`GET /api/health/ready` 实际检查 MySQL 连接与 schema、Redis PING、产物目录写入/读回/删除。依赖未就绪返回 **503**，未迁移的 MySQL 显示 `migration_required`。响应不返回地址、文件路径或凭据。

构建后可分别使用 `pnpm --filter @riqvo/server start`、`pnpm --filter @riqvo/runner start` 运行编译产物；`pnpm --filter @riqvo/web preview` 预览前端构建。Vite preview 仅用于开发验收。这个 Runner 入口负责主动检查 API、记录状态变化和重连；D03 本机测试使用独立的 `pnpm pc:start` 入口，尚未接入平台设备注册和任务调度。

## 自动验证

测试使用 Node 原生测试运行器及真实 Chromium。首次使用可安装 Playwright 管理的浏览器：

```bash
pnpm exec playwright install chromium ffmpeg
pnpm test
pnpm test:integration
```

也可以用 `RIQVO_CHROMIUM_EXECUTABLE` 指向已有 Chromium；本次云环境使用 `/usr/bin/chromium`；录像仍需要 Playwright 可用的 FFmpeg：

```bash
RIQVO_CHROMIUM_EXECUTABLE=/usr/bin/chromium pnpm test
RIQVO_CHROMIUM_EXECUTABLE=/usr/bin/chromium pnpm test:integration
```

- `pnpm test`：构建后验证公共协议、双环境演示站、HTTP、配置错误、执行器不可达、前端故障提示与重试，以及 D03 录制、编辑、回放和真实媒体，不需要 Docker 服务。测试站使用随机端口并在测试后清理。
- `pnpm test:integration`：构建后启动**独立且临时**的 MySQL/Redis、生成测试凭据和随机端口，验证迁移、就绪、执行器重连及实际 Web 调用；正常结束或测试失败都会清理该测试实例，不清理开发数据库。请勿直接运行 integration 文件。若进程被强制杀死，可按输出中的 `riqvo-test-*` 项目名清理该次测试实例。

本次实测平台为 Linux x64，D03 另通过 Chrome/Edge 品牌浏览器兼容套件及录像解码验证；可视模式使用 Xvfb。Windows/macOS 物理桌面与手机能力仍需实际验收，不能从 Linux 或布局测试推断兼容性。

## D02 演示站与协议

在 Node 22 下执行 `pnpm fixture:start`，可独立启动两个测试目标站点，默认端口 **4174 / 4175**，分别代表测试和预发布环境。Ctrl+C 停止两者。演示账号为 `tester`，公开演示密码为 `riqvo-demo`；这不是测试平台账号，不能填写真实账号或个人信息。

站点支持登录、表单、查询、数据重置、移动菜单、文件选择、同源 iframe 和新标签页。实例仅监听本机回环地址；会话及记录隔离，重启清空，不访问平台 MySQL。文件仅做本地信息展示，未实现服务端上传。

统一协议包为 `@riqvo/contracts`；[JSON 样例](examples/d02/task.json) 将操作内容和[环境地址](examples/d02/environments.json)分离，真实浏览器验收复用同一份步骤。支持严格解析、显式变量、能力预检、结果及事件校验；D03 已接入 PC 原型，正式平台任务与手机执行器继续按计划交付。公共接口、步骤语义和限制见 [D02 说明](docs/features/d02-contracts-and-test-site.md)。

## D03 PC 工作台

在测试电脑上安装 Chromium 与录像依赖后，独立启动本机工作台，不需要数据库：

```bash
pnpm exec playwright install chromium ffmpeg
pnpm pc:start
```

打开 `http://127.0.0.1:4318/`（旧 `/pc` 入口仍可使用）。另开终端运行 `pnpm fixture:start`，即可录制演示站，或者导入 `examples/d02/task.json`。录制会在本机打开可见的独立浏览器；停止后可修改步骤、添加断言，再后台或可视回放。切换站点地址为 4175 可验证另一环境。

日常修改 PC 工作台时使用开发模式，无需每次 build：

```bash
pnpm dev
```

打开 `http://localhost:5177/`。此命令同时启动 Vite、NestJS 和 PC 执行器：Vue/样式修改即时热更新；执行器、contracts 和 Playwright 驱动直接从 TypeScript 源码运行，修改后自动重启。执行器默认端口 **4319**，前端通过同源代理访问 API 与 SSE。`pnpm pc:start` 保留为构建后体验入口。

执行器重启会中止当前任务并清空内存结果，草稿请及时导出。日常只需 `pnpm dev`；单服务调试可用 `pnpm dev:web`、`pnpm dev:server`、`pnpm dev:runner`。首次启动前按上文完成 `env:init`、依赖启动和迁移。

「系统状态」读取真实 NestJS 健康检查；平台服务未启动时显示不可连接，不影响独立 PC 录制/回放。开发模式用 `WEB_API_PROXY_TARGET` 指向平台；构建模式用 `RIQVO_PC_PLATFORM_URL`，两者默认 `http://127.0.0.1:3000`。已有 `.env` 不会被 `env:init` 覆盖，升级时将其中的 `WEB_HOST` / `WEB_PORT` 改为 `0.0.0.0` / `5177`。更多端口配置见 D03 说明。

选择 Chrome/Edge 需要本机安装对应浏览器；也可通过 `RIQVO_CHROME_EXECUTABLE` / `RIQVO_EDGE_EXECUTABLE` 指定真实路径。Linux 可视模式需图形桌面或显式设置 `DISPLAY`。本工作台不是已经接入平台的远程设备服务。

密码录制为变量引用，运行前在页面补填；导出用例不包含运行变量值。草稿需显式导出保存，刷新会丢弃未导出的编辑。媒体默认保存在 `.local/pc-artifacts`，本原型尚无自动过期清理或持久报告索引。

工作台通过 `/api/pc/events` 的 SSE 长连接接收录制步骤和运行进度，不再每 500ms 请求 `/api/pc/state`。断线后自动退避重连，重新认证并同步最新完整状态；开始、停止等操作继续走 HTTP。网络面板中事件流持续处于连接中属于正常情况。

当前支持普通导航和表单流程；遇到文件选择、iframe 内操作、弹窗、拖拽等未支持交互会提示。完整启动配置、公共接口、验收与限制见 [D03 说明](docs/features/d03-pc-workbench.md)。

本云实例的录像缓存位于工作区；运行测试或工作台前设置 `PLAYWRIGHT_BROWSERS_PATH=/workspace/riqvo/.cache/playwright`。在新的云实例中需先准备该目录的浏览器/FFmpeg，不能假定缓存已恢复。

## 目录与进度

```text
apps/web        Vue 3 + Vite + Pinia 管理台
apps/server     NestJS API、配置、依赖检查、TypeORM 迁移
apps/runner     独立执行核心入口，后续由桌面 App 或设备主机后台进程承载
apps/test-site  独立可控演示站，提供两套环境和代表性 Web 交互
packages/contracts  共享任务、步骤、能力、结果和事件协议
packages/driver-playwright  PC 浏览器录制、单次回放及媒体生命周期
examples/d02    JSON 任务、环境及样例能力声明
scripts         配置初始化、隔离集成测试编排
tests           HTTP / CLI / 真实浏览器公共边界验证
docs            产品基线、开发计划、进度及功能说明
```

后续执行引擎和 AI 包在对应功能中创建，避免预先引入空实现。详见 [开发计划](docs/plan.md)、[开发进度](docs/progress.md)、[D01 交付说明](docs/features/d01-engineering.md)、[D02 交付说明](docs/features/d02-contracts-and-test-site.md)、[D03 交付说明](docs/features/d03-pc-workbench.md)。
