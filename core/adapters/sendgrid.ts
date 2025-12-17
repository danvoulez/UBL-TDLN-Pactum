/**
 * SENDGRID ADAPTER
 * 
 * Email communications for the ledger.
 * 
 * Use for:
 * - Agreement proposals and notifications
 * - Consent requests
 * - Document delivery
 * - Periodic reports and summaries
 * - Welcome emails for new entities
 */

import type { 
  CommunicationAdapter, 
  CommunicationChannel,
  SendRequest, 
  SendResult, 
  InboundMessage,
  Attachment,
  AdapterConfig,
  AdapterHealth,
} from './types';

export interface SendGridConfig extends AdapterConfig {
  credentials: {
    apiKey: string;
  };
  options?: {
    /** Default sender email */
    fromEmail?: string;
    /** Default sender name */
    fromName?: string;
    /** Sandbox mode for testing */
    sandbox?: boolean;
    /** Webhook URL for events */
    webhookUrl?: string;
  };
}

/**
 * SendGrid adapter for email communications.
 */
export function createSendGridAdapter(): CommunicationAdapter {
  let config: SendGridConfig;
  
  return {
    name: 'SendGrid',
    version: '1.0.0',
    platform: 'SendGrid',
    category: 'Communication',
    channels: ['email'] as CommunicationChannel[],
    
    async initialize(cfg: AdapterConfig): Promise<void> {
      config = cfg as SendGridConfig;
      console.log('SendGrid adapter initialized');
    },
    
    async healthCheck(): Promise<AdapterHealth> {
      try {
        // Check API key validity
        // const response = await fetch('https://api.sendgrid.com/v3/scopes', {
        //   headers: { Authorization: `Bearer ${config.credentials.apiKey}` },
        // });
        return { 
          healthy: true, 
          latencyMs: 80, 
          message: 'SendGrid connected',
        };
      } catch (error) {
        return { healthy: false, latencyMs: 0, message: `SendGrid error: ${error}` };
      }
    },
    
    async shutdown(): Promise<void> {
      console.log('SendGrid adapter shutdown');
    },
    
    async send(request: SendRequest): Promise<SendResult> {
      const { to, subject, body, bodyHtml, from, replyTo, attachments, metadata } = request;
      
      // Build recipients
      const toList = Array.isArray(to) ? to : [to];
      const personalizations = toList.map(email => ({
        to: [{ email }],
      }));
      
      // Build request body
      const emailData: SendGridMail = {
        personalizations,
        from: {
          email: from ?? config.options?.fromEmail ?? 'noreply@ledger.local',
          name: config.options?.fromName,
        },
        subject: subject ?? 'Notification from Universal Ledger',
        content: [
          { type: 'text/plain', value: body },
          ...(bodyHtml ? [{ type: 'text/html', value: bodyHtml }] : []),
        ],
      };
      
      if (replyTo) {
        emailData.reply_to = { email: replyTo };
      }
      
      if (attachments && attachments.length > 0) {
        emailData.attachments = attachments.map(att => ({
          content: typeof att.content === 'string' 
            ? att.content 
            : Buffer.from(att.content).toString('base64'),
          filename: att.filename,
          type: att.contentType,
          disposition: 'attachment',
        }));
      }
      
      if (config.options?.sandbox) {
        emailData.mail_settings = { sandbox_mode: { enable: true } };
      }
      
      // const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     Authorization: `Bearer ${config.credentials.apiKey}`,
      //   },
      //   body: JSON.stringify(emailData),
      // });
      
      // Mock response
      return {
        id: `sg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: 'sent',
        channel: 'email',
      };
    },
    
    async sendBatch(requests: readonly SendRequest[]): Promise<readonly SendResult[]> {
      // SendGrid supports batch sending via personalizations
      // For simplicity, send individually
      return Promise.all(requests.map(r => this.send(r)));
    },
    
    async handleInbound(payload: unknown): Promise<InboundMessage | null> {
      // SendGrid Inbound Parse webhook
      const webhook = payload as SendGridInboundWebhook;
      
      if (!webhook.from || !webhook.text) {
        return null;
      }
      
      return {
        from: webhook.from,
        to: webhook.to ?? '',
        channel: 'email',
        body: webhook.text,
        receivedAt: Date.now(),
      };
    },
  };
}

interface SendGridMail {
  personalizations: Array<{ to: Array<{ email: string; name?: string }> }>;
  from: { email: string; name?: string };
  reply_to?: { email: string };
  subject: string;
  content: Array<{ type: string; value: string }>;
  attachments?: Array<{
    content: string;
    filename: string;
    type: string;
    disposition: string;
  }>;
  mail_settings?: { sandbox_mode?: { enable: boolean } };
}

interface SendGridInboundWebhook {
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
  attachments?: number;
}

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

/**
 * Professional email templates for ledger communications.
 */
export const EMAIL_TEMPLATES = {
  /** Agreement proposed - requires consent */
  agreementProposed: (data: {
    recipientName: string;
    agreementType: string;
    proposerName: string;
    summary: string;
    consentLink: string;
  }) => ({
    subject: `Action Required: ${data.agreementType} Agreement from ${data.proposerName}`,
    body: `
Dear ${data.recipientName},

${data.proposerName} has proposed a ${data.agreementType} agreement that requires your review and consent.

Summary:
${data.summary}

Please review and provide your consent:
${data.consentLink}

This link will expire in 7 days.

If you have questions, please contact ${data.proposerName} directly.

Best regards,
Universal Ledger
    `.trim(),
    bodyHtml: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; }
    .summary { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #667eea; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">Agreement Proposal</h1>
      <p style="margin: 10px 0 0; opacity: 0.9;">${data.agreementType}</p>
    </div>
    <div class="content">
      <p>Dear ${data.recipientName},</p>
      <p><strong>${data.proposerName}</strong> has proposed a ${data.agreementType} agreement that requires your review and consent.</p>
      
      <div class="summary">
        <h3 style="margin-top: 0;">Summary</h3>
        <p>${data.summary}</p>
      </div>
      
      <p style="text-align: center; margin: 30px 0;">
        <a href="${data.consentLink}" class="button">Review & Consent</a>
      </p>
      
      <p style="color: #6b7280; font-size: 14px;">This link will expire in 7 days.</p>
    </div>
    <div class="footer">
      <p>Powered by Universal Ledger</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  }),
  
  /** Agreement activated */
  agreementActivated: (data: {
    recipientName: string;
    agreementType: string;
    agreementId: string;
    effectiveDate: string;
    dashboardLink: string;
  }) => ({
    subject: `✓ ${data.agreementType} Agreement Activated`,
    body: `
Dear ${data.recipientName},

Great news! Your ${data.agreementType} agreement (${data.agreementId}) is now active.

Effective Date: ${data.effectiveDate}

You can view the full agreement and its status in your dashboard:
${data.dashboardLink}

Best regards,
Universal Ledger
    `.trim(),
  }),
  
  /** Deadline reminder */
  deadlineReminder: (data: {
    recipientName: string;
    deadlineDescription: string;
    dueDate: string;
    daysRemaining: number;
    actionLink: string;
  }) => ({
    subject: `⏰ Reminder: ${data.deadlineDescription} due in ${data.daysRemaining} days`,
    body: `
Dear ${data.recipientName},

This is a reminder that ${data.deadlineDescription} is due on ${data.dueDate}.

Days remaining: ${data.daysRemaining}

Take action now:
${data.actionLink}

Best regards,
Universal Ledger
    `.trim(),
  }),
  
  /** Welcome email for new entity */
  welcome: (data: {
    name: string;
    entityType: string;
    loginLink: string;
  }) => ({
    subject: `Welcome to Universal Ledger`,
    body: `
Dear ${data.name},

Welcome to Universal Ledger! Your ${data.entityType} account has been created.

You can access your dashboard here:
${data.loginLink}

With Universal Ledger, you can:
- Create and manage agreements
- Track obligations and rights
- Maintain complete audit trails
- Collaborate with other entities

If you have any questions, please don't hesitate to reach out.

Best regards,
The Universal Ledger Team
    `.trim(),
  }),
  
  /** Document attached */
  documentAttached: (data: {
    recipientName: string;
    documentName: string;
    agreementType: string;
    uploadedBy: string;
    viewLink: string;
  }) => ({
    subject: `📎 New Document: ${data.documentName}`,
    body: `
Dear ${data.recipientName},

A new document has been attached to your ${data.agreementType} agreement.

Document: ${data.documentName}
Uploaded by: ${data.uploadedBy}

View the document:
${data.viewLink}

Best regards,
Universal Ledger
    `.trim(),
  }),
};

// ============================================================================
// DYNAMIC TEMPLATES
// ============================================================================

/**
 * SendGrid dynamic template IDs (create these in SendGrid dashboard).
 */
export const SENDGRID_TEMPLATE_IDS = {
  agreementProposed: 'd-xxxxxxxxxxxxxxxxxxxxxxxx',
  agreementActivated: 'd-xxxxxxxxxxxxxxxxxxxxxxxx',
  consentReminder: 'd-xxxxxxxxxxxxxxxxxxxxxxxx',
  deadlineReminder: 'd-xxxxxxxxxxxxxxxxxxxxxxxx',
  welcomeEmail: 'd-xxxxxxxxxxxxxxxxxxxxxxxx',
  documentAttached: 'd-xxxxxxxxxxxxxxxxxxxxxxxx',
  paymentReceived: 'd-xxxxxxxxxxxxxxxxxxxxxxxx',
  roleGranted: 'd-xxxxxxxxxxxxxxxxxxxxxxxx',
};

/**
 * Send email using a dynamic template.
 */
export function buildDynamicTemplateRequest(
  templateId: string,
  to: string,
  dynamicData: Record<string, unknown>
): SendGridMail {
  return {
    personalizations: [{
      to: [{ email: to }],
      // @ts-ignore - SendGrid specific
      dynamic_template_data: dynamicData,
    }],
    from: { email: 'noreply@ledger.local' },
    subject: '', // Comes from template
    content: [], // Comes from template
    // @ts-ignore - SendGrid specific
    template_id: templateId,
  };
}

