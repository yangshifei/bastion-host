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
    message: '危险命令已拦截: rm -rf / 会删除所有文件',
  },
  {
    pattern: /rm\s+-rf\s+\*/i,
    level: 'critical',
    action: 'block',
    message: '危险命令已拦截: rm -rf * 会删除当前目录所有文件',
  },
  {
    pattern: /rm\s+-rf\s+\.[/*]/i,
    level: 'critical',
    action: 'block',
    message: '危险命令已拦截: rm -rf 递归删除操作',
  },
  {
    pattern: /chmod\s+(-R\s+)?777\s+\//i,
    level: 'critical',
    action: 'block',
    message: '危险命令已拦截: chmod 777 / 会破坏系统权限',
  },
  {
    pattern: />\s*\/dev\/sd[a-z]/i,
    level: 'critical',
    action: 'block',
    message: '危险命令已拦截: 写入磁盘设备会破坏数据',
  },
  {
    pattern: /dd\s+if=/i,
    level: 'high',
    action: 'confirm',
    message: '警告: dd 操作可能覆盖数据，请确认目标设备',
  },
  {
    pattern: /:\s*\(\)\s*\{/i,
    level: 'critical',
    action: 'block',
    message: '危险命令已拦截: Fork Bomb 会导致系统拒绝服务',
  },
  {
    pattern: /shutdown\s+-/i,
    level: 'high',
    action: 'block',
    message: '危险命令已拦截: shutdown 命令会导致系统关闭',
  },
  {
    pattern: /reboot/i,
    level: 'high',
    action: 'block',
    message: '危险命令已拦截: reboot 命令会导致系统重启',
  },
  {
    pattern: /halt\b/i,
    level: 'high',
    action: 'block',
    message: '危险命令已拦截: halt 命令会导致系统关机',
  },
  {
    pattern: /mkfs\.\w+\s+\/dev/i,
    level: 'critical',
    action: 'block',
    message: '危险命令已拦截: 格式化磁盘设备',
  },
  {
    pattern: /fdisk\s+\/dev/i,
    level: 'high',
    action: 'block',
    message: '危险命令已拦截: fdisk 磁盘分区操作',
  },
  {
    pattern: /iptables\s+-F/i,
    level: 'high',
    action: 'confirm',
    message: '警告: iptables -F 会清空所有防火墙规则',
  },
  {
    pattern: /DROP\s+DATABASE/i,
    level: 'high',
    action: 'block',
    message: '危险命令已拦截: DROP DATABASE 会删除整个数据库',
  },
  {
    pattern: /DROP\s+TABLE/i,
    level: 'high',
    action: 'confirm',
    message: '警告: DROP TABLE 会删除数据库表',
  },
  {
    pattern: /TRUNCATE\s+(TABLE\s+)?\w+/i,
    level: 'high',
    action: 'confirm',
    message: '警告: TRUNCATE 会清空表数据',
  },
  {
    pattern: /DELETE\s+FROM\s+\w+/i,
    level: 'medium',
    action: 'log',
    message: '注意: DELETE 操作会影响数据',
  },
  {
    pattern: /UPDATE\s+\w+\s+SET/i,
    level: 'low',
    action: 'log',
    message: '注意: 批量 UPDATE 操作',
  },
  {
    pattern: /wget\s+.*\|\s*(ba)?sh/i,
    level: 'critical',
    action: 'block',
    message: '危险命令已拦截: 远程脚本直接执行，可能下载恶意代码',
  },
  {
    pattern: /curl\s+.*\|\s*(ba)?sh/i,
    level: 'critical',
    action: 'block',
    message: '危险命令已拦截: 远程脚本直接执行，可能下载恶意代码',
  },
  {
    pattern: /chown\s+-R\s+\w+\s+\//i,
    level: 'high',
    action: 'confirm',
    message: '警告: chown -R / 会改变系统文件所有权',
  },
  {
    pattern: /\bpasswd\b/i,
    level: 'medium',
    action: 'log',
    message: '注意: passwd 密码修改操作',
  },
  {
    pattern: /useradd|userdel|usermod/i,
    level: 'medium',
    action: 'log',
    message: '注意: 用户管理操作',
  },
  {
    pattern: /kill\s+-9\s+/i,
    level: 'low',
    action: 'log',
    message: '注意: kill -9 强制终止进程',
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
