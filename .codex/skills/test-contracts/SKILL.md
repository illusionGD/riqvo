---
name: test-contracts
description: riqvo D02 任务/步骤/能力/结果协议、环境解析和可控演示站维护；开发驱动或调整共享协议时使用。
---

# riqvo 测试协议与演示站

先读 [AGENTS.md](../../../AGENTS.md)、[开发进度](../../../docs/progress.md) 和 [D02 交付说明](../../../docs/features/d02-contracts-and-test-site.md)。注释使用中文，运行验证使用 Node 22，沿用每功能 push dev 后暂停 review 的流程。

## 协议边界

- 只从 `@riqvo/contracts` 公共入口导入类型及校验函数；schema 内部文件不作为外部 API。
- 任务、用例版本和环境版本是运行快照。逻辑站点 + 相对路径 + 独立 query 解析 URL，不通过替换字符串切换环境。缺少变量/站点必须失败，不修改原用例。
- 使用 Zod 严格对象和动作联合；未知协议版本、额外字段、重复步骤 ID 必须拒绝。协议演进同步兼容策略、文档、样例和公共行为测试。
- 任何动作、定位、运行模式或产物能力缺失，预检返回 unsupported，不能返回部分可执行步骤或静默降级。样例声明不等于真实驱动能力。
- 最终通过要求完整步骤全部通过且有业务断言。无断言/跳过是 unverified；错误、取消和不支持分开表示。结果须绑定 taskId/attempt，保持时序和步骤归属。
- 产物只传不透明引用及 available/missing/expired，不传本地路径。诊断使用固定错误代码和诊断 ID；不要在异常中打印输入、凭据或模型 Key。
- 事件校验是无状态的；实际去重、排序、投递和状态机由后续任务模块负责。URL 解析不是环境权限或网络安全边界。

## 站点与验证

`pnpm fixture:start` 构建并启动两个回环实例，端口 4174/4175。自定义命令见 D02 说明。使用公开演示账号 tester / riqvo-demo；不得输入真实凭据或个人信息。实例内存、会话 Cookie 和记录隔离，不使用平台数据库；重启清空。

测试目标保留原生控件与可访问标签；平台管理界面仍使用 Vue/Naive UI。文件选择、iframe 和新标签页用于后续驱动验收，D02 不等于已经实现这些驱动动作。

运行 `pnpm lint`、`pnpm typecheck`、`pnpm format:check`、`RIQVO_CHROMIUM_EXECUTABLE=/usr/bin/chromium pnpm test`。公共协议行为测试位于 tests/contracts.test.mjs，真实站点验收位于 tests/test-site.test.mjs；后者创建随机端口实例并清理，仅有固定样例所需的测试适配，不能当成产品驱动复用。数据库相关变更再运行 `pnpm test:integration`，保留 MySQL 8.0.26 约束。

以 HTTP、真实浏览器和公开 contracts 为测试边界，不直接测试私有函数。设备能力必须由实际设备单独验收，不能用 viewport 布局替代。
