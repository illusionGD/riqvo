/** Dependency states returned by the public readiness endpoint. */
export type DependencyStatus = 'ready' | 'unavailable' | 'migration_required';

/** Public health snapshot; deliberately contains no private configuration. */
export interface HealthSnapshot {
  /** Aggregate readiness of the configured backend dependencies. */
  status: 'ready' | 'unavailable';
  /** Identifier checked before trusting a response from the configured API. */
  service: 'riqvo-api';
  /** Independent backend probes; the API's own liveness is checked separately. */
  checks: { mysql: DependencyStatus; redis: DependencyStatus; artifacts: DependencyStatus };
}
