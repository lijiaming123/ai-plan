export const HIGH_RISK_AUDIT_ACTIONS = [
  'rbac.admin.create',
  'rbac.admin.update',
  'rbac.admin.disable',
  'rbac.admin.enable',
  'rbac.admin.reset_password',
  'rbac.change',
  'analytics.export',
  'audit.export',
  'rules.update',
  'user.plan_tier',
] as const;

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'rbac.admin.create': '创建管理员',
  'rbac.admin.update': '更新管理员',
  'rbac.admin.disable': '禁用管理员',
  'rbac.admin.enable': '启用管理员',
  'rbac.admin.reset_password': '重置管理员密码',
  'rbac.change': '权限变更',
  'analytics.export': '分析导出',
  'audit.export': '审计导出',
  'rules.update': '规则更新',
  'user.plan_tier': '会员档位调整',
};

export function isHighRiskAuditAction(action: string) {
  const a = action.toLowerCase();
  return (
    HIGH_RISK_AUDIT_ACTIONS.some((x) => a === x.toLowerCase()) ||
    a.includes('rbac') ||
    a.includes('export') ||
    a.includes('disable')
  );
}

export function auditActionLabel(action: string) {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
