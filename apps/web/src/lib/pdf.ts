import { jsPDF } from 'jspdf';
import type { PersistedReport } from '@edumenai/shared';

type RgbTuple = readonly [number, number, number];

interface RichSpan {
  text: string;
  bold?: boolean;
  highlight?: boolean;
  color?: RgbTuple;
}

interface RichToken {
  text: string;
  isSpace: boolean;
  width: number;
  bold: boolean;
  highlight: boolean;
  color: RgbTuple | null;
}

type LayoutLine =
  | { isBlank: true }
  | { isBlank: false; tokens: RichToken[] };

export interface GeneratedPdfResult {
  doc: jsPDF;
  blob: Blob;
  fileName: string;
}

const ASCII_MAP: Record<string, string> = {
  '\u2192': '->',
  '\u2190': '<-',
  '\u21D2': '=>',
  '\u2794': '->',
  '\u2013': '-',
  '\u2014': '-',
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u2026': '...',
  '\u00A0': ' ',
  '\u2022': '-',
  '\u25B6': '',
  '\u25BC': '',
  '\u2713': 'v',
  '\u2717': 'x'
};

function pdfSafe(text: string | null | undefined): string {
  if (!text) return '';
  let v = String(text);
  for (const [k, replacement] of Object.entries(ASCII_MAP)) {
    v = v.split(k).join(replacement);
  }
  return v.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A1-\u00FF]/g, '');
}

function countWords(str: string): number {
  if (!str) return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

function parseMarkParagraphs(raw: string): RichSpan[][] {
  const normalized = (raw || '').replace(/\r\n/g, '\n');
  const rawParagraphs = normalized.split(/\n{2,}|\n/).filter((p, idx, arr) => p.length > 0 || idx < arr.length - 1);
  const tagRegex = /<mark(?:\s+[^>]*)?>([\s\S]*?)<\/mark>/gi;

  return rawParagraphs.map((para) => {
    const spans: RichSpan[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    tagRegex.lastIndex = 0;

    while ((match = tagRegex.exec(para)) !== null) {
      if (match.index > lastIdx) {
        const plain = para.slice(lastIdx, match.index).replace(/<[^>]+>/g, '');
        if (plain) spans.push({ text: plain, highlight: false });
      }
      const highlighted = (match[1] ?? '').replace(/<[^>]+>/g, '');
      if (highlighted) spans.push({ text: highlighted, highlight: true });
      lastIdx = match.index + match[0].length;
    }

    if (lastIdx < para.length) {
      const rest = para.slice(lastIdx).replace(/<[^>]+>/g, '');
      if (rest) spans.push({ text: rest, highlight: false });
    }

    return spans;
  });
}

function parseMarkdownParagraphs(text: string, boldColor: RgbTuple): RichSpan[][] {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  return lines.map((line) => {
    const spans: RichSpan[] = [];
    const boldRegex = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = boldRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        spans.push({ text: line.slice(lastIndex, match.index), bold: false });
      }
      spans.push({ text: match[1] ?? '', bold: true, color: boldColor });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
      spans.push({ text: line.slice(lastIndex), bold: false });
    }

    return spans;
  });
}

