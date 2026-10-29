---
name: pc-workbench
description: riqvo D03 本机 PC 录制、步骤编辑、回放和媒体原型维护；修改 Playwright 驱动、本机工作台或对应 UI 时使用。
---

# PC 录制回放维护

先读 [AGENTS.md](../../../AGENTS.md)、[进度](../../../docs/progress.md)、[D03 说明](../../../docs/features/d03-pc-workbench.md)，以及 [test-contracts](../test-contracts/SKILL.md)。遵循 Node 22、中文注释、Naive UI 与每功能 push dev 后暂停 review 的约定。

- 由执行器在选定测试电脑上启动受控浏览器；当前回环工作台是 M0 原型，不是正式远程设备注册或调度服务。保持 `pnpm dev` 原有服务入口，D03 使用 `pnpm pc:start`。
- 只通过 Playwright 公开 API 录制及执行，不引入内部 recorder SDK，不执行导入文件中的任意代码。
- 协议从 `@riqvo/contracts` 公共入口导入；UI 的单步校验使用公开 `STEP_SCHEMA`，整任务仍由 parseTask / prepareTask 校验。
- 录制事件先校验后写入草稿，拒绝时保留最后有效版本并提示。不能将暂未支持的 iframe、弹窗、上传等交互默默丢弃。
- `type=password` 只产生变量引用，不读取/传输其值。运行变量只在任务内存使用，不进入状态 API、导出 JSON 或日志；不要将此机制误称为已经实现 AI Key 隔离。
- 回放独占隔离上下文，录制总是可视、回放默认后台。运行快照不随 UI 草稿编辑而改变。通过必须有完整通过的业务断言，无断言为 unverified。
- 截图/录像由受控引用访问；错误使用固定代码。媒体缺失与业务失败区分，视频关闭上下文后再完成。取消、失败和关闭要释放浏览器，不能永久保留 busy。
- HTTP 只监听回环，控制请求校验来源和令牌；不要开放任意文件路径、可执行文件参数或无保护的远程控制。
- D03 媒体只在本机存储，没有自动清理、持久报告索引或正式权限控制。后续接入 D09/D16/D18 时显式迁移这些边界。

验证：Node 22 下运行冻结安装、lint、typecheck、format:check、pnpm test。基础套件使用真实 Chromium，支持 `RIQVO_CHROMIUM_EXECUTABLE`；录像需要 Playwright 可用的 FFmpeg。品牌兼容套件在 `tests/compatibility/pc-browsers.test.mjs`，需 Chrome/Edge 真实路径、图形桌面或 Xvfb，以及 ffprobe / ffmpeg，不能以 Chromium 或布局截图代替品牌/真机验收。

测试边界保持真实浏览器、公开驱动 API、工作台 HTTP/CLI 和用户界面。新增行为按 TDD 小步验证，不读取私有状态或用模拟视频代替真实媒体。数据库无改动时不重复运行数据库集成；修改协议或调度后再按影响扩大范围。
