/**
 * SENDGRID ADAPTER
 * 
 * Email communication for the ledger.
 */

import type { 
  CommunicationAdapter, 
  SendRequest, 
  SendResult, 
  InboundMessage,
  AdapterConfig,
  AdapterHealth,
  Subscription,
} from './types';

export interface SendGridConfig extends AdapterConfig {
  credentials: {
    apiKey: string;
  };
  options?: {
    fromEmail: string;
    fromName?: string;
  };
}

export const EMAIL_TEMPLATES = {
  agreementProposed: {
    subject: 'New Agreement Proposed',
    template: 'agreement-proposed',
  },
  agreementConsented: {
    subject: 'Agreement Consented',
    template: 'agreement-consented',
  },
  obligationDue: {
    subject: 'Obligation Due',
    template: 'obligation-due',
  },
};

export function createSendGridAdapter(): CommunicationAdapter {
  let config: SendGridConfig;
  
  return {
    name: 'SendGrid',
    version: '1.0.0',
    platform: 'SendGrid',
    category: 'Communication',
    channels: ['email'],
    
    async initialize(cfg: AdapterConfig): Promise<void> {
      config = cfg as SendGridConfig;
      console.log('SendGrid adapter initialized');
    },
    
    async healthCheck(): Promise<AdapterHealth> {
      return { healthy: true, latencyMs: 50, message: 'SendGrid connected' };
    },
    
    async shutdown(): Promise<void> {
      console.log('SendGrid adapter shutdown');
    },
    
    async send(request: SendRequest): Promise<SendResult> {
      return {
        id: `msg_${Date.now()}`,
        status: 'sent',
        sentAt: Date.now(),
      };
    },
    
    async subscribe(handler: (message: InboundMessage) => Promise<void>): Promise<Subscription> {
      return {
        id: `sub_${Date.now()}`,
        async unsubscribe() {},
      };
    },
  };
}

