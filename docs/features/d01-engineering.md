# D01 工程基础

日期：2026-10-29。实现与验证完成，用户 review 已通过；当前开发状态见 [进度](../progress.md)。

## 交付边界

| 模块           | 本次实现                                                                          | 验收方式                                             |
| -------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| pnpm workspace | Web/API/Runner 三个独立入口、固定工具版本、锁文件、格式/lint/typecheck/build 命令 | 冻结依赖安装、检查与实际编译                         |
| NestJS API     | 进程存活与真实依赖就绪接口；参数错误只显示字段名                                  | 编译进程 HTTP 验证，故障返回 503                     |
| MySQL          | TypeORM 显式迁移、基础元数据与迁移记录；数据库级迁移锁                            | 隔离新库未就绪 → 迁移 → 就绪；重复迁移 applied=0     |
| Redis          | 开发实例、PING 检查；为后续 BullMQ 任务功能提供依赖                               | 真实 Redis 及不可达路径                              |
| 产物目录       | 独立路径、实际写入/读回/删除检查，清理检查文件                                    | 可写目录通过，文件下的非法目录失败                   |
| Web            | 服务状态页，Pinia 管理加载/失败/刷新；同源 API 代理                               | Chromium 打开构建页面，验证正常、503、断线、重新检查 |
| Runner         | 独立配置、主动连接、状态变化输出、断线后继续检查、单次 `--check`                  | 真实 API 重启后恢复就绪；成功/失败退出码             |
| 开发说明       | 配置模板、随机本地密码、Compose、根目录命令与功能 skill                           | 实际按 README 启动三进程                             |

桌面执行器 App 的产品形态已记入计划；本次交付共享执行核心的进程入口。桌面壳、安装包、节点绑定、浏览器/手机控制、任务协议、业务数据库模型、视频上传及 AI 调用均按后续编号开发。页面里的“已就绪”仅表示工程依赖检查通过。

## 技术选择与依据

沿用已确认的 [总体调研](../research/web-test-platform.md)，本次仅补充工程实现选择。

运行时按用户要求采用 Node 22，推荐版本 22.23.4；最低 22.13.0 满足 pnpm、ESLint 和 Vite 的引擎要求，类型依赖同步为 @types/node 22。

