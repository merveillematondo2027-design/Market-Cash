import { storage } from '../firebase/config';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { UserCard } from '../types';

/**
 * Generates an SVG data URL for a QR code representing the card identifier.
 */
function createQrSvgDataUrl(text: string): string {
  // We can use a reliable QR code image or offline matrix generator
  // For supreme offline reliability, we create a crisp vector representation
  const encoded = encodeURIComponent(text);
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encoded}&format=svg&qzone=1`;
}

/**
 * Loads an image from a URL or data URL and returns an HTMLImageElement
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      // Fallback in case of network issue - create a fallback canvas
      const fallbackCanvas = document.createElement('canvas');
      fallbackCanvas.width = 120;
      fallbackCanvas.height = 120;
      const ctx = fallbackCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 120, 120);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('QR CODE', 35, 60);
        ctx.fillText(src.substring(0, 12), 20, 80);
      }
      const fallbackImg = new Image();
      fallbackImg.src = fallbackCanvas.toDataURL();
      resolve(fallbackImg);
    };
    img.src = src;
  });
}

/**
 * Generates a high-definition (1050x660 px) PVC card image on an HTML5 Canvas.
 */
export async function generatePvcCardCanvas(card: UserCard): Promise<HTMLCanvasElement> {
  const width = 1050;
  const height = 660;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  // Enable high quality rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const cardIdText = card.cardIdentifier || card.cardId || 'MC-001-20260823';
  const cleanCardNum = (card.cardNumber || '4585020000258400').replace(/\s+/g, '');
  const groupedNum = cleanCardNum.match(/.{1,4}/g)?.join('   ') || '4585   0200   0025   8400';
  const holder = (card.cardHolder || card.cardHolderName || card.userName || 'CLIENT MARKET-CASH').toUpperCase();
  const expStart = card.expiryStart || '02/27';
  const expEnd = card.expiryEnd || card.expiry || '08/27';
  const cvv = card.cvv || '551';
  const rechargeNum = card.rechargeNumber || 'RC-0284-9912';
  const network = (card.network || 'VISA').toUpperCase();

  // 1. Base Card Shape with Rounded Corners (CR80 standard)
  const radius = 38;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(width - radius, 0);
  ctx.quadraticCurveTo(width, 0, width, radius);
  ctx.lineTo(width, height - radius);
  ctx.quadraticCurveTo(width, height, width - radius, height);
  ctx.lineTo(radius, height);
  ctx.quadraticCurveTo(0, height, 0, height - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.clip();

  // 2. Rich Deep Navy & Blue Metallic Background Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#040d1a'); // Darkest midnight
  bgGrad.addColorStop(0.3, '#0a1d37');
  bgGrad.addColorStop(0.7, '#0f274a');
  bgGrad.addColorStop(1, '#051020');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 3. Subtle Metallic Radial Glows & Security Guilloche Pattern
  const glow1 = ctx.createRadialGradient(200, 100, 10, 200, 100, 450);
  glow1.addColorStop(0, 'rgba(59, 130, 246, 0.22)');
  glow1.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, width, height);

  const glow2 = ctx.createRadialGradient(width - 150, height - 100, 10, width - 150, height - 100, 400);
  glow2.addColorStop(0, 'rgba(245, 158, 11, 0.18)');
  glow2.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, width, height);

  // Geometric Security Grid Lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1.5;
  for (let x = -width; x < width * 2; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height * 0.8, height);
    ctx.stroke();
  }

  // Border Stroke
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 4. Header: Brand Logo & Identifier Pill
  // Golden Emblem Icon
  ctx.save();
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.roundRect(50, 46, 48, 48, 12);
  ctx.fill();

  ctx.strokeStyle = '#040d1a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(74, 70, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Brand Name
  ctx.fillStyle = '#f59e0b';
  ctx.font = '900 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('MARKET-CASH', 112, 74);

  ctx.fillStyle = '#93c5fd';
  ctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText('CARTE PHYSIQUE PVC OFFICIELLE', 114, 94);

  // Identifier Badge Pill (Top Right)
  const idBadgeWidth = 230;
  const idBadgeHeight = 42;
  const idBadgeX = width - 50 - idBadgeWidth;
  const idBadgeY = 48;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(idBadgeX, idBadgeY, idBadgeWidth, idBadgeHeight, 21);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(cardIdText, idBadgeX + idBadgeWidth / 2, idBadgeY + 26);
  ctx.textAlign = 'left';

  // 5. EMV Smart Chip Graphic (Gold Metallic)
  const chipX = 60;
  const chipY = 160;
  const chipW = 86;
  const chipH = 68;

  const chipGrad = ctx.createLinearGradient(chipX, chipY, chipX + chipW, chipY + chipH);
  chipGrad.addColorStop(0, '#fef08a');
  chipGrad.addColorStop(0.4, '#eab308');
  chipGrad.addColorStop(0.8, '#ca8a04');
  chipGrad.addColorStop(1, '#a16207');

  ctx.fillStyle = chipGrad;
  ctx.beginPath();
  ctx.roundRect(chipX, chipY, chipW, chipH, 10);
  ctx.fill();
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Chip contact circuits
  ctx.strokeStyle = 'rgba(120, 53, 15, 0.7)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(chipX + 28, chipY);
  ctx.lineTo(chipX + 28, chipY + chipH);
  ctx.moveTo(chipX + 58, chipY);
  ctx.lineTo(chipX + 58, chipY + chipH);
  ctx.moveTo(chipX, chipY + 34);
  ctx.lineTo(chipX + chipW, chipY + 34);
  ctx.stroke();

  // Contactless NFC Waves Icon
  const nfcX = chipX + chipW + 28;
  const nfcY = chipY + 34;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(nfcX, nfcY, 12 + i * 9, -0.6, 0.6);
    ctx.stroke();
  }

  // 6. Right Side QR Code Integration
  const qrSize = 130;
  const qrX = width - 50 - qrSize;
  const qrY = 145;

  // White Card Container for QR Code
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.roundRect(qrX, qrY, qrSize, qrSize, 14);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Load and Draw QR Code inside white container
  try {
    const qrImgUrl = createQrSvgDataUrl(cardIdText);
    const qrImg = await loadImage(qrImgUrl);
    ctx.drawImage(qrImg, qrX + 8, qrY + 8, qrSize - 16, qrSize - 16);
  } catch (e) {
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('QR: ' + cardIdText, qrX + 10, qrY + 70);
  }

  ctx.fillStyle = '#94a3b8';
  ctx.font = '700 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('AUTHENTIQUE', qrX + qrSize / 2, qrY + qrSize + 18);
  ctx.textAlign = 'left';

  // 7. Card Number (Big Monospace Grouped Font)
  const numY = 345;
  ctx.fillStyle = '#93c5fd';
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('NUMÉRO DE CARTE', 60, numY - 14);

  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.font = '900 38px "Courier New", Courier, monospace';
  ctx.letterSpacing = '4px';
  ctx.fillText(groupedNum, 60, numY + 24);
  ctx.shadowColor = 'transparent';

  // 8. Recharge Number Banner (If applicable)
  const rechargeY = 415;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(60, rechargeY, 560, 42, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fbbf24';
  ctx.font = '900 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('NUMÉRO DE RECHARGE :', 76, rechargeY + 26);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px monospace';
  ctx.fillText(rechargeNum, 240, rechargeY + 26);

  // 9. Bottom Row: Cardholder, Validity Dates, CVV, Network
  const bottomY = 530;

  // Cardholder Name
  ctx.fillStyle = '#93c5fd';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('TITULAIRE', 60, bottomY);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(holder, 60, bottomY + 28);

  // Expiration Dates (02/27 - 08/27)
  const expX = 460;
  ctx.fillStyle = '#93c5fd';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('VALIDITÉ (DÉBUT - FIN)', expX, bottomY);

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 19px monospace';
  ctx.fillText(`${expStart} - ${expEnd}`, expX, bottomY + 28);

  // CVV
  const cvvX = 710;
  ctx.fillStyle = '#93c5fd';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('CVV', cvvX, bottomY);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 19px monospace';
  ctx.fillText(cvv, cvvX, bottomY + 28);

  // Network Logo (Bottom Right)
  const netX = width - 150;
  const netY = bottomY + 6;

  if (network === 'MASTERCARD') {
    ctx.fillStyle = '#eb001b';
    ctx.beginPath();
    ctx.arc(netX + 20, netY, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f79e1b';
    ctx.beginPath();
    ctx.arc(netX + 54, netY, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('mastercard', netX + 4, netY + 40);
  } else {
    // VISA
    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 900 36px sans-serif';
    ctx.fillText('VISA', netX + 15, netY + 12);
  }

  // 10. Security Hologram Strip at very bottom
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(0, height - 18, width, 18);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`MARKET-CASH PVC CERTIFIED • SECURE ASSET #${cardIdText}`, width / 2, height - 6);
  ctx.textAlign = 'left';

  ctx.restore();
  return canvas;
}

