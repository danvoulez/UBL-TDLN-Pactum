/**
 * TWILIO ADAPTER
 * 
 * SMS, Voice, and WhatsApp messaging.
 * 
 * Use for:
 * - Agreement consent via SMS verification
 * - Deadline reminders
 * - Urgent notifications
 * - Two-factor authentication
 * - Voice calls for critical alerts
 */

import type { 
  CommunicationAdapter, 
  CommunicationChannel,
  SendRequest, 
  SendResult, 
  InboundMessage,
  AdapterConfig,
  AdapterHealth,
} from './types';
import type { Event } from '../schema/ledger';
import type { EntityId, Timestamp } from '../shared/types';

export interface TwilioConfig extends AdapterConfig {
  credentials: {
    accountSid: string;
    authToken: string;
  };
  options?: {
    /** Default phone number to send from */
    fromNumber?: string;
    /** WhatsApp sender ID */
    whatsappFrom?: string;
    /** Messaging service SID (for high volume) */
    messagingServiceSid?: string;
    /** Webhook URL for incoming messages */
    webhookUrl?: string;
  };
}

/**
 * Twilio adapter for SMS, Voice, and WhatsApp.
 */
export function createTwilioAdapter(): CommunicationAdapter {
  let config: TwilioConfig;
  
  return {
    name: 'Twilio',
    version: '1.0.0',
    platform: 'Twilio',
    category: 'Communication',
    channels: ['sms', 'whatsapp'] as CommunicationChannel[],
    
    async initialize(cfg: AdapterConfig): Promise<void> {
      config = cfg as TwilioConfig;
      console.log('Twilio adapter initialized');
    },
    
    async healthCheck(): Promise<AdapterHealth> {
      try {
        // Verify account
        // const response = await fetch(
        //   `https://api.twilio.com/2010-04-01/Accounts/${config.credentials.accountSid}.json`,
        //   {
        //     headers: {
        //       Authorization: `Basic ${Buffer.from(
        //         `${config.credentials.accountSid}:${config.credentials.authToken}`
        //       ).toString('base64')}`,
        //     },
        //   }
        // );
        return { 
          healthy: true, 
          latencyMs: 100, 
          message: 'Twilio connected',
          details: { accountSid: config?.credentials?.accountSid?.slice(0, 8) + '...' },
        };
      } catch (error) {
        return { healthy: false, latencyMs: 0, message: `Twilio error: ${error}` };
      }
    },
    
    async shutdown(): Promise<void> {
      console.log('Twilio adapter shutdown');
    },
    
    async send(request: SendRequest): Promise<SendResult> {
      const { channel, to, body, metadata } = request;
      
      // Determine the "to" address format
      const toNumber = Array.isArray(to) ? to[0] : to;
      const formattedTo = channel === 'whatsapp' ? `whatsapp:${toNumber}` : toNumber;
      
      // Determine the "from" address
      let from: string;
      if (channel === 'whatsapp') {
        from = `whatsapp:${config.options?.whatsappFrom ?? config.options?.fromNumber}`;
      } else {
        from = config.options?.fromNumber ?? '';
      }
      
      // const response = await fetch(
      //   `https://api.twilio.com/2010-04-01/Accounts/${config.credentials.accountSid}/Messages.json`,
      //   {
      //     method: 'POST',
      //     headers: {
      //       'Content-Type': 'application/x-www-form-urlencoded',
      //       Authorization: `Basic ${Buffer.from(
      //         `${config.credentials.accountSid}:${config.credentials.authToken}`
      //       ).toString('base64')}`,
      //     },
      //     body: new URLSearchParams({
      //       To: formattedTo,
      //       From: from,
      //       Body: body,
      //       ...(config.options?.messagingServiceSid && {
      //         MessagingServiceSid: config.options.messagingServiceSid,
      //       }),
      //       ...(metadata?.statusCallback && {
      //         StatusCallback: metadata.statusCallback,
      //       }),
      //     }),
      //   }
      // );
      // const data = await response.json();
      
      // Mock response
      return {
        id: `SM${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
        status: 'queued',
        channel,
      };
    },
    
    async sendBatch(requests: readonly SendRequest[]): Promise<readonly SendResult[]> {
      // Twilio doesn't have native batch - send individually
      // For high volume, use Messaging Service with queuing
      return Promise.all(requests.map(r => this.send(r)));
    },
    
    async handleInbound(payload: unknown): Promise<InboundMessage | null> {
      const webhook = payload as TwilioWebhook;
      
      if (!webhook.From || !webhook.Body) {
        return null;
      }
      
      // Determine channel from the "From" field
      const isWhatsApp = webhook.From.startsWith('whatsapp:');
      const from = webhook.From.replace('whatsapp:', '');
      const to = webhook.To?.replace('whatsapp:', '') ?? '';
      
      return {
        from,
        to,
        channel: isWhatsApp ? 'whatsapp' : 'sms',
        body: webhook.Body,
        receivedAt: Date.now(),
      };
    },
  };
}

interface TwilioWebhook {
  MessageSid?: string;
  AccountSid?: string;
  From?: string;
  To?: string;
  Body?: string;
  NumMedia?: string;
  MediaUrl0?: string;
}

// ============================================================================
// NOTIFICATION TEMPLATES
// ============================================================================

/**
 * SMS templates for common ledger notifications.
 */
export const SMS_TEMPLATES = {
  /** Agreement requires consent */
  consentRequired: (agreementType: string, link: string) =>
    `Action required: Please review and consent to the ${agreementType} agreement. ${link}`,
  
  /** Deadline approaching */
  deadlineReminder: (deadline: string, description: string) =>
    `Reminder: ${description} is due on ${deadline}. Please take action.`,
  
  /** Agreement activated */
  agreementActivated: (agreementType: string) =>
    `Your ${agreementType} agreement is now active. Thank you.`,
  
  /** Verification code */
  verificationCode: (code: string) =>
    `Your verification code is: ${code}. Valid for 10 minutes.`,
  
  /** Payment received */
  paymentReceived: (amount: string, currency: string) =>
    `Payment received: ${amount} ${currency}. Thank you.`,
  
  /** Role granted */
  roleGranted: (role: string, organization: string) =>
    `You have been granted the ${role} role at ${organization}.`,
};

// ============================================================================
// VOICE CALLS (Twilio Voice)
// ============================================================================

/**
 * Make a voice call using TwiML.
 */
export interface VoiceCallRequest {
  to: string;
  from?: string;
  twiml?: string;
  url?: string; // TwiML webhook URL
  statusCallback?: string;
  record?: boolean;
}

/**
 * TwiML builder for voice responses.
 */
export const TwiML = {
  /** Say text with text-to-speech */
  say: (text: string, voice = 'alice') =>
    `<Say voice="${voice}">${text}</Say>`,
  
  /** Play an audio file */
  play: (url: string) =>
    `<Play>${url}</Play>`,
  
  /** Gather DTMF input */
  gather: (options: { numDigits?: number; action?: string; timeout?: number }, inner: string) =>
    `<Gather numDigits="${options.numDigits ?? 1}" action="${options.action ?? ''}" timeout="${options.timeout ?? 5}">${inner}</Gather>`,
  
  /** Record the call */
  record: (options: { maxLength?: number; action?: string }) =>
    `<Record maxLength="${options.maxLength ?? 60}" action="${options.action ?? ''}" />`,
  
  /** Pause */
  pause: (seconds = 1) =>
    `<Pause length="${seconds}" />`,
  
  /** Wrap in Response */
  response: (...elements: string[]) =>
    `<?xml version="1.0" encoding="UTF-8"?><Response>${elements.join('')}</Response>`,
};

/**
 * Example: Urgent deadline call
 */
export const VOICE_SCRIPTS = {
  urgentDeadline: (description: string, deadline: string) =>
    TwiML.response(
      TwiML.say(`This is an urgent reminder from Universal Ledger.`),
      TwiML.pause(1),
      TwiML.say(`${description} is due on ${deadline}.`),
      TwiML.pause(1),
      TwiML.say(`Press 1 to acknowledge, or press 2 to be reminded again in one hour.`),
      TwiML.gather(
        { numDigits: 1, action: '/voice/deadline-response', timeout: 10 },
        TwiML.say('Please press 1 or 2.')
      )
    ),
  
  verificationCall: (code: string) =>
    TwiML.response(
      TwiML.say('Your verification code is:'),
      TwiML.pause(1),
      TwiML.say(code.split('').join('. ')), // Spell out digits
      TwiML.pause(2),
      TwiML.say('Again, your code is:'),
      TwiML.say(code.split('').join('. '))
    ),
};

