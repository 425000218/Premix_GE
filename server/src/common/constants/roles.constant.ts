/**
 * Danh mục 4 vai trò khởi tạo mặc định của hệ thống
 */
export const ROLES = {
  ADMIN: 'ADMIN',
  PLANNER: 'PLANNER',
  FACTORY: 'FACTORY',
  VIEWER: 'VIEWER',
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

export const FACTORY_SCOPES = {
  ALL: 'ALL',
  ASSIGNED: 'ASSIGNED',
} as const;

export type FactoryScope = (typeof FACTORY_SCOPES)[keyof typeof FACTORY_SCOPES];
