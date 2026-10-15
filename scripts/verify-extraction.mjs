#!/usr/bin/env node
/**
 * Extraction verification.
 *
 * Builds a real compressed PDF (the same way the app's own PDF export does), a
 * real DOCX (a ZIP with word/document.xml), a scanned-style PDF with no text, and
 * a plain text file — then asserts the extractors recover the text for the first
 * two, refuse to index noise for the third, and pass text through for the fourth.
 *
 * Run: node scripts/verify-extraction.mjs
 */
import zlib from 'node:zlib';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractPdf, extractDocx, looksLikeText } from '../src/lib/services/document-text.ts';

const results = [];
const check = (name, condition, note = '') => {
  results.push({ name, pass: Boolean(condition), note });
  console.log(`${condition ? ' PASS ' : ' FAIL '} ${name}${note ? `  ${note}` : ''}`);
};

// ------------------------------------------------------------------ real PDF
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const page = pdf.addPage([595, 842]);
const marker = 'ZEPHYRQUARTZ';
page.drawText('PRICE LIST 2026', { x: 60, y: 780, size: 20, font });
page.drawText('Box braids N$350 including wash.', { x: 60, y: 750, size: 12, font });
page.drawText('Kids haircut N$120 for children under 12.', { x: 60, y: 730, size: 12, font });
page.drawText(`Deposit policy ${marker} requires 30 percent.`, { x: 60, y: 710, size: 12, font });
const pdfBytes = Buffer.from(await pdf.save());
check('PDF is a compressed container', pdfBytes.includes(Buffer.from('/FlateDecode')), `${pdfBytes.length} bytes`);

const pdfResult = extractPdf(pdfBytes);
check('PDF text is recovered', pdfResult.text.includes('Box braids N$350'), pdfResult.reliable ? 'via content streams' : 'fallback');
check('PDF marker survives', pdfResult.text.includes(marker));
check('PDF has no binary noise', !/stream|endstream|FlateDecode|\/Length/.test(pdfResult.text));
check('PDF extraction flagged reliable', pdfResult.reliable === true);

// ----------------------------------------------------------------- real DOCX
function buildDocx(lines) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${lines.map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join('\n')}
</w:body></w:document>`;
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0"?><Types/>'],
    ['word/document.xml', xml],
  ];
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content, 'utf8');
    const compressed = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, compressed);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(compressed.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);
    offset += local.length + nameBuf.length + compressed.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, eocd]);
}

const docx = buildDocx([
  'STUDIO POLICY',
  'Cancellations need 12 hours notice KERATINSPA.',
  'Deposits are 30% for braiding services.',
]);
const docxResult = extractDocx(docx);
check('DOCX text is recovered', docxResult.text.includes('Cancellations need 12 hours notice'), docxResult.reliable ? 'via word/document.xml' : 'fallback');
check('DOCX marker survives', docxResult.text.includes('KERATINSPA'));
check('DOCX has no zip noise', !docxResult.text.includes('PK') && !docxResult.text.includes('<w:'));
check('DOCX paragraphs keep their line breaks', docxResult.text.split('\n').length >= 3);

// ------------------------------------------------- scanned PDF (no text at all)
const scanPdf = await PDFDocument.create();
const scanPage = scanPdf.addPage([595, 842]);
scanPage.drawRectangle({ x: 40, y: 400, width: 400, height: 200, color: undefined });
const scanBytes = Buffer.from(await scanPdf.save());
const scanResult = extractPdf(scanBytes);
check('text-free PDF yields no junk', !/stream|obj|x\\d/.test(scanResult.text), `text length ${scanResult.text.length}`);
check('text-free PDF warns the owner', Boolean(scanResult.warning));
check('text-free PDF is not marked reliable', scanResult.reliable === false);

// ------------------------------------------------------------ quality gate
check('gate rejects binary noise', !looksLikeText('x XM D W > % 4 8p 8 vA E > O c W q ? a y S :|'));
check('gate rejects short fragments', !looksLikeText('total 30'));
check('gate accepts real prose', looksLikeText('Deposits are 30% for braiding, colour and extension services and hold your slot.'));

console.log(`\n${results.filter((r) => r.pass).length} passed, ${results.filter((r) => !r.pass).length} failed`);
process.exit(results.some((r) => !r.pass) ? 1 : 0);
