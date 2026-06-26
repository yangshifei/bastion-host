import nodemailer from 'nodemailer';
import { passwordPolicyService, SmtpConfig } from './passwordPolicyService';
import logger from '../utils/logger';

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

let _transporter: nodemailer.Transporter | null = null;
let _configHash = '';

async function getTransporter(config: SmtpConfig): Promise<nodemailer.Transporter> {
  if (!config.host) throw new Error('SMTP 未配置');
  const hash = `${config.host}:${config.port}:${config.user}`;
  if (_transporter && hash === _configHash) return _transporter;
  _transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure || false,
    auth: config.user ? { user: config.user, pass: config.password || '' } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
  _configHash = hash;
  return _transporter;
}

export const emailService = {
  async getSmtpConfig(): Promise<SmtpConfig> {
    return passwordPolicyService.getSmtpConfig();
  },

  async updateSmtpConfig(updates: Partial<SmtpConfig>): Promise<SmtpConfig> {
    _transporter = null;
    _configHash = '';
    return passwordPolicyService.updateSmtpConfig(updates);
  },

  async sendCode(email: string): Promise<{ code: string; error?: string }> {
    try {
      const config = await this.getSmtpConfig();
      const transporter = await getTransporter(config);
      const code = generateCode();
      await transporter.sendMail({
        from: `"${config.from_name || '堡垒机'}" <${config.from_address}>`,
        to: email,
        subject: '堡垒机登录验证码',
        text: `您的登录验证码是: ${code}\n\n此验证码 5 分钟内有效，请勿转发给他人。\n\n如非本人操作，请忽略此邮件并联系管理员。`,
      });
      logger.info({ email }, 'Verification code sent');
      return { code };
    } catch (err: any) {
      logger.error({ err, email }, 'Failed to send verification code');
      return { code: '', error: err.message };
    }
  },

  async sendTestEmail(to: string): Promise<{ success: boolean; error?: string }> {
    try {
      const config = await this.getSmtpConfig();
      const transporter = await getTransporter(config);
      await transporter.sendMail({
        from: `"${config.from_name || '堡垒机'}" <${config.from_address}>`,
        to,
        subject: 'SMTP 配置测试',
        text: '这是一封测试邮件。如果您收到此邮件，说明 SMTP 配置正确。',
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};
