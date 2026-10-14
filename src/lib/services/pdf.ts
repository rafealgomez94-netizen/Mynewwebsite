import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Lightweight PDF renderer for documents and reports.
 * Text is wrapped manually because pdf-lib ships without layout helpers; the
 * output is deliberately plain, professional and printable.
 */
export type PdfBlock =
  | { type: 'title'; text: string }
  | { type: 'subtitle'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'kv'; label: string; value: string }
  | { type: 'table'; columns: string[]; rows: string[][]; columnWidths?: number[] }
  | { type: 'spacer'; height?: number };

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/**
 * pdf-lib's built-in fonts only cover WinAnsi (cp1252). Business data, AI text and
 * our own copy frequently contain characters outside that set ("→", "•", smart
 * quotes), and drawText throws for them. Map the common typographic characters to
 * ASCII equivalents and replace anything else that cannot be encoded.
 */
const PDF_CHAR_MAP: Record<string, string> = {
  '\u2192': '->',
  '\u2190': '<-',
  '\u2191': '^',
  '\u2193': 'v',
  '\u21d2': '=>',
  '\u2014': '-',
  '\u2013': '-',
  '\u2022': '-',
  '\u2026': '...',
  '\u2018': "'",
  '\u2019': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u00a0': ' ',
  '\u2028': ' ',
  '\u2029': ' ',
  '\u2713': 'v',
  '\u2714': 'v',
  '\u00b7': '-',
  '\u00b0': ' deg',
};

export function sanitisePdfText(value: unknown): string {
  const input = typeof value === 'string' ? value : String(value ?? '');
  let out = '';
  for (const char of input) {
    const mapped = PDF_CHAR_MAP[char];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const code = char.codePointAt(0) ?? 63;
    if (code === 10 || code === 13 || code === 9) {
      out += ' ';
      continue;
    }
    out += code <= 0xff ? char : '?';
  }
  return out;
}

export async function buildPdf(blocks: PdfBlock[], footerNote: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(footerNote);
  pdf.setProducer('Workspace Digital');
  pdf.setCreator('Workspace Digital');

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursor = PAGE_HEIGHT - MARGIN;

  const ensureSpace = (needed: number) => {
    if (cursor - needed < MARGIN + 24) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      cursor = PAGE_HEIGHT - MARGIN;
    }
  };

  const wrap = (text: string, size: number, maxWidth: number, useBold = false): string[] => {
    const targetFont = useBold ? bold : font;
    const words = sanitisePdfText(text).split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (targetFont.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const drawText = (text: string, options: { size: number; bold?: boolean; color?: [number, number, number]; indent?: number }) => {
    const size = options.size;
    const lineHeight = size * 1.45;
    const indent = options.indent ?? 0;
    const lines = wrap(text, size, CONTENT_WIDTH - indent, options.bold);
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line, {
        x: MARGIN + indent,
        y: cursor - size,
        size,
        font: options.bold ? bold : font,
        color: options.color ? rgb(...options.color) : rgb(0.13, 0.16, 0.23),
      });
      cursor -= lineHeight;
    }
  };

  for (const block of blocks) {
    switch (block.type) {
      case 'title':
        drawText(block.text, { size: 20, bold: true, color: [0.08, 0.1, 0.16] });
        cursor -= 4;
        break;
      case 'subtitle':
        drawText(block.text, { size: 10, color: [0.39, 0.45, 0.55] });
        cursor -= 6;
        break;
      case 'heading':
        cursor -= 6;
        ensureSpace(28);
        drawText(block.text.toUpperCase(), { size: 10.5, bold: true, color: [0.12, 0.39, 0.94] });
        cursor -= 2;
        break;
      case 'paragraph':
        drawText(block.text, { size: 10.5 });
        cursor -= 4;
        break;
      case 'kv':
        ensureSpace(16);
        page.drawText(`${sanitisePdfText(block.label)}:`, {
          x: MARGIN,
          y: cursor - 10,
          size: 10.5,
          font: bold,
          color: rgb(0.31, 0.36, 0.45),
        });
        page.drawText(sanitisePdfText(block.value), {
          x: MARGIN + 150,
          y: cursor - 10,
          size: 10.5,
          font,
          color: rgb(0.13, 0.16, 0.23),
        });
        cursor -= 17;
        break;
      case 'table': {
        const widths = block.columnWidths ?? block.columns.map(() => CONTENT_WIDTH / block.columns.length);
        ensureSpace(26);
        let x = MARGIN;
        block.columns.forEach((column, index) => {
          page.drawText(sanitisePdfText(column).toUpperCase(), {
            x: x + 2,
            y: cursor - 10,
            size: 9,
            font: bold,
            color: rgb(0.39, 0.45, 0.55),
          });
          x += widths[index];
        });
        cursor -= 15;
        page.drawLine({
          start: { x: MARGIN, y: cursor },
          end: { x: MARGIN + CONTENT_WIDTH, y: cursor },
          thickness: 0.6,
          color: rgb(0.9, 0.9, 0.93),
        });
        cursor -= 6;
        for (const row of block.rows) {
          ensureSpace(18);
          let cellX = MARGIN;
          row.forEach((cell, index) => {
            const clipped = wrap(cell, 10, widths[index] - 6)[0] ?? '';
            page.drawText(clipped, {
              x: cellX + 2,
              y: cursor - 9,
              size: 10,
              font,
              color: rgb(0.16, 0.2, 0.27),
            });
            cellX += widths[index];
          });
          cursor -= 15;
        }
        cursor -= 4;
        break;
      }
      case 'spacer':
        cursor -= block.height ?? 12;
        break;
      default:
        break;
    }
  }

  // Footer on every page
  const pages = pdf.getPages();
  pages.forEach((currentPage, index) => {
    currentPage.drawLine({
      start: { x: MARGIN, y: MARGIN - 12 },
      end: { x: PAGE_WIDTH - MARGIN, y: MARGIN - 12 },
      thickness: 0.6,
      color: rgb(0.9, 0.9, 0.93),
    });
    currentPage.drawText(sanitisePdfText(footerNote).slice(0, 110), {
      x: MARGIN,
      y: MARGIN - 24,
      size: 8,
      font,
      color: rgb(0.52, 0.57, 0.66),
    });
    currentPage.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: PAGE_WIDTH - MARGIN - 60,
      y: MARGIN - 24,
      size: 8,
      font,
      color: rgb(0.52, 0.57, 0.66),
    });
  });

  return pdf.save();
}
