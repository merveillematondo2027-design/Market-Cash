import { setGlobalOptions } from 'firebase-functions/v2';

// Keep second-generation functions while using the lighter CPU allocation
// model of first-generation functions. This reduces regional Cloud Run CPU
// pressure and keeps Market-Cash deployable on the current project quota.
setGlobalOptions({ cpu: 'gcf_gen1' });

export * from './index';
export * from './operations';
export * from './withdrawalInspect';
export * from './adminUserControls';
export * from './agentTerminal';
export * from './agentAdmin';
export * from './localCard';
export * from './identifiers';
export * from './walletV2';
export * from './cardProducts';
export * from './agentIdentityV2';
export * from './merchantLookupV2';
export * from './adminIdentity';
export * from './cardSummarySecure';
