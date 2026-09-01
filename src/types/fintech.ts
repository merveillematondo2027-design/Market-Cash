export type FintechServiceStatus = 'coming_soon' | 'active' | 'suspended';
export type FintechServiceKey = 'wallet' | 'virtual_visa' | 'esim' | 'crypto';

export interface FintechServiceDefinition {
  key: FintechServiceKey;
  label: string;
  status: FintechServiceStatus;
  requiresPartner: boolean;
  integrationEngine?: 'GMH_APIS';
}

export const MARKET_CASH_FINTECH_SERVICES: FintechServiceDefinition[] = [
  { key: 'wallet', label: 'Wallet Market-Cash', status: 'active', requiresPartner: false },
  { key: 'virtual_visa', label: 'Visa virtuelle', status: 'coming_soon', requiresPartner: true, integrationEngine: 'GMH_APIS' },
  { key: 'esim', label: 'e-SIM', status: 'coming_soon', requiresPartner: true, integrationEngine: 'GMH_APIS' },
  { key: 'crypto', label: 'Crypto', status: 'coming_soon', requiresPartner: true, integrationEngine: 'GMH_APIS' },
];
