import { AppLog } from '../types';

const ascii = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7E]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const redact = (value: unknown) => ascii(value)
  .replace(/\b\d{16}\b/g, '****************')
  .replace(/(cvv|pin|token|secret|cardnumber|rechargenumber)\s*[:=]\s*\S+/gi, '$1=[MASQUE]');

const escapePdf = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const wrap = (text: string, max = 92) => {
  const words = redact(text).split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (!word) continue;
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
};

function buildPdf(pages: string[][]) {
  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };

  const catalogId = add('');
  const pagesId = add('');
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontBoldId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageIds: number[] = [];

  for (const pageLines of pages) {
    const content = [
      'BT',
      '/F2 15 Tf',
      '50 800 Td',
      '(Market-Cash - Export Centre de logs) Tj',
      '0 -24 Td',
      '/F1 9 Tf',
      ...pageLines.flatMap((line, index) => index === 0
        ? [`(${escapePdf(line)}) Tj`]
        : ['0 -13 Td', `(${escapePdf(line)}) Tj`]),
      'ET'
    ].join('\n');
    const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

export function downloadLogsPdf(logs: AppLog[], filename?: string) {
  const generatedAt = new Date();
  const lines: string[] = [
    `Genere le : ${generatedAt.toLocaleString('fr-FR')}`,
    `Nombre de resultats exportes : ${logs.length}`,
    '',
  ];

  logs.forEach((log, index) => {
    const result = log.success === false ? 'ECHEC' : log.success === true ? 'SUCCES' : 'INFO';
    const header = `${index + 1}. ${new Date(log.timestamp).toLocaleString('fr-FR')} | ${log.level} | ${log.category} | ${result}`;
    lines.push(...wrap(header));
    lines.push(...wrap(`Evenement: ${log.event || '-'}`));
    lines.push(...wrap(`Utilisateur: ${log.userEmail || log.userId || 'Systeme'} | Role: ${log.userRole || '-'}`));
    lines.push(...wrap(`Operation: ${log.operation || log.route || '-'} | Erreur: ${log.errorCode || log.errorName || '-'}`));
    lines.push(...wrap(`Message: ${log.message || '-'}`));
    lines.push('');
  });

  const maxLinesPerPage = 54;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += maxLinesPerPage) pages.push(lines.slice(i, i + maxLinesPerPage));
  if (!pages.length) pages.push(['Aucun log dans le filtre actuel.']);

  const pdf = buildPdf(pages);
  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `market-cash-logs-${generatedAt.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
