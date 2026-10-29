# riqvo

面向测试团队的 Web 自动化测试平台。产品目标覆盖 PC 浏览器、安卓 Chrome 真机和 iPhone Safari 真机，支持可视化录制、编辑、回放、视频报告和 AI 辅助。

当前已完成 **D01 工程基础**：Web 管理台入口、NestJS API、执行器进程入口、真实依赖检查、数据库迁移及开发验证。录制、测试任务、登录、真机控制和桌面安装包按后续功能交付。每个功能完成并验证后，提交并 push 到 `dev`，随后暂停，等待用户 review 再继续。协作约定见 [AGENTS.md](AGENTS.md)。

前端采用 Vue 3 + TypeScript + Pinia + **Naive UI**。根部 `NConfigProvider` 统一中文 locale 和主题，组件按需显式导入，布局样式使用 SCSS。

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
- MySQL / Redis 的宿主机端口默认为 **13306 / 16379**，仅绑定回环地址；数据存于 Docker volumes。Compose 是本地开发配置，正式部署在 D26 交付。
- `pnpm dev` 同时启动 Web、API 和执行器，代码修改会重新编译/加载。终端 Ctrl+C 停止进程；`pnpm infra:stop` 停止依赖并保留数据。
- `.env` 为服务器及开发 Web 配置；`.env.runner` 仅包含执行器的后端地址和检查间隔。服务器数据库凭据不需要复制给执行器。
- API 启动不运行迁移；修改端口时，同步调整 `.env` 的 `WEB_API_PROXY_TARGET` 及 `.env.runner` 的 `RUNNER_API_URL`。
- `ARTIFACT_DIR` 的相对路径始终以仓库为基准；默认 `.local/artifacts`。当前只验证读写能力，正式上传/下载和保留策略在 D16/D18 实现。

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

- `pnpm test`：构建后验证 HTTP、配置错误、执行器不可达、前端故障提示与重试，不需要 Docker 服务。
- `pnpm test:integration`：构建后启动**独立且临时**的 MySQL/Redis、生成测试凭据和随机端口，验证迁移、就绪、执行器重连及实际 Web 调用；正常结束或测试失败都会清理该测试实例，不清理开发数据库。请勿直接运行 integration 文件。若进程被强制杀死，可按输出中的 `riqvo-test-*` 项目名清理该次测试实例。

本次实测平台为 Linux x64；Windows/macOS、实际 Chrome/Edge 驱动和手机能力在对应功能中验证，不由这组工程测试推断兼容性。

## 目录与进度

```text
apps/web        Vue 3 + Vite + Pinia 管理台
apps/server        NestJS API、配置、依赖检查、TypeORM 迁移
apps/runner     独立执行核心入口，后续由桌面 App 或服务器进程承载
scripts         配置初始化、隔离集成测试编排
tests           HTTP / CLI / 真实浏览器公共边界验证
docs            产品基线、开发计划、进度及功能说明
```

共享步骤协议、驱动和 AI 包在对应功能中创建，避免预先引入空实现。详见 [开发计划](docs/plan.md)、[开发进度](docs/progress.md)、[D01 交付说明](docs/features/d01-engineering.md)。
