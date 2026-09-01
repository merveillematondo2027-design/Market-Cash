import { UserRole } from '../types';

export const OFFICIAL_ROLES: UserRole[] = [
  'client',
  'admin_general',
  'chef_agence',
  'designer_graphique',
  'livreur',
];

/**
 * Returns the default home route for a given user role.
 */
export function getHomeRouteByRole(role?: UserRole | string | null): string {
  if (!role) return '/login';
  
  const normalized = String(role).toLowerCase().trim();
  let targetRoute = '/client/wallet';

  switch (normalized) {
    case 'admin_general':
    case 'admin':
      targetRoute = '/admin/dashboard';
      break;
    case 'chef_agence':
    case 'chef':
      targetRoute = '/agency/dashboard';
      break;
    case 'designer_graphique':
    case 'designer':
      targetRoute = '/designer/cards';
      break;
    case 'livreur':
    case 'delivery':
      targetRoute = '/delivery/dashboard';
      break;
    case 'client':
    default:
      targetRoute = '/client/wallet';
      break;
  }

  console.log(`[RBAC_ROUTE] role=${role} route=${targetRoute}`);
  return targetRoute;
}

/**
 * Returns the base path prefix for a given user role.
 */
export function getBaseRouteByRole(role?: UserRole | string | null): string {
  if (!role) return '/login';
  
  const normalized = String(role).toLowerCase().trim();

  switch (normalized) {
    case 'admin_general':
    case 'admin':
      return '/admin';
    case 'chef_agence':
    case 'chef':
      return '/agency';
    case 'designer_graphique':
    case 'designer':
      return '/designer';
    case 'livreur':
    case 'delivery':
      return '/delivery';
    case 'client':
    default:
      return '/client';
  }
}

/**
 * Validates whether a given user role is authorized to access a given URL path.
 */
export function isRouteAllowedForRole(role: UserRole | string, pathname: string): boolean {
  const normRole = String(role).toLowerCase().trim();

  if (pathname.startsWith('/admin')) {
    const allowed = normRole === 'admin_general' || normRole === 'admin';
    console.log(`[RBAC_PERMISSION] role=${role} resource=${pathname} allowed=${allowed}`);
    return allowed;
  }
  if (pathname.startsWith('/agency')) {
    const allowed = normRole === 'chef_agence' || normRole === 'chef' || normRole === 'admin_general';
    console.log(`[RBAC_PERMISSION] role=${role} resource=${pathname} allowed=${allowed}`);
    return allowed;
  }
  if (pathname.startsWith('/designer')) {
    const allowed = normRole === 'designer_graphique' || normRole === 'designer' || normRole === 'admin_general';
    console.log(`[RBAC_PERMISSION] role=${role} resource=${pathname} allowed=${allowed}`);
    return allowed;
  }
  if (pathname.startsWith('/delivery')) {
    const allowed = normRole === 'livreur' || normRole === 'delivery' || normRole === 'admin_general';
    console.log(`[RBAC_PERMISSION] role=${role} resource=${pathname} allowed=${allowed}`);
    return allowed;
  }
  if (pathname.startsWith('/client')) {
    const allowed = normRole === 'client';
    console.log(`[RBAC_PERMISSION] role=${role} resource=${pathname} allowed=${allowed}`);
    return allowed;
  }

  return true;
}
