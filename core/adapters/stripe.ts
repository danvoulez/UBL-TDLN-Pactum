/**
 * STRIPE ADAPTER
 * 
 * Transforms Stripe operations into ledger events.
 * 
 * Mapping:
 * - Stripe PaymentIntent → Payment Agreement
 * - Stripe Customer → Entity (Customer role)
 * - Stripe Subscription → Recurring Agreement
 * - Stripe Invoice → Obligation
 * - Payment succeeded → Obligation fulfilled
 * - Refund → Compensation Agreement
 * 
 * "A payment is just an agreement being fulfilled."
 */

import type { 
  PaymentAdapter, 
  PaymentIntentRequest, 
  PaymentIntent,
  PaymentResult,
  RefundResult,
  SubscriptionRequest,
  SubscriptionResult,
  PaymentEvent,
  AdapterConfig,
  AdapterHealth,
} from './types';
import type { Event } from '../schema/ledger';
import type { EntityId, Timestamp } from '../shared/types';
import Stripe from 'stripe';

export interface StripeConfig extends AdapterConfig {
  credentials: {
    secretKey: string;
    webhookSecret: string;
  };
  options?: {
    apiVersion?: string;
  };
}

/**
 * Stripe adapter implementation.
 */
export function createStripeAdapter(): PaymentAdapter {
  let config: StripeConfig;
  let stripe: Stripe | null = null;
  
  return {
    name: 'Stripe',
    version: '1.0.0',
    platform: 'Stripe',
    category: 'Payment',
    
    async initialize(cfg: AdapterConfig): Promise<void> {
      config = cfg as StripeConfig;
      
      if (!config.credentials.secretKey) {
        throw new Error('Stripe secret key not provided');
      }
      
      stripe = new Stripe(config.credentials.secretKey, {
        apiVersion: (config.options?.apiVersion as Stripe.LatestApiVersion) ?? '2025-11-17.clover',
      });
      
      console.log('Stripe adapter initialized');
    },
    
    async healthCheck(): Promise<AdapterHealth> {
      try {
        if (!stripe) {
          return { 
            healthy: false, 
            latencyMs: 0, 
            message: 'Stripe not initialized' 
          };
        }
        
        const startTime = Date.now();
        await stripe.balance.retrieve();
        const latencyMs = Date.now() - startTime;
        
        return { 
          healthy: true, 
          latencyMs, 
          message: 'Stripe connected' 
        };
      } catch (error: any) {
        return { 
          healthy: false, 
          latencyMs: 0, 
          message: `Stripe error: ${error.message || error}` 
        };
      }
    },
    
    async shutdown(): Promise<void> {
      console.log('Stripe adapter shutdown');
    },
    
    async createPaymentIntent(request: PaymentIntentRequest): Promise<PaymentIntent> {
      if (!stripe) {
        throw new Error('Stripe not initialized');
      }
      
      const intent = await stripe.paymentIntents.create({
        amount: request.amount,
        currency: request.currency,
        customer: request.customerId,
        metadata: {
          ...request.metadata,
          agreementId: request.agreementId || '',
        },
      });
      
      return {
        id: intent.id,
        clientSecret: intent.client_secret || '',
        status: intent.status,
        amount: intent.amount,
        currency: intent.currency,
      };
    },
    
    async confirmPayment(paymentIntentId: string): Promise<PaymentResult> {
      if (!stripe) {
        throw new Error('Stripe not initialized');
      }
      
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (intent.status !== 'succeeded') {
        throw new Error(`Payment not succeeded. Status: ${intent.status}`);
      }
      
      const charge = intent.latest_charge;
      let fee = 0;
      let net = intent.amount;
      
      if (charge && typeof charge === 'string') {
        const chargeDetails = await stripe.charges.retrieve(charge);
        fee = chargeDetails.balance_transaction 
          ? (await stripe.balanceTransactions.retrieve(chargeDetails.balance_transaction as string)).fee 
          : 0;
        net = intent.amount - fee;
      }
      
      return {
        id: paymentIntentId,
        status: intent.status === 'succeeded' ? 'succeeded' : intent.status === 'processing' ? 'processing' : intent.status === 'failed' ? 'failed' : 'pending',
        amount: intent.amount,
        fee,
        net,
        metadata: intent.metadata,
      };
    },
    
    async refund(paymentId: string, amount?: number): Promise<RefundResult> {
      if (!stripe) {
        throw new Error('Stripe not initialized');
      }
      
      const refund = await stripe.refunds.create({
        payment_intent: paymentId,
        amount,
      });
      
      return {
        id: refund.id,
        status: refund.status === 'succeeded' ? 'succeeded' : refund.status === 'failed' ? 'failed' : 'pending',
        amount: refund.amount,
      };
    },
    
    async createSubscription(request: SubscriptionRequest): Promise<SubscriptionResult> {
      if (!stripe) {
        throw new Error('Stripe not initialized');
      }
      
      const subscription = await stripe.subscriptions.create({
        customer: request.customerId,
        items: [{ price: request.priceId }],
        metadata: {
          ...request.metadata,
          agreementId: request.agreementId || '',
        },
      });
      
      const subData = await stripe.subscriptions.retrieve(subscription.id);
      
      return {
        id: subscription.id,
        status: subData.status === 'active' ? 'active' : subData.status === 'canceled' ? 'canceled' : 'past_due',
        currentPeriodStart: subData.current_period_start * 1000,
        currentPeriodEnd: subData.current_period_end * 1000,
      };
    },
    
    async cancelSubscription(subscriptionId: string): Promise<void> {
      if (!stripe) {
        throw new Error('Stripe not initialized');
      }
      
      await stripe.subscriptions.cancel(subscriptionId);
      console.log(`Subscription ${subscriptionId} cancelled`);
    },
    
    async handleWebhook(payload: unknown, signature: string): Promise<PaymentEvent> {
      if (!stripe) {
        throw new Error('Stripe not initialized');
      }
      
      if (!config.credentials.webhookSecret) {
        throw new Error('Stripe webhook secret not configured');
      }
      
      const event = stripe.webhooks.constructEvent(
        payload as string | Buffer,
        signature,
        config.credentials.webhookSecret
      );
      
      return {
        type: event.type,
        data: event.data.object,
        
        toLedgerEvent(): Event | null {
          switch (event.type) {
            case 'payment_intent.succeeded':
              return createPaymentSucceededEvent(event.data.object);
            
            case 'payment_intent.payment_failed':
              return createPaymentFailedEvent(event.data.object);
            
            case 'invoice.paid':
              return createInvoicePaidEvent(event.data.object);
            
            case 'customer.subscription.created':
              return createSubscriptionCreatedEvent(event.data.object);
            
            case 'customer.subscription.deleted':
              return createSubscriptionCancelledEvent(event.data.object);
            
            case 'charge.refunded':
              return createRefundEvent(event.data.object);
            
            default:
              return null;
          }
        },
      };
    },
  };
}

