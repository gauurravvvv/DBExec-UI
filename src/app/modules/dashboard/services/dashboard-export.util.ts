/**
 * dashboard-export.util — client-side export of a dashboard to PNG / PDF,
 * and of a single visual's data to CSV.
 *
 * Everything runs in the browser (no server round-trip, no external CDN):
 *   - PNG/PDF: html2canvas rasterises the dashboard grid DOM node, then
 *     jsPDF lays the raster onto one or more pages. Both libs are bundled.
 *   - CSV: a pure string builder over the already-rendered row objects.
 *
 * These are deliberately framework-free functions (not an Angular service)
 * so the standalone embed viewer can reuse them without pulling in the
 * dashboard module's DI graph.
 */
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/** Trigger a browser download of a Blob under `filename`. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so the click's navigation has committed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Sanitise an arbitrary title into a safe file stem. */
function safeName(title: string | undefined, fallback: string): string {
  const base = (title || fallback).trim().replace(/[^\w\-]+/g, '_');
  return base.length ? base : fallback;
}

/**
 * Rasterise a DOM node with html2canvas. `backgroundColor: null` preserves
 * the app's own background (theme-aware); scale 2 gives a crisp export on
 * hi-dpi. Returns the canvas so callers pick PNG vs PDF.
 */
async function rasterise(node: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(node, {
    backgroundColor: null,
    scale: Math.min(2, window.devicePixelRatio || 1) || 1,
    useCORS: true,
    logging: false,
    // Ignore any element explicitly opted out (e.g. the export toolbar
    // itself) so it doesn't appear in the capture.
    ignoreElements: el => el.hasAttribute('data-export-ignore'),
  });
}

/** Export the given dashboard DOM node as a PNG download. */
export async function exportDashboardPng(
  node: HTMLElement,
  title?: string,
): Promise<void> {
  const canvas = await rasterise(node);
  await new Promise<void>(resolve => {
    canvas.toBlob(blob => {
      if (blob) downloadBlob(blob, `${safeName(title, 'dashboard')}.png`);
      resolve();
    }, 'image/png');
  });
}

/**
 * Export the given dashboard DOM node as a PDF download. The raster is
 * scaled to fit the page width; tall dashboards spill onto extra pages so
 * nothing is clipped.
 */
export async function exportDashboardPdf(
  node: HTMLElement,
  title?: string,
): Promise<void> {
  const canvas = await rasterise(node);
  const imgData = canvas.toDataURL('image/png');

  // Landscape A4 in points; pick orientation by the capture's aspect.
  const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  // Scale the raster to the page width; compute its rendered height.
  const renderW = pageW;
  const renderH = (canvas.height * renderW) / canvas.width;

  if (renderH <= pageH) {
    pdf.addImage(imgData, 'PNG', 0, 0, renderW, renderH);
  } else {
    // Taller than one page — slice vertically across pages.
    let remaining = renderH;
    let offsetY = 0;
    while (remaining > 0) {
      pdf.addImage(imgData, 'PNG', 0, offsetY, renderW, renderH);
      remaining -= pageH;
      offsetY -= pageH;
      if (remaining > 0) pdf.addPage();
    }
  }
  pdf.save(`${safeName(title, 'dashboard')}.pdf`);
}

/** RFC-4180-ish CSV cell: quote when it contains a comma, quote, or newline. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Export an array of row objects to a CSV download. Columns are the union
 * of keys across rows (stable first-seen order) unless `columns` is given.
 */
export function exportRowsCsv(
  rows: Array<Record<string, unknown>>,
  title?: string,
  columns?: string[],
): void {
  const cols =
    columns && columns.length
      ? columns
      : Array.from(
          rows.reduce((set, r) => {
            Object.keys(r || {}).forEach(k => set.add(k));
            return set;
          }, new Set<string>()),
        );

  const header = cols.map(csvCell).join(',');
  const body = rows
    .map(r => cols.map(c => csvCell(r?.[c])).join(','))
    .join('\r\n');
  // Prepend a UTF-8 BOM so Excel opens non-ASCII correctly.
  const csv = '﻿' + header + '\r\n' + body;
  downloadBlob(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    `${safeName(title, 'data')}.csv`,
  );
}
