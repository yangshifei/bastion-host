import React from 'react';
import { Switch } from 'tdesign-react';

interface RecordingSwitchProps {
  value: boolean;
  onChange: (enabled: boolean) => void;
  size?: 'small' | 'medium' | 'large';
}

/** 会话回放开关 — 统一堡垒机主题样式 */
export const RecordingSwitch: React.FC<RecordingSwitchProps> = ({
  value,
  onChange,
  size = 'medium',
}) => (
  <Switch
    className="bastion-recording-switch"
    size={size}
    value={value}
    onChange={(v) => onChange(Boolean(v))}
  />
);