// ============================================================================
// EVENT TRANSFORMERS
// ============================================================================

function createPaymentSucceededEvent(paymentIntent: unknown): Event {
  const pi = paymentIntent as any;
  return {
    id: `evt_stripe_${pi.id}`,
    type: 'ObligationFulfilled',
    aggregateType: 'Agreement',
    aggregateId: pi.metadata?.agreementId ?? (`agr_stripe_${pi.id}` as EntityId),
    timestamp: Date.now(),
    version: 1,
    actor: { type: 'System', systemId: 'stripe-adapter' },
    payload: {
      obligationId: 'payment',
      fulfilledBy: pi.customer,
      evidence: {
        stripePaymentIntentId: pi.id,
        amount: pi.amount,
        currency: pi.currency,
        paymentMethod: pi.payment_method,
      },
    },
    causation: {
      eventId: `stripe_${pi.id}`,
      correlationId: pi.metadata?.correlationId,
    },
    hash: '',
  };
}

function createPaymentFailedEvent(paymentIntent: unknown): Event {
  const pi = paymentIntent as any;
  return {
    id: `evt_stripe_fail_${pi.id}`,
    type: 'PaymentFailed', // Custom event
    aggregateType: 'Agreement',
    aggregateId: pi.metadata?.agreementId ?? (`agr_stripe_${pi.id}` as EntityId),
    timestamp: Date.now(),
    version: 1,
    actor: { type: 'System', systemId: 'stripe-adapter' },
    payload: {
      stripePaymentIntentId: pi.id,
      failureCode: pi.last_payment_error?.code,
      failureMessage: pi.last_payment_error?.message,
    },
    causation: {
      eventId: `stripe_${pi.id}`,
    },
    hash: '',
  };
}

