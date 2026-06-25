import React, { useCallback, useEffect, useState } from 'react';
import { Input, Button } from 'tdesign-react';
import { RefreshIcon } from 'tdesign-icons-react';
import { securityService } from '../services/securityService';

interface CaptchaChallengeProps {
  captchaId: string;
  question: string;
  answer: string;
  onAnswerChange: (answer: string) => void;
  onCaptchaLoaded: (id: string, question: string) => void;
}

export const CaptchaChallenge: React.FC<CaptchaChallengeProps> = ({
  captchaId,
  question,
  answer,
  onAnswerChange,
  onCaptchaLoaded,
}) => {
  const [loading, setLoading] = useState(false);

  const loadCaptcha = useCallback(async () => {
    setLoading(true);
    try {
      const res = await securityService.getCaptcha();
      if (res.code === 0 && res.data) {
        onCaptchaLoaded(res.data.challenge_id, res.data.question);
        onAnswerChange('');
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [onAnswerChange, onCaptchaLoaded]);

  useEffect(() => {
    if (!captchaId) {
      loadCaptcha();
    }
  }, [captchaId, loadCaptcha]);

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-500 mb-1">安全验证</div>
        <div className="flex items-center gap-2">
          <code className="text-sm text-cyan-400 bg-slate-800/60 px-2 py-1 rounded shrink-0">
            {question || '加载中...'}
          </code>
          <Button
            variant="text"
            size="small"
            icon={<RefreshIcon className={loading ? 'animate-spin' : ''} />}
            loading={loading}
            onClick={loadCaptcha}
          />
        </div>
      </div>
      <Input
        value={answer}
        onChange={onAnswerChange}
        placeholder="答案"
        size="large"
        style={{ width: 88 }}
      />
    </div>
  );
};
