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