function createInvoicePaidEvent(invoice: unknown): Event {
  const inv = invoice as any;
  return {
    id: `evt_stripe_inv_${inv.id}`,
    type: 'ObligationFulfilled',
    aggregateType: 'Agreement',
    aggregateId: inv.subscription_details?.metadata?.agreementId ?? (`agr_stripe_sub_${inv.subscription}` as EntityId),
    timestamp: Date.now(),
    version: 1,
    actor: { type: 'System', systemId: 'stripe-adapter' },
    payload: {
      obligationId: `invoice_${inv.id}`,
      fulfilledBy: inv.customer,
      evidence: {
        stripeInvoiceId: inv.id,
        amountPaid: inv.amount_paid,
        currency: inv.currency,
        periodStart: inv.period_start,
        periodEnd: inv.period_end,
      },
    },
    hash: '',
  };
}

function createSubscriptionCreatedEvent(subscription: unknown): Event {
  const sub = subscription as any;
  return {
    id: `evt_stripe_sub_${sub.id}`,
    type: 'AgreementActivated',
    aggregateType: 'Agreement',
    aggregateId: sub.metadata?.agreementId ?? (`agr_stripe_sub_${sub.id}` as EntityId),
    timestamp: Date.now(),
    version: 1,
    actor: { type: 'System', systemId: 'stripe-adapter' },
    payload: {
      stripeSubscriptionId: sub.id,
      customerId: sub.customer,
      status: sub.status,
      currentPeriodStart: sub.current_period_start * 1000,
      currentPeriodEnd: sub.current_period_end * 1000,
    },
    hash: '',
  };
}

function createSubscriptionCancelledEvent(subscription: unknown): Event {
  const sub = subscription as any;
  return {
    id: `evt_stripe_sub_cancel_${sub.id}`,
    type: 'AgreementTerminated',
    aggregateType: 'Agreement',
    aggregateId: sub.metadata?.agreementId ?? (`agr_stripe_sub_${sub.id}` as EntityId),
    timestamp: Date.now(),
    version: 1,
    actor: { type: 'System', systemId: 'stripe-adapter' },
    payload: {
      reason: 'Subscription cancelled',
      stripeSubscriptionId: sub.id,
      canceledAt: sub.canceled_at * 1000,
    },
    hash: '',
  };
}

function createRefundEvent(charge: unknown): Event {
  const ch = charge as any;
  return {
    id: `evt_stripe_refund_${ch.id}`,
    type: 'CompensationIssued', // Custom event for refunds
    aggregateType: 'Agreement',
    aggregateId: ch.metadata?.agreementId ?? (`agr_stripe_${ch.payment_intent}` as EntityId),
    timestamp: Date.now(),
    version: 1,
    actor: { type: 'System', systemId: 'stripe-adapter' },
    payload: {
      originalChargeId: ch.id,
      amountRefunded: ch.amount_refunded,
      currency: ch.currency,
      reason: ch.refunds?.data?.[0]?.reason ?? 'requested_by_customer',
    },
    hash: '',
  };
}

// ============================================================================
// STRIPE → LEDGER ENTITY SYNC
// ============================================================================

/**
 * Sync a Stripe Customer to a Ledger Entity.
 */
export function stripeCustomerToEntity(customer: unknown): {
  entityId: EntityId;
  event: Event;
} {
  const cust = customer as any;
  const entityId = `ent_stripe_${cust.id}` as EntityId;
  
  return {
    entityId,
    event: {
      id: `evt_stripe_cust_${cust.id}`,
      type: 'EntityCreated',
      aggregateType: 'Entity',
      aggregateId: entityId,
      timestamp: cust.created * 1000,
      version: 1,
      actor: { type: 'System', systemId: 'stripe-adapter' },
      payload: {
        entityType: cust.object === 'customer' ? 'Person' : 'Organization',
        identity: {
          name: cust.name ?? cust.email,
          identifiers: [
            { type: 'Email', value: cust.email },
            { type: 'StripeCustomerId', value: cust.id },
          ],
          contacts: cust.email ? [{ type: 'Email', value: cust.email }] : [],
        },
        metadata: {
          stripeCustomerId: cust.id,
          currency: cust.currency,
        },
      },
      hash: '',
    },
  };
}

