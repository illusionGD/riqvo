---
name: engineering-foundation
description: riqvo 的 D01 工程结构、启动命令、真实依赖检查和维护约束。维护 Web/API/Runner 基础、迁移、开发环境及相关测试时使用。
---

# riqvo 工程基础

先读 [README](../../../README.md)、[开发进度](../../../docs/progress.md) 和 [D01 说明](../../../docs/features/d01-engineering.md)。此 skill 针对 riqvo，不引用 Memory Weave 的 foundation/data-foundation 业务约定或仓库权限。

## 运行

在仓库根目录使用用户指定的 Node 22（推荐 22.23.4，最低 22.13.0）、pnpm 11.25.0，执行 `pnpm install --frozen-lockfile`。使用 `@types/node` 22 并在真实 Node 22 下验证。`pnpm env:init` 只创建缺失的 `.env` / `.env.runner`，保留已有设置。使用当前 checkout，除非用户明确要求，不新建 worktree。

`pnpm infra:up` → `pnpm db:migrate` → `pnpm dev`。只重启本任务启动的进程。Docker 数据默认保留，不能为解决连接错误直接删除开发 volumes。先检查端口、运行状态与配置是否匹配。

数据库固定为用户指定的 MySQL 8.0.26，开发/集成测试镜像及 digest 保持一致。官方镜像仅有 linux/amd64，ARM 主机需提供模拟能力。开发使用 `mysql-8-0-26-data` 新卷，旧 `mysql-data` 卷保留且不自动导入；禁止让 8.0.26 直接打开 8.4 数据目录。SQL 与迁移须在实际 8.0.26 上验证。

本云环境的 Node 22 已安装在 `/workspace/riqvo/.cache/toolchains/node-v22.23.4-linux-x64/bin`；每个新 shell 把此目录放在 PATH 前端，并用 `node --version` 和 `pnpm exec node --version` 检查实际版本。用户目录不可写时，为安装命令设置 `PNPM_HOME=/workspace/riqvo/.cache/pnpm/home`。读云环境运行 skill 后再做网络或 Docker 操作，保留代理与 TLS 校验。服务进程不能假定跨云环境任务继续运行。

## 代码边界

- apps/web：Vue SFC、Pinia Setup Store、Naive UI，遵守 `.codex/rules`；页面 → store/service，外部响应先校验再使用。库组件按需显式导入，根部 NConfigProvider 统一中文 locale 和主题，主题配置在 `apps/web/src/constants/ui-theme.ts`。
- apps/server：NestJS 模块化应用。配置只返回字段名错误，不回显值；数据库迁移与应用启动分开，禁用 synchronize/自动迁移。
- apps/runner：独立执行核心入口，主动访问后端；配置在 `.env.runner`，不复制服务器数据库或团队模型密钥。D01 仅连通检查，不宣称任务执行。
- 新增业务 schema 用新 migration，保留已有迁移；MySQL DDL 不能视为可完整回滚事务。更新 schema 时同步考虑就绪检查的 revision 兼容性。
- 产物与代码分开保存在配置目录，不能直接暴露整个产物目录作为公开静态资源。

## 验证

修改后运行针对性 Prettier、`pnpm lint`、`pnpm typecheck`；按涉及边界执行 `pnpm test` / `pnpm test:integration`。测试前构建已在命令中完成。

浏览器测试使用 Playwright Chromium，或用 `RIQVO_CHROMIUM_EXECUTABLE` 指向本机 Chromium；不能因浏览器缺失把 Web 测试标为通过。集成测试必须通过脚本创建随机命名的隔离 MySQL/Redis，不能改成开发/生产数据库；仅清理该次测试创建的服务。

测试只通过已确认的 HTTP、CLI、Web 或后续已批准公共边界观察行为。不直接测试私有方法；保留依赖不可用、未迁移、配置错误、前端重试和 Runner 重连的失败覆盖。

## 交付

更新总体 plan、progress 和对应功能说明。用户要求每个功能完成并验证后，提交并 push 到本仓库 `origin/dev`，核实推送成功后暂停供 review，等用户确认后再开始下一个。该推送已获授权，无需逐次再询问；推送失败要如实报告并保留本地提交，不强制覆盖远端提交。完整协作约定见 [AGENTS.md](../../../AGENTS.md)。不要将 D01 的工程验证等同于浏览器录制、手机真机或 AI 业务验收。
