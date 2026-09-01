import { UserRole } from '../types';

export const OFFICIAL_ROLES: UserRole[] = ['client','admin_general','chef_agence','designer_graphique','livreur'];

export function getHomeRouteByRole(role?: UserRole | string | null): string {
  if (!role) return '/login';
  const normalized = String(role).toLowerCase().trim();
  let targetRoute = '/client/home';
  switch (normalized) {
    case 'admin_general': case 'admin': targetRoute = '/admin/dashboard'; break;
    case 'chef_agence': case 'chef': targetRoute = '/agency/dashboard'; break;
    case 'designer_graphique': case 'designer': targetRoute = '/designer/cards'; break;
    case 'livreur': case 'delivery': targetRoute = '/delivery/dashboard'; break;
    case 'client': default: targetRoute = '/client/home'; break;
  }
  console.log(`[RBAC_ROUTE] role=${role} route=${targetRoute}`);
  return targetRoute;
}

export function getBaseRouteByRole(role?: UserRole | string | null): string {
  if (!role) return '/login';
  const normalized = String(role).toLowerCase().trim();
  switch (normalized) {
    case 'admin_general': case 'admin': return '/admin';
    case 'chef_agence': case 'chef': return '/agency';
    case 'designer_graphique': case 'designer': return '/designer';
    case 'livreur': case 'delivery': return '/delivery';
    default: return '/client';
  }
}

export function isRouteAllowedForRole(role: UserRole | string, pathname: string): boolean {
  const r = String(role).toLowerCase().trim();
  if (pathname.startsWith('/admin')) return r === 'admin_general' || r === 'admin';
  if (pathname.startsWith('/agency')) return ['chef_agence','chef','admin_general'].includes(r);
  if (pathname.startsWith('/designer')) return ['designer_graphique','designer','admin_general'].includes(r);
  if (pathname.startsWith('/delivery')) return ['livreur','delivery','admin_general'].includes(r);
  if (pathname.startsWith('/client')) return r === 'client';
  return true;
}
