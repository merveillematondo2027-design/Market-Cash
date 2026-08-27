export const MARKET_CASH_SUPPORT_DISPLAY_NUMBER = '0820742730';
export const MARKET_CASH_SUPPORT_INTERNATIONAL_NUMBER = '243820742730';
export const MARKET_CASH_SUPPORT_MESSAGE = "Bonjour Market-Cash, j'ai besoin d'aide concernant mon compte.";

export const MARKET_CASH_SUPPORT_URL =
  `https://wa.me/${MARKET_CASH_SUPPORT_INTERNATIONAL_NUMBER}?text=${encodeURIComponent(MARKET_CASH_SUPPORT_MESSAGE)}`;

export function logWhatsAppSupportOpen(source: string) {
  console.log('[WHATSAPP_SUPPORT_OPEN]', {
    source,
    target: 'MARKET_CASH_SUPPORT'
  });
}

export function openWhatsAppSupport(source: string) {
  logWhatsAppSupportOpen(source);
  window.open(MARKET_CASH_SUPPORT_URL, '_blank', 'noopener,noreferrer');
}
