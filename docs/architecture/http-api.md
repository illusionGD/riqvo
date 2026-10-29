# HTTP JSON 响应约定

平台 NestJS 和本机 PC 执行器的 JSON API 统一返回 `{ code: number, data, message: string }`。成功码为 `0`；无数据时返回 `null`，字段不省略。HTTP 状态仍保留 400/403/404/409/500/503 等语义，不将失败统一返回 HTTP 200。

```json
{ "code": 0, "data": { "accepted": true }, "message": "操作成功" }
```

```json
{ "code": 100004, "data": null, "message": "当前没有进行中的录制" }
```

唯一维护入口为 `packages/contracts/src/http.ts`，从 `@riqvo/contracts` 导入：

- `API_CODES`：具名数字码；通用错误使用 4xxxx/5xxxx，业务错误使用 1xxxxx。新增业务必须分配唯一编号，不复用已发布编号。
- `API_MESSAGES`：对应的默认中文提示；前端依据 code 判断行为和显示提示，不依据 message 做业务分支。
- `ApiResponse<T>`、`apiResponse`：响应类型及构造函数。
- `parseApiResponse`：网络外壳校验；各业务仍校验自己的 data。

通用错误包括参数无效、未登录、禁止访问、不存在、方法不支持、状态冲突、JSON 类型错误、限流、内部错误、平台不可连接、服务暂不可用。当前业务错误包括任务无效（100001）、能力不支持（100002）、浏览器忙（100003）、未在录制（100004）。新增错误同时更新具名常量与提示表；不把异常堆栈、凭据或原始请求内容作为 message。

NestJS 使用全局成功拦截器和异常过滤器，包括框架生成的错误。执行器经公共 JSON 写入函数封装；健康检查代理透传已经校验的外壳，避免重复包装。健康检查 503 的 data 保留依赖检查结果，供系统状态展示。

SSE 成功连接仍为事件流，媒体成功下载仍为二进制及 Range 响应，HTML/静态资源及重定向遵循原协议；其 JSON 错误使用统一格式。演示站属于测试目标，不是平台 API，保留自身协议。测试步骤结果中的错误码属于测试结果协议，不与 HTTP 错误码混用。

开发模式下 Web、NestJS、PC 执行器都读取共享源码，错误码修改无需手动 build。构建模式仍使用工作区构建产物。本次是 JSON 返回结构的兼容性变更，直接调用旧 API 的客户端需改为读取 data。
