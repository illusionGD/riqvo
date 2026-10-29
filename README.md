# riqvo

面向测试团队的 Web 自动化测试平台。产品目标覆盖 PC 浏览器、安卓 Chrome 真机和 iPhone Safari 真机，支持可视化录制、编辑、回放、视频报告和 AI 辅助。

当前已完成 **D01 工程基础**与 **D02 最小协议/可控测试站**：Web 管理台入口、NestJS API、执行器进程入口、真实依赖检查、数据库迁移，以及统一步骤/结果协议和双环境演示站。正式录制、任务派发、平台登录、真机控制和桌面安装包按后续功能交付。每个功能完成并验证后，提交并 push 到 `dev`，随后暂停，等待用户 review 再继续。协作约定见 [AGENTS.md](AGENTS.md)。

前端采用 Vue 3 + TypeScript + Pinia + **Naive UI**。根部 `NConfigProvider` 统一中文 locale 和主题，组件按需显式导入，布局样式使用 SCSS。

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
- Web 默认端口 **5173**，API 默认端口 **3000**，监听本机回环地址。Web 通过同源 `/api` 访问后端。
- MySQL **8.0.26** / Redis **7.4.12** 的宿主机端口默认为 **13306 / 16379**，仅绑定回环地址；开发与集成测试使用相同固定版本和镜像 digest。Compose 是本地开发配置，正式部署在 D26 交付。
- `pnpm dev` 同时启动 Web、API 和执行器，代码修改会重新编译/加载。终端 Ctrl+C 停止进程；`pnpm infra:stop` 停止依赖并保留数据。
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

构建后可分别使用 `pnpm --filter @riqvo/server start`、`pnpm --filter @riqvo/runner start` 运行编译产物；`pnpm --filter @riqvo/web preview` 预览前端构建。Vite preview 仅用于开发验收。执行器目前只主动检查 API、记录状态变化和重连，不宣称已经注册节点或具备执行测试的能力。

## 自动验证

测试使用 Node 原生测试运行器及真实 Chromium。首次使用可安装 Playwright 管理的浏览器：

```bash
pnpm exec playwright install chromium
pnpm test
pnpm test:integration
```

也可以用 `RIQVO_CHROMIUM_EXECUTABLE` 指向已有 Chromium；本次云环境使用 `/usr/bin/chromium`，无需下载浏览器：

```bash
RIQVO_CHROMIUM_EXECUTABLE=/usr/bin/chromium pnpm test
RIQVO_CHROMIUM_EXECUTABLE=/usr/bin/chromium pnpm test:integration
```

- `pnpm test`：构建后验证公共协议、双环境演示站、HTTP、配置错误、执行器不可达、前端故障提示与重试，不需要 Docker 服务。测试站使用随机端口并在测试后清理。
- `pnpm test:integration`：构建后启动**独立且临时**的 MySQL/Redis、生成测试凭据和随机端口，验证迁移、就绪、执行器重连及实际 Web 调用；正常结束或测试失败都会清理该测试实例，不清理开发数据库。请勿直接运行 integration 文件。若进程被强制杀死，可按输出中的 `riqvo-test-*` 项目名清理该次测试实例。

本次实测平台为 Linux x64；Windows/macOS、实际 Chrome/Edge 驱动和手机能力在对应功能中验证，不由这组工程测试推断兼容性。

## D02 演示站与协议

在 Node 22 下执行 `pnpm fixture:start`，可独立启动两个测试目标站点，默认端口 **4174 / 4175**，分别代表测试和预发布环境。Ctrl+C 停止两者。演示账号为 `tester`，公开演示密码为 `riqvo-demo`；这不是测试平台账号，不能填写真实账号或个人信息。

站点支持登录、表单、查询、数据重置、移动菜单、文件选择、同源 iframe 和新标签页。实例仅监听本机回环地址；会话及记录隔离，重启清空，不访问平台 MySQL。文件仅做本地信息展示，未实现服务端上传。

统一协议包为 `@riqvo/contracts`；[JSON 样例](examples/d02/task.json) 将操作内容和[环境地址](examples/d02/environments.json)分离，真实浏览器验收复用同一份步骤。支持严格解析、显式变量、能力预检、结果及事件校验；录制和正式执行器接入在 D03 后继续。公共接口、步骤语义和限制见 [D02 说明](docs/features/d02-contracts-and-test-site.md)。

## 目录与进度

```text
apps/web        Vue 3 + Vite + Pinia 管理台
apps/server     NestJS API、配置、依赖检查、TypeORM 迁移
apps/runner     独立执行核心入口，后续由桌面 App 或设备主机后台进程承载
apps/test-site  独立可控演示站，提供两套环境和代表性 Web 交互
packages/contracts  共享任务、步骤、能力、结果和事件协议
examples/d02    JSON 任务、环境及样例能力声明
scripts         配置初始化、隔离集成测试编排
tests           HTTP / CLI / 真实浏览器公共边界验证
docs            产品基线、开发计划、进度及功能说明
```

驱动、执行引擎和 AI 包在对应功能中创建，避免预先引入空实现。详见 [开发计划](docs/plan.md)、[开发进度](docs/progress.md)、[D01 交付说明](docs/features/d01-engineering.md)、[D02 交付说明](docs/features/d02-contracts-and-test-site.md)。