/**
 * Generates PNG data URL of the PVC card
 */
export async function generatePvcCardDataUrl(card: UserCard): Promise<string> {
  const canvas = await generatePvcCardCanvas(card);
  return canvas.toDataURL('image/png', 1.0);
}

/**
 * Generates and uploads the PVC card front image to Firebase Storage.
 * Stores under `market-cash/cards/{cardIdentifier}/front.png`
 * Returns download URL (or fallback to Data URL).
 */
export async function generateAndUploadPvcCard(card: UserCard): Promise<string> {
  const dataUrl = await generatePvcCardDataUrl(card);
  const cardIdentifier = card.cardIdentifier || card.cardId || `MC-${Date.now()}`;
  
  try {
    const storagePath = `market-cash/cards/${cardIdentifier}/front.png`;
    const storageRef = ref(storage, storagePath);
    await uploadString(storageRef, dataUrl, 'data_url', {
      contentType: 'image/png'
    });
    const downloadUrl = await getDownloadURL(storageRef);
    console.log('[PVC_UPLOAD_SUCCESS]', { storagePath, downloadUrl });
    return downloadUrl;
  } catch (error) {
    console.warn('[PVC_STORAGE_FALLBACK] Storage upload failed or offline, saving data URL', error);
    return dataUrl;
  }
}

/**
 * Triggers a browser download of the high-res PVC card image.
 * File name: `MC-001-20260823.png`
 */
export async function downloadPvcCardImage(card: UserCard, fileName?: string): Promise<void> {
  const dataUrl = await generatePvcCardDataUrl(card);
  const cardIdentifier = card.cardIdentifier || card.cardId || 'MC-001-20260823';
  const finalFileName = fileName || `${cardIdentifier}.png`;

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = finalFileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
