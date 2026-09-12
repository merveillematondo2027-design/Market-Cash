import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativePaymentSms {
  id: string;
  senderAddress: string;
  body: string;
  receivedAt: number;
  simSlot: number;
  subscriptionId: number;
}

export interface PaymentSmsStatus {
  supported: boolean;
  isDefaultSms: boolean;
  pendingCount: number;
  platform: string;
}

interface PaymentSmsPlugin {
  getStatus(): Promise<PaymentSmsStatus>;
  requestDefaultSmsRole(): Promise<{ requested: boolean; isDefaultSms: boolean }>;
  requestSmsPermissions(): Promise<{ granted: boolean }>;
  getPendingSms(): Promise<{ messages: NativePaymentSms[] }>;
  acknowledgeSms(options: { ids: string[] }): Promise<{ removed: number; remaining: number }>;
}

const PaymentSms = registerPlugin<PaymentSmsPlugin>('PaymentSms');

export const paymentSmsNative = {
  isAndroid(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  },
  async getStatus(): Promise<PaymentSmsStatus> {
    if (!this.isAndroid()) return { supported: false, isDefaultSms: false, pendingCount: 0, platform: Capacitor.getPlatform() };
    return PaymentSms.getStatus();
  },
  async requestDefaultSmsRole() {
    if (!this.isAndroid()) return { requested: false, isDefaultSms: false };
    return PaymentSms.requestDefaultSmsRole();
  },
  async requestPermissions() {
    if (!this.isAndroid()) return { granted: false };
    return PaymentSms.requestSmsPermissions();
  },
  async getPendingSms(): Promise<NativePaymentSms[]> {
    if (!this.isAndroid()) return [];
    const result = await PaymentSms.getPendingSms();
    return Array.isArray(result.messages) ? result.messages : [];
  },
  async acknowledge(ids: string[]) {
    if (!this.isAndroid() || ids.length === 0) return { removed: 0, remaining: 0 };
    return PaymentSms.acknowledgeSms({ ids });
  },
};
