/**
 * Danh mục 27 mã quyền chuẩn hệ thống (9 nhóm quyền)
 * Bất biến theo đặc tả kỹ thuật PremixTrack
 */
export const PERMISSIONS = {
  // 1. Tổng quan
  DASHBOARD_VIEW: 'dashboard.view',

  // 2. Vị thế
  POSITION_VIEW: 'position.view',
  DEMAND_OVERRIDE_EDIT: 'demand-override.edit',

  // 3. Nạp dữ liệu
  IMPORT_VIEW: 'import.view',
  IMPORT_RUN: 'import.run',

  // 4. Danh mục
  CATALOG_VIEW: 'catalog.view',
  MATERIAL_EDIT: 'material.edit',
  SUPPLIER_EDIT: 'supplier.edit',
  FACTORY_MATERIAL_EDIT: 'factory-material.edit',
  THRESHOLD_EDIT: 'threshold.edit',
  SYSTEM_CONFIG_EDIT: 'system-config.edit',

  // 5. Tồn bị khóa
  BLOCK_VIEW: 'block.view',
  BLOCK_CREATE: 'block.create',
  BLOCK_RELEASE: 'block.release',

  // 6. Kế hoạch giao
  DELIVERY_PLAN_VIEW: 'delivery-plan.view',
  DELIVERY_PLAN_EDIT: 'delivery-plan.edit',

  // 7. Đề nghị mua
  PURCHASE_REQUEST_VIEW: 'purchase-request.view',
  PURCHASE_REQUEST_CREATE: 'purchase-request.create',
  PURCHASE_REQUEST_STATUS: 'purchase-request.status',
  PURCHASE_REQUEST_EXPORT: 'purchase-request.export',

  // 8. Người dùng & Vai trò
  USER_VIEW: 'user.view',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  ROLE_VIEW: 'role.view',
  ROLE_MANAGE: 'role.manage',

  // 9. Hệ thống
  API_DOCS_VIEW: 'api-docs.view',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionCode[] = Object.values(PERMISSIONS);
