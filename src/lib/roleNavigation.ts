import { UserRole } from '../types';

export const OFFICIAL_ROLES:UserRole[]=['client','agent','marchand','admin_general','chef_agence','designer_graphique','livreur'];
export const CUSTOMER_ROLES:UserRole[]=['client','agent','marchand'];
export const STAFF_ROLES:UserRole[]=['admin_general','chef_agence','designer_graphique','livreur'];

export function getHomeRouteByRole(role?:UserRole|string|null):string{
  if(!role)return'/';
  const r=String(role).toLowerCase().trim();
  let route='/client/home';
  switch(r){
    case'admin_general':route='/admin/dashboard';break;
    case'chef_agence':route='/agency/dashboard';break;
    case'designer_graphique':route='/designer/cards';break;
    case'livreur':route='/delivery/dashboard';break;
    case'agent':route='/agent/terminal';break;
    case'marchand':route='/business/home';break;
    default:route='/client/home';
  }
  console.log(`[RBAC_ROUTE] role=${role} route=${route}`);
  return route;
}

export function getBaseRouteByRole(role?:UserRole|string|null):string{
  if(!role)return'/';
  const r=String(role).toLowerCase().trim();
  if(r==='admin_general')return'/admin';
  if(r==='chef_agence')return'/agency';
  if(r==='designer_graphique')return'/designer';
  if(r==='livreur')return'/delivery';
  if(r==='agent')return'/agent';
  if(r==='marchand')return'/business';
  return'/client';
}

export function isRouteAllowedForRole(role:UserRole|string,pathname:string):boolean{
  const r=String(role).toLowerCase().trim();
  if(pathname.startsWith('/admin'))return r==='admin_general';
  if(pathname.startsWith('/agency'))return['chef_agence','admin_general'].includes(r);
  if(pathname.startsWith('/designer'))return['designer_graphique','admin_general'].includes(r);
  if(pathname.startsWith('/delivery'))return['livreur','admin_general'].includes(r);
  if(pathname.startsWith('/agent'))return r==='agent';
  if(pathname.startsWith('/business'))return r==='marchand';
  if(pathname.startsWith('/client'))return r==='client';
  return true;
}
