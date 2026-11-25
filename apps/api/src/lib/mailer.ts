import { env } from '../config/env.js';
import { logger } from './logger.js';

export interface SendMailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendMailResult {
  delivered: boolean;
  mode: 'console' | 'resend';
  id?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendMail({
  to,
  subject,
  html,
  text
}: SendMailParams): Promise<SendMailResult> {
  const resendKey = env.resendApiKey.trim();

  if (env.mailProvider === 'resend' && resendKey.length > 0) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: env.mailFrom,
          to: [to],
          subject,
          html,
          text
        })
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        logger.error(
          { status: response.status, to, subject, errorBody: errorBody.slice(0, 300) },
          'Resend email delivery failed'
        );
        return { delivered: false, mode: 'resend' };
      }

      const payload = (await response.json().catch(() => null)) as { id?: string } | null;
      return {
        delivered: true,
        mode: 'resend',
        ...(payload?.id ? { id: payload.id } : {})
      };
    } catch (err: unknown) {
      logger.error({ err, to, subject }, 'Resend email request threw an error');
      return { delivered: false, mode: 'resend' };
    }
  }

  logger.info({ to, subject, mode: 'console' }, 'Email handled by console mailer');
  return { delivered: false, mode: 'console' };
}

export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<SendMailResult> {
  const safeName = escapeHtml(params.name || 'User');
  const safeUrl = escapeHtml(params.resetUrl);

  const subject = 'Reset your EdumenAI password';
  const text = [
    `Hi ${params.name || 'User'},`,
    '',
    'We received a request to reset your EdumenAI password.',
    `Open this link within 60 minutes to choose a new password: ${params.resetUrl}`,
    '',
    'If you did not request a password reset, you can safely ignore this message.'
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #18181b; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 12px; font-size: 20px;">Reset your EdumenAI password</h2>
      <p style="margin: 0 0 16px; line-height: 1.5; color: #3f3f46;">Hi ${safeName},</p>
      <p style="margin: 0 0 20px; line-height: 1.5; color: #3f3f46;">
        We received a request to reset the password for your EdumenAI account. This link expires in 60 minutes.
      </p>
      <p style="margin: 0 0 24px;">
        <a href="${safeUrl}" style="display: inline-block; background: #18181b; color: #ffffff; text-decoration: none; font-weight: 600; padding: 10px 18px; border-radius: 10px;">
          Reset Password
        </a>
      </p>
      <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #71717a;">
        If the button does not work, copy and paste this URL into your browser:<br />
        <span style="word-break: break-all;">${safeUrl}</span>
      </p>
    </div>
  `.trim();

  return sendMail({
    to: params.to,
    subject,
    html,
    text
  });
}