export function generateReportPdf(report: PersistedReport): GeneratedPdfResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = { left: 15, right: 15, top: 15, bottom: 15 };
  const contentWidth = pageWidth - margin.left - margin.right; // 180 mm
  const BOTTOM = pageHeight - margin.bottom - 10; // 272 mm

  const colours = {
    primary: [24, 34, 55] as RgbTuple,       // Brand Navy #182237
    secondary: [181, 143, 83] as RgbTuple,   // Brand Gold #B58F53
    cream: [248, 246, 241] as RgbTuple,      // Brand Cream #F8F6F1
    dark: [33, 33, 33] as RgbTuple,
    success: [27, 122, 61] as RgbTuple,
    danger: [176, 58, 46] as RgbTuple,
    gray: [120, 120, 120] as RgbTuple,
    white: [255, 255, 255] as RgbTuple,
    lightGreen: [232, 245, 233] as RgbTuple,
    highlightBg: [254, 240, 138] as RgbTuple, // Yellow marker #FEF08A
    lightGrayBg: [249, 250, 251] as RgbTuple, // Card background #F9FAFB
    borderGray: [229, 231, 235] as RgbTuple   // Card border #E5E7EB
  };

  let y = margin.top;

  function forcePageBreak(): void {
    doc.addPage();
    y = margin.top + 5;
  }

  function checkPageBreak(neededHeight = 0): boolean {
    if (y + neededHeight > BOTTOM) {
      forcePageBreak();
      return true;
    }
    return false;
  }

  function addSectionHeader(title: string, colour: RgbTuple = colours.primary): void {
    checkPageBreak(16);
    doc.setFillColor(...colour);
    doc.roundedRect(margin.left, y, contentWidth, 8, 1.5, 1.5, 'F');
    doc.setTextColor(...colours.white);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(pdfSafe(title), margin.left + 4, y + 5.5);
    y += 12;
    doc.setTextColor(...colours.dark);
    doc.setFont('helvetica', 'normal');
  }

  function addWrappedText(
    text: string,
    x: number,
    maxWidth: number,
    fontSize = 9,
    lineHeight = 4.5,
    isBold = false
  ): void {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    const safe = pdfSafe(text);
    const lines = doc.splitTextToSize(safe, maxWidth) as string[];
    for (const line of lines) {
      checkPageBreak(lineHeight);
      doc.text(line, x, y);
      y += lineHeight;
    }
  }

  function layoutRichParagraphs(
    paragraphs: RichSpan[][],
    maxWidth: number,
    fontSize: number
  ): LayoutLine[] {
    doc.setFontSize(fontSize);
    const allLines: LayoutLine[] = [];

    for (const spans of paragraphs) {
      if (!spans || spans.length === 0) {
        allLines.push({ isBlank: true });
        continue;
      }

      const tokens: RichToken[] = [];
      for (const span of spans) {
        const safe = pdfSafe(span.text);
        if (!safe) continue;
        const parts = safe.split(/(\s+)/);
        for (const part of parts) {
          if (!part) continue;
          const isSpace = /^\s+$/.test(part);
          const text = isSpace ? ' ' : part;
          doc.setFont('helvetica', span.bold ? 'bold' : 'normal');
          const w = doc.getTextWidth(text);

          if (!isSpace && w > maxWidth) {
            const broken = doc.splitTextToSize(text, maxWidth) as string[];
            for (const chunk of broken) {
              tokens.push({
                text: chunk,
                isSpace: false,
                width: doc.getTextWidth(chunk),
                bold: Boolean(span.bold),
                highlight: Boolean(span.highlight),
                color: span.color ?? null
              });
            }
          } else {
            tokens.push({
              text,
              isSpace,
              width: w,
              bold: Boolean(span.bold),
              highlight: Boolean(span.highlight),
              color: span.color ?? null
            });
          }
        }
      }

      let currentLine: RichToken[] = [];
      let currentWidth = 0;

      const pushLine = (): void => {
        while (currentLine.length > 0 && currentLine[currentLine.length - 1]?.isSpace) {
          currentLine.pop();
        }
        allLines.push({ isBlank: false, tokens: currentLine });
        currentLine = [];
        currentWidth = 0;
      };

      for (const tok of tokens) {
        if (currentLine.length === 0 && tok.isSpace) continue;
        if (tok.isSpace && currentLine[currentLine.length - 1]?.isSpace) continue;
        if (!tok.isSpace && currentWidth + tok.width > maxWidth && currentLine.length > 0) {
          pushLine();
        }
        currentLine.push(tok);
        currentWidth += tok.width;
      }

      if (currentLine.length > 0) {
        pushLine();
      }
    }

    return allLines;
  }

  function drawRichLineTokens(
    tokens: RichToken[],
    startX: number,
    baselineY: number,
    fontSize: number,
    defaultColor: RgbTuple
  ): void {
    let cursorX = startX;
    let runStartX: number | null = null;
    let runWidth = 0;

    const flushHighlight = (): void => {
      if (runStartX !== null && runWidth > 0) {
        doc.setFillColor(...colours.highlightBg);
        doc.roundedRect(runStartX - 0.5, baselineY - 2.9, runWidth + 1.0, 4.0, 0.6, 0.6, 'F');
      }
      runStartX = null;
      runWidth = 0;
    };

    for (const tok of tokens) {
      if (tok.highlight) {
        if (runStartX === null) runStartX = cursorX;
        runWidth += tok.width;
      } else {
        flushHighlight();
      }
      cursorX += tok.width;
    }
    flushHighlight();

    cursorX = startX;
    for (const tok of tokens) {
      if (!tok.isSpace) {
        doc.setFont('helvetica', tok.bold ? 'bold' : 'normal');
        doc.setFontSize(fontSize);
        doc.setTextColor(...(tok.color ?? defaultColor));
        doc.text(tok.text, cursorX, baselineY);
      }
      cursorX += tok.width;
    }
  }

  function drawRichParagraphs(
    paragraphs: RichSpan[][],
    opts: {
      x?: number;
      maxWidth?: number;
      fontSize?: number;
      lineHeight?: number;
      baselineOffset?: number;
      boxX?: number;
      boxWidth?: number;
      boxBg?: RgbTuple;
      boxBorder?: RgbTuple;
      padX?: number;
      padY?: number;
      defaultColor?: RgbTuple;
    } = {}
  ): void {
    const x = opts.x ?? margin.left;
    const maxWidth = opts.maxWidth ?? contentWidth;
    const fontSize = opts.fontSize ?? 8.5;
    const lineHeight = opts.lineHeight ?? 4.6;
    const baselineOffset = opts.baselineOffset ?? 3.2;
    const padX = opts.padX ?? 0;
    const padY = opts.padY ?? 0;
    const defaultColor = opts.defaultColor ?? colours.dark;

    const hasBox = Boolean(opts.boxBg && opts.boxWidth && opts.boxX !== undefined);
    const textX = hasBox ? (opts.boxX ?? x) + padX : x;
    const textMaxW = hasBox ? (opts.boxWidth ?? maxWidth) - padX * 2 : maxWidth;
    const allLines = layoutRichParagraphs(paragraphs, textMaxW, fontSize);

    if (!hasBox) {
      for (const line of allLines) {
        if (line.isBlank) {
          y += lineHeight * 0.65;
          continue;
        }
        checkPageBreak(lineHeight);
        drawRichLineTokens(line.tokens, textX, y, fontSize, defaultColor);
        y += lineHeight;
      }
      return;
    }

    let idx = 0;
    const boxX = opts.boxX ?? margin.left;
    const boxWidth = opts.boxWidth ?? contentWidth;

    while (idx < allLines.length) {
      checkPageBreak(lineHeight + padY * 2);

      const availableHeight = BOTTOM - y;
      const maxLinesHere = Math.max(1, Math.floor((availableHeight - padY * 2) / lineHeight));
      const sliceEnd = Math.min(allLines.length, idx + maxLinesHere);
      const pageSlice = allLines.slice(idx, sliceEnd);
      const sliceHeight = pageSlice.reduce(
        (sum, l) => sum + (l.isBlank ? lineHeight * 0.65 : lineHeight),
        0
      );
      const boxHeight = sliceHeight + padY * 2;

      doc.setFillColor(...(opts.boxBg ?? colours.lightGrayBg));
      if (opts.boxBorder) {
        doc.setDrawColor(...opts.boxBorder);
        doc.setLineWidth(0.3);
        doc.roundedRect(boxX, y, boxWidth, boxHeight, 2, 2, 'FD');
      } else {
        doc.roundedRect(boxX, y, boxWidth, boxHeight, 2, 2, 'F');
      }

      let cursorY = y + padY + baselineOffset;
      for (const line of pageSlice) {
        if (line.isBlank) {
          cursorY += lineHeight * 0.65;
          continue;
        }
        drawRichLineTokens(line.tokens, textX, cursorY, fontSize, defaultColor);
        cursorY += lineHeight;
      }

      y += boxHeight;
      idx = sliceEnd;
      if (idx < allLines.length) {
        forcePageBreak();
      }
    }
  }

  // --- HEADER BANNER ---
  doc.setFillColor(...colours.primary);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setFillColor(...colours.secondary);
  doc.rect(0, 29, pageWidth, 3, 'F');

  const exerciseLabel =
    report.exerciseCode === 'ex4'
      ? 'Exercise 4: Formal / Semi-Formal / Informal Writing'
      : `Exercise: ${report.exerciseCode.toUpperCase()} (v${report.promptVersion})`;

  doc.setTextColor(...colours.white);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(pdfSafe(exerciseLabel), pageWidth / 2, 13, { align: 'center' });
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Oxford AQA IGCSE ESL — Official AI Examiner Report', pageWidth / 2, 22, {
    align: 'center'
  });

  y = 38;

  // --- STUDENT INFO BAR ---
  doc.setFillColor(...colours.cream);
  doc.setDrawColor(...colours.secondary);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin.left, y, contentWidth, 12, 1.5, 1.5, 'FD');

  const studentName = report.studentName || 'Student';
  const studentClass = report.studentClass || report.studentSchool || 'General';
  const examDate = new Date(report.createdAt).toLocaleDateString('en-GB');

  doc.setTextColor(...colours.dark);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Student:', margin.left + 4, y + 7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...colours.primary);
  doc.text(pdfSafe(studentName), margin.left + 20, y + 7.5);

  doc.setTextColor(...colours.dark);
  doc.setFont('helvetica', 'bold');
  doc.text('Class/Group:', margin.left + 80, y + 7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...colours.primary);
  doc.text(pdfSafe(studentClass), margin.left + 104, y + 7.5);

  doc.setTextColor(...colours.dark);
  doc.setFont('helvetica', 'bold');
  doc.text('Date:', margin.left + 145, y + 7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...colours.primary);
  doc.text(pdfSafe(examDate), margin.left + 156, y + 7.5);

  y += 18;

  // --- MARKS OVERVIEW BOXES ---
  const boxW = (contentWidth - 8) / 3;
  const { marks } = report;

  // Total
  doc.setFillColor(...colours.primary);
  doc.roundedRect(margin.left, y, boxW, 20, 2, 2, 'F');
  doc.setTextColor(...colours.secondary);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL MARK', margin.left + boxW / 2, y + 6, { align: 'center' });
  doc.setTextColor(...colours.white);
  doc.setFontSize(16);
  doc.text(`${marks.total} / ${marks.total_max}`, margin.left + boxW / 2, y + 15, {
    align: 'center'
  });

  // Content
  doc.setFillColor(...colours.cream);
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(margin.left + boxW + 4, y, boxW, 20, 2, 2, 'FD');
  doc.setTextColor(...colours.gray);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('CONTENT & COMM.', margin.left + boxW + 4 + boxW / 2, y + 6, { align: 'center' });
  doc.setTextColor(...colours.primary);
  doc.setFontSize(15);
  doc.text(`${marks.content} / ${marks.content_max}`, margin.left + boxW + 4 + boxW / 2, y + 15, {
    align: 'center'
  });

  // Language
  doc.setFillColor(...colours.cream);
  doc.roundedRect(margin.left + (boxW + 4) * 2, y, boxW, 20, 2, 2, 'FD');
  doc.setTextColor(...colours.gray);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('LANGUAGE', margin.left + (boxW + 4) * 2 + boxW / 2, y + 6, { align: 'center' });
  doc.setTextColor(...colours.primary);
  doc.setFontSize(15);
  doc.text(
    `${marks.language} / ${marks.language_max}`,
    margin.left + (boxW + 4) * 2 + boxW / 2,
    y + 15,
    { align: 'center' }
  );

  y += 26;

  // --- TASK QUESTION ---
  addSectionHeader('TASK QUESTION', colours.primary);
  const questionParagraphs = parseMarkdownParagraphs(
    report.taskPrompt || 'No task question prompt recorded.',
    colours.primary
  );
  drawRichParagraphs(questionParagraphs, {
    x: margin.left + 2,
    maxWidth: contentWidth - 4,
    fontSize: 8.5,
    lineHeight: 4.3
  });
  y += 4;

  // --- STUDENT SUBMITTED ARTICLE ---
  addSectionHeader("STUDENT'S SUBMITTED RESPONSE", colours.primary);
  const words = countWords(report.finalText);
  addWrappedText(report.finalText || '', margin.left + 2, contentWidth - 4, 8.5, 4.2);
  y += 2;

  // Word count pill
  checkPageBreak(8);
  doc.setFillColor(...colours.cream);
  doc.setDrawColor(...colours.secondary);
  doc.roundedRect(margin.left + 2, y, 42, 5.5, 1.5, 1.5, 'FD');
  doc.setTextColor(...colours.dark);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Word Count: ${words} words`, margin.left + 5, y + 3.8);
  y += 10;

  // --- EXAMINER VERDICT ---
  addSectionHeader('EXAMINER VERDICT', colours.secondary);
  if (report.justification?.content) {
    drawRichParagraphs(
      [
        [
          { text: 'Content: ', bold: true, color: colours.primary },
          { text: report.justification.content, bold: false }
        ]
      ],
      { x: margin.left + 2, maxWidth: contentWidth - 4, fontSize: 8.5, lineHeight: 4.3 }
    );
    y += 1.5;
  }
  if (report.justification?.language) {
    drawRichParagraphs(
      [
        [
          { text: 'Language: ', bold: true, color: colours.primary },
          { text: report.justification.language, bold: false }
        ]
      ],
      { x: margin.left + 2, maxWidth: contentWidth - 4, fontSize: 8.5, lineHeight: 4.3 }
    );
    y += 3;
  }

  // --- ERRORS DETECTED TABLE ---
  const errors = Array.isArray(report.errors) ? report.errors : [];
  if (errors.length > 0) checkPageBreak(25);
  addSectionHeader(`ERRORS IDENTIFIED (${errors.length})`, colours.primary);

  if (errors.length === 0) {
    checkPageBreak(8);
    doc.setFillColor(...colours.lightGreen);
    doc.roundedRect(margin.left, y, contentWidth, 7, 1.5, 1.5, 'F');
    doc.setTextColor(...colours.success);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text('No significant errors flagged. Excellent control!', margin.left + 5, y + 4.8);
    y += 11;
  } else {
    const colWidths = [36, 46, 30, 68] as const;

    const drawErrorsTableHeader = (): void => {
      checkPageBreak(8);
      doc.setFillColor(235, 238, 243);
      doc.rect(margin.left, y, contentWidth, 6, 'F');
      doc.setTextColor(...colours.dark);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.text('Original', margin.left + 2, y + 4.2);
      doc.text('Correction', margin.left + colWidths[0] + 2, y + 4.2);
      doc.text('Type', margin.left + colWidths[0] + colWidths[1] + 2, y + 4.2);
      doc.text(
        'Explanation',
        margin.left + colWidths[0] + colWidths[1] + colWidths[2] + 2,
        y + 4.2
      );
      y += 6.5;
    };

    drawErrorsTableHeader();

    errors.forEach((errItem, idx) => {
      const orig = pdfSafe(errItem.original || '');
      const corr = pdfSafe(errItem.correction || '');
      const cat = pdfSafe(errItem.category || 'Error');
      const expl = pdfSafe(errItem.explanation || '');

      doc.setFontSize(7.5);
      const origLines = doc.splitTextToSize(orig, colWidths[0] - 4) as string[];
      const corrLines = doc.splitTextToSize(corr, colWidths[1] - 4) as string[];
      const catLines = doc.splitTextToSize(cat, colWidths[2] - 4) as string[];
      const explLines = doc.splitTextToSize(expl, colWidths[3] - 4) as string[];
      const rowLines = Math.max(
        explLines.length,
        origLines.length,
        corrLines.length,
        catLines.length,
        1
      );
      const rowHeight = Math.max(rowLines * 3.8 + 2.5, 6.5);

      if (checkPageBreak(rowHeight)) {
        drawErrorsTableHeader();
      }

      if (idx % 2 === 1) {
        doc.setFillColor(250, 250, 250);
        doc.rect(margin.left, y - 0.5, contentWidth, rowHeight, 'F');
      }

      doc.setTextColor(...colours.danger);
      doc.setFont('helvetica', 'normal');
      origLines.forEach((l, li) => doc.text(l, margin.left + 2, y + 3.5 + li * 3.8));

      doc.setTextColor(...colours.success);
      doc.setFont('helvetica', 'bold');
      corrLines.forEach((l, li) =>
        doc.text(l, margin.left + colWidths[0] + 2, y + 3.5 + li * 3.8)
      );

      doc.setTextColor(...colours.primary);
      doc.setFont('helvetica', 'normal');
      catLines.forEach((l, li) =>
        doc.text(l, margin.left + colWidths[0] + colWidths[1] + 2, y + 3.5 + li * 3.8)
      );

      doc.setTextColor(...colours.dark);
      explLines.forEach((l, li) =>
        doc.text(
          l,
          margin.left + colWidths[0] + colWidths[1] + colWidths[2] + 2,
          y + 3.5 + li * 3.8
        )
      );

      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.2);
      doc.line(margin.left, y + rowHeight - 0.5, margin.left + contentWidth, y + rowHeight - 0.5);

      y += rowHeight;
    });
    y += 5;
  }

  // --- CONTENT & EXPANSION FEEDBACK ---
  const feedback = Array.isArray(report.contentFeedback) ? report.contentFeedback : [];
  if (feedback.length > 0) {
    addSectionHeader('CONTENT & EXPANSION FEEDBACK', colours.success);
    for (const pt of feedback) {
      const safePt = pdfSafe(pt);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      const ptLines = doc.splitTextToSize(safePt, contentWidth - 9) as string[];
      const lineH = 4.3;
      checkPageBreak(ptLines.length * lineH + 1.5);

      doc.setFillColor(...colours.success);
      doc.circle(margin.left + 3.5, y - 1.1, 0.9, 'F');
      doc.setTextColor(...colours.dark);
      ptLines.forEach((line, li) => {
        doc.text(line, margin.left + 7, y + li * lineH);
      });
      y += ptLines.length * lineH + 1.5;
    }
    y += 4;
  }

  // --- CORRECTED VERSION ---
  if (report.correctedVersion) {
    checkPageBreak(24);
    addSectionHeader('CORRECTED VERSION (IMPROVED)', colours.primary);

    // Highlighted Correction Legend
    doc.setFillColor(...colours.highlightBg);
    doc.roundedRect(margin.left + 2, y - 1.5, 4, 3.2, 0.5, 0.5, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(...colours.gray);
    doc.text('Highlighted Correction', margin.left + 8, y + 1);
    y += 5;

    const correctedParagraphs = parseMarkParagraphs(report.correctedVersion);
    drawRichParagraphs(correctedParagraphs, {
      boxX: margin.left,
      boxWidth: contentWidth,
      boxBg: colours.lightGrayBg,
      boxBorder: colours.borderGray,
      padX: 4,
      padY: 4,
      fontSize: 8.5,
      lineHeight: 4.7,
      baselineOffset: 3.3
    });
    y += 5;
  }

  // --- PAGE NUMBERS FOOTER (Page X of Y) ---
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(...colours.gray);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `EdumenAI powered by EDUMENIA · ${report.exerciseCode.toUpperCase()}`,
      margin.left,
      290
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin.right, 290, { align: 'right' });
  }

  const safeName = (report.studentName || 'student').replace(/\s+/g, '_');
  const fileName = `EdumenAI_Report_${safeName}.pdf`;
  const blob = doc.output('blob');

  return { doc, blob, fileName };
}
