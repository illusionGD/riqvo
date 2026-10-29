/** 公共就绪接口返回的依赖状态。 */
export type DependencyStatus = 'ready' | 'unavailable' | 'migration_required';

/** 公共健康快照，不包含私有配置。 */
export interface HealthSnapshot {
  /** 已配置后端依赖的整体就绪状态。 */
  status: 'ready' | 'unavailable';
  /** 用于校验已配置 API 响应来源的服务标识。 */
  service: 'riqvo-api';
  /** 独立的后端依赖探针；API 进程存活另行检查。 */
  checks: { mysql: DependencyStatus; redis: DependencyStatus; artifacts: DependencyStatus };
}
