import React, { useState, useEffect } from 'react';
import { Select } from 'tdesign-react';
import { assetService } from '../services/assetService';
import type { SafeAsset } from '../types';

interface Props {
  value?: number;
  onChange?: (assetId: number, asset: SafeAsset) => void;
  protocol?: 'ssh' | 'rdp';
  placeholder?: string;
  disabled?: boolean;
}

export const AssetSelector: React.FC<Props> = ({
  value,
  onChange,
  protocol,
  placeholder = '选择资产...',
  disabled = false,
}) => {
  const [assets, setAssets] = useState<SafeAsset[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAssets = async () => {
      setLoading(true);
      try {
        const res = await assetService.getList({
          pageSize: 200,
          protocol: protocol || undefined,
          status: 'online',
        });
        if (res.code === 0 && res.data) {
          setAssets(res.data.list);
        }
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    };
    fetchAssets();
  }, [protocol]);

  const options = assets.map((a) => ({
    value: a.id,
    label: `${a.name} (${a.host}:${a.port}) [${a.protocol.toUpperCase()}]`,
  }));

  return (
    <Select
      value={value}
      options={options}
      placeholder={placeholder}
      disabled={disabled || loading}
      loading={loading}
      filterable
      onChange={(val) => {
        const asset = assets.find((a) => a.id === val);
        if (asset) onChange?.(val as number, asset);
      }}
      style={{ minWidth: 280 }}
    />
  );
};
