import { z } from 'zod';

/** 通用码使用 0/4xxxx/5xxxx，业务码使用 1xxxxx；已发布编号不可复用。 */
export const API_CODES = {
  SUCCESS: 0,
  BAD_REQUEST: 40000,
  UNAUTHORIZED: 40100,
  FORBIDDEN: 40300,
  NOT_FOUND: 40400,
  METHOD_NOT_ALLOWED: 40500,
  CONFLICT: 40900,
  JSON_REQUIRED: 41500,
  RATE_LIMITED: 42900,
  INTERNAL_ERROR: 50000,
  PLATFORM_UNAVAILABLE: 50200,
  SERVICE_UNAVAILABLE: 50300,
  INVALID_TASK: 100001,
  UNSUPPORTED: 100002,
  BUSY: 100003,
  NOT_RECORDING: 100004,
} as const;
export type ApiCode = (typeof API_CODES)[keyof typeof API_CODES];
/** 前后端共用的默认提示，不包含异常堆栈或敏感载荷。 */
export const API_MESSAGES: Record<ApiCode, string> = {
  0: '操作成功',
  40000: '请求参数无效',
  40100: '请先登录',
  40300: '无权执行此操作',
  40400: '资源不存在',
  40500: '不支持此请求方法',
  40900: '当前状态不允许此操作',
  41500: '请使用 JSON 请求',
  42900: '请求过于频繁，请稍后重试',
  50000: '服务内部错误',
  50200: '无法连接平台服务',
  50300: '服务暂不可用',
  100001: '步骤、环境或变量无效',
  100002: '当前设备不支持此操作',
  100003: '浏览器正在使用中，请先停止录制或回放',
  100004: '当前没有进行中的录制',
};
/** 所有 JSON API 的响应结构；无返回内容时 data 为 null。 */
export interface ApiResponse<T> {
  code: ApiCode;
  data: T;
  message: string;
}
/** 构造稳定的公共响应。 */
export function apiResponse<T>(data: T, code: ApiCode = API_CODES.SUCCESS): ApiResponse<T> {
  return { code, data, message: API_MESSAGES[code] };
}
/** HTTP 状态保留传输语义，业务码独立维护。 */
export function codeForStatus(status: number): ApiCode {
  const codes: Record<number, ApiCode> = {
    400: 40000,
    401: 40100,
    403: 40300,
    404: 40400,
    405: 40500,
    409: 40900,
    415: 41500,
    429: 42900,
    502: 50200,
    503: 50300,
  };
  return status < 400 ? API_CODES.SUCCESS : (codes[status] ?? API_CODES.INTERNAL_ERROR);
}
/** 校验来自网络的响应外壳，具体 data 仍由业务协议校验。 */
export function parseApiResponse(input: unknown): ApiResponse<unknown> {
  const value = z
    .object({ code: z.number().int(), data: z.unknown(), message: z.string() })
    .strict()
    .parse(input);
  if (!Object.hasOwn(API_MESSAGES, value.code) || !Object.hasOwn(value, 'data'))
    throw new Error('INVALID_API_RESPONSE');
  return value as ApiResponse<unknown>;
}
