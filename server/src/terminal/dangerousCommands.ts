export interface RuleResult {
  isDangerous: boolean;
  blocked: boolean;
  warning: boolean;
  level?: string;
  message?: string;
}

interface Rule {
  pattern: RegExp;
  level: 'critical' | 'high' | 'medium' | 'low';
  action: 'block' | 'confirm' | 'log';
  message: string;
}

const rules: Rule[] = [
  {
    pattern: /rm\s+-rf\s+\//i,
    level: 'critical',
    action: 'block',
    message: '危险命令拦截: rm -rf / 会删除所有文件',
  },
  {
    pattern: /:\(\)\s*\{\s*:\s*\|:&\s*\}\s*;:/,
    level: 'critical',
    action: 'block',
    message: '危险命令拦截: Fork Bomb 会导致系统拒绝服务',
  },
  {
    pattern: /drop\s+table\s+\w+/i,
    level: 'high',
    action: 'confirm',
    message: '警告: DROP TABLE 会删除数据库表',
  },
  {
    pattern: /truncate\s+table\s+\w+/i,
    level: 'high',
    action: 'confirm',
    message: '警告: TRUNCATE TABLE 会清空表数据',
  },
  {
    pattern: /shutdown\s+-/i,
    level: 'high',
    action: 'block',
    message: '危险命令拦截: shutdown 命令会导致系统关闭',
  },
  {
    pattern: /DROP\s+DATABASE/i,
    level: 'medium',
    action: 'confirm',
    message: '警告: DROP DATABASE 会删除整个数据库',
  },
  {
    pattern: />\s*\/dev\/sda/i,
    level: 'medium',
    action: 'block',
    message: '危险命令拦截: 写入 /dev/sda 会破坏磁盘数据',
  },
  {
    pattern: /DELETE\s+FROM\s+\w+\s+WHERE/i,
    level: 'low',
    action: 'log',
    message: '注意: DELETE 操作会影响数据',
  },
];

export function checkDangerousCommand(command: string): RuleResult {
  const trimmed = command.trim();

  for (const rule of rules) {
    if (rule.pattern.test(trimmed)) {
      return {
        isDangerous: true,
        blocked: rule.action === 'block',
        warning: rule.action === 'confirm',
        level: rule.level,
        message: rule.message,
      };
    }
  }

  return {
    isDangerous: false,
    blocked: false,
    warning: false,
  };
}