用户补充指定前端组件库为 **Naive UI**，已接入 2.45.3（[官方包元数据](https://registry.npmjs.org/naive-ui)，MIT，Vue 3 peer dependency）。根部 `NConfigProvider` 配置中文 locale、日期 locale 和共享主题，页面使用 `NButton`、`NTag`、`NAlert`；组件按需显式导入，布局保留 SCSS。此调整沿用已有 Web 公共流程测试，不新增与组件内部实现绑定的测试。

| 选项                 | 取舍                                                                      | 结论                                                               |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| TypeORM 0.3 + mysql2 | TypeScript/NestJS 生态成熟，有显式迁移与记录；需要处理 MySQL DDL 隐式提交 | 本次采用；关闭 synchronize 与 migrationsRun                        |
| Prisma               | schema/生成客户端有完整流程，但 D01 需额外生成步骤和工具链                | 暂不引入，当前规模无切换收益                                       |
| 手写 SQL 迁移器      | 依赖少，但要自行维护迁移历史、锁与错误恢复                                | 不自建替代成熟迁移引擎；业务 SQL 可在 TypeORM migration 中显式写入 |
| 文件系统产物目录     | 本地调试成本低，能验证真实读写；多节点共享仍需后续对象存储/上传协议       | D01 采用，D16 产品化                                               |

版本与引擎要求来自 2026-10-29 读取的官方 npm metadata；事实为发布元数据与当前运行结果，不推断未测试的系统兼容性。迁移行为另参考 [TypeORM 0.3.31 MigrationExecutor 源码](https://github.com/typeorm/typeorm/blob/0.3.31/src/migration/MigrationExecutor.ts)。官方包元数据入口：[NestJS](https://registry.npmjs.org/@nestjs/core)、[TypeORM](https://registry.npmjs.org/typeorm)、[Vue](https://registry.npmjs.org/vue)、[Vite](https://registry.npmjs.org/vite)、[Playwright](https://registry.npmjs.org/playwright)。

| 层                        | 固定并已运行的版本                           |
| ------------------------- | -------------------------------------------- |
| Node / pnpm / TypeScript  | 22.23.4 / 11.25.0 / 5.9.3                    |
| NestJS / TypeORM / mysql2 | 11.2.8 / 0.3.31 / 3.24.6                     |
| Vue / Vite / Pinia        | 3.5.44 / 8.3.5 / 3.0.4                       |
| MySQL / Redis             | 8.0.26 / 7.4.12；Compose 同时固定镜像 digest |
| ioredis / Playwright      | 5.11.1 / 1.64.1                              |
| 实际验收浏览器            | 云环境 Chromium 154.0.8037.57，Linux x64     |

所有直接 npm 依赖固定版本，锁文件固定传递依赖并保留完整性校验。安装检查发现 Sass 1.107.0 太新，已改用 1.106.0、重新生成依赖锁并开启严格发布时间检查，没有保留发布时间豁免。原生 watcher 的安装脚本单独列在 allowBuilds 中，不开放所有依赖脚本。

## 数据与进程约束

- 数据库按用户要求固定为 MySQL 8.0.26，开发与隔离集成测试共用该版本及 digest。官方镜像只提供 linux/amd64，Compose 显式指定平台；ARM 主机需自行提供 Docker 模拟能力，尚未实测。
- 开发切换使用新卷 `riqvo-dev_mysql-8-0-26-data`，首次运行重新执行基础迁移；旧 8.4 卷 `riqvo-dev_mysql-data` 保留，未自动导入或删除。不能直接降级复用数据库文件，业务数据需要单独验证逻辑导出/导入。
- `.env` 为后端/开发配置，`.env.runner` 为执行端配置；两者均忽略提交。初始化命令不覆盖已有文件，随机数据库密码仅写入本地配置，不打印值。
- 后端只通过 `db:migrate` 改表；应用启动不会自动迁移。`db:status` 可能初始化迁移记录表，但不应用业务/schema 迁移。
- D01 仅创建 `riqvo_metadata` 和 `riqvo_migrations`。基础 migration 可以恢复表创建与记录之间的中断；MySQL DDL 不能宣称整体事务回滚。后续迁移仍须逐项设计恢复策略，公共 CLI 不提供删除数据的回滚命令。
- 迁移通过 MySQL 命名锁避免同库并发迁移；就绪检查要求 schema revision 为 1，后续 schema 变化要同步更新兼容判定。
- Redis 在开发 Compose 中仅绑定回环地址，保留数据、使用 `noeviction`；队列投递/消费不属于 D01。
- 产物根目录由部署者配置，相对路径以仓库为基准。就绪接口只留下短暂探针文件并清理，不开放产物下载或静态目录。
- Runner 只检查配置的 API origin，不读取数据库、申请设备或执行页面动作。服务未就绪时持续检查，退出时终止等待；API URL 中不能夹带账号、密码、查询参数或片段。

## 验证记录

| 命令/操作                                                           | 本次结果                                                         |
| ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm lint`、`pnpm typecheck`                                       | 通过                                                             |
| `pnpm build`                                                        | 三个应用构建通过，编译产物能启动                                 |
| `RIQVO_CHROMIUM_EXECUTABLE=/usr/bin/chromium pnpm test`             | 6 项通过，0 失败、跳过或禁用                                     |
| `RIQVO_CHROMIUM_EXECUTABLE=/usr/bin/chromium pnpm test:integration` | 3 项通过，真实隔离 MySQL/Redis，测试后清理临时服务               |
| README 的初始化、依赖启动、迁移、`pnpm dev`                         | 已实际执行；Web 代理与 API 就绪返回 200；Runner 检查成功         |
| 页面人工检查                                                        | 已截图；390px 宽布局无横向溢出，仅为布局验证，不代表手机真机测试 |

另已通过 `pnpm format:check`、`pnpm install --frozen-lockfile`，并验证重复初始化不更改已有配置。云环境安装脚本和启动说明已保存草稿，待在环境设置中保存并发布；当前实例验证不等于新任务恢复验证。

公共 HTTP、CLI、Web 流程沿用总体计划已批准的测试边界。关键行为按失败用例 → 实现 → 通过推进；未用内部模块替身或 SQLite 替代 MySQL。尚未验证 Windows/macOS 安装、真机或 AI，均留在对应功能的验收中。

MySQL 8.0.26 调整复验：实际 Node 22.23.4 下 lint、typecheck、构建与 3 项隔离集成测试通过，无失败或跳过。开发数据库实际 `SELECT VERSION()` 返回 8.0.26；新卷迁移首次 applied=1、重复 applied=0，状态无待执行项，API/Web 代理就绪及 Runner 检查成功。此次仅调整数据库配置和说明，沿用既有集成测试验证兼容性。

## Review 建议

1. 查看根目录 README 的启动步骤与目录边界是否符合预期。
2. 查看 Web 服务状态页及错误重试体验。
3. 查看后端/执行器配置分离、显式迁移和测试方式。

本功能已由用户 review 确认，后续功能按总体计划逐项交付。
