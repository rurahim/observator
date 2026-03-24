/**
 * Dashboard export utilities — PDF and PNG capture via html2canvas + jsPDF.
 *
 * Both functions capture the full scrollable height of the target element so
 * content that is clipped by overflow:auto/hidden is still included in the
 * export.
 */

// Dynamic imports — html2canvas + jspdf are loaded on-demand (618KB combined)
// so they don't bloat the initial bundle.

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface CaptureOptions {
  /** Scale multiplier — higher = crisper image, larger file. Default 2. */
  scale?: number;
}

/**
 * Temporarily override the element's height so html2canvas sees every pixel
 * of scrollable content, then restore the original style afterward.
 */
async function captureFullHeight(
  element: HTMLElement,
  options: CaptureOptions = {},
): Promise<HTMLCanvasElement> {
  const scale = options.scale ?? 2;

  // Preserve the original overflow / height so we can restore them.
  const originalOverflow = element.style.overflow;
  const originalMaxHeight = element.style.maxHeight;
  const originalHeight = element.style.height;

  // Expand the element to its full scrollable height before capture.
  element.style.overflow = 'visible';
  element.style.maxHeight = 'none';
  element.style.height = `${element.scrollHeight}px`;

  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      // Tell html2canvas to capture the full expanded size.
      width: element.scrollWidth,
      height: element.scrollHeight,
      scrollX: 0,
      scrollY: 0,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
      logging: false,
    });
    return canvas;
  } finally {
    // Always restore original styles even if capture throws.
    element.style.overflow = originalOverflow;
    element.style.maxHeight = originalMaxHeight;
    element.style.height = originalHeight;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Capture `element` and save it as a multi-page A4 PDF.
 *
 * The image is fitted to A4 width; if the content is taller than one A4 page
 * it is split across additional pages automatically.
 *
 * @param element  The DOM element to capture.
 * @param filename Desired filename **without** the `.pdf` extension.
 * @param onProgress Optional callback — called with 'capturing' and 'saving'
 *                   so callers can update UI loading state.
 */
export async function exportToPDF(
  element: HTMLElement,
  filename: string,
  onProgress?: (stage: 'capturing' | 'saving' | 'done') => void,
): Promise<void> {
  onProgress?.('capturing');

  const canvas = await captureFullHeight(element, { scale: 2 });

  onProgress?.('saving');

  // A4 dimensions in millimetres.
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;

  const imgWidth = A4_WIDTH_MM;
  // Proportional height of the image at A4 width.
  const imgHeight = (canvas.height * A4_WIDTH_MM) / canvas.width;

  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: imgHeight > A4_HEIGHT_MM ? 'portrait' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

  if (imgHeight <= A4_HEIGHT_MM) {
    // Single page — vertically centre the image if shorter than A4.
    const yOffset = (A4_HEIGHT_MM - imgHeight) / 2;
    pdf.addImage(dataUrl, 'JPEG', 0, yOffset, imgWidth, imgHeight);
  } else {
    // Multi-page — slice the canvas image across A4 pages.
    let remainingHeight = imgHeight;
    let yPosition = 0;

    while (remainingHeight > 0) {
      const sliceHeight = Math.min(remainingHeight, A4_HEIGHT_MM);
      pdf.addImage(dataUrl, 'JPEG', 0, -yPosition, imgWidth, imgHeight);

      remainingHeight -= A4_HEIGHT_MM;
      yPosition += A4_HEIGHT_MM;

      if (remainingHeight > 0) {
        pdf.addPage();
      }
    }
  }

  pdf.save(`${filename}.pdf`);
  onProgress?.('done');
}

/**
 * Capture `element` and download it as a full-resolution PNG.
 *
 * @param element  The DOM element to capture.
 * @param filename Desired filename **without** the `.png` extension.
 * @param onProgress Optional callback for loading state management.
 */
export async function exportToPNG(
  element: HTMLElement,
  filename: string,
  onProgress?: (stage: 'capturing' | 'saving' | 'done') => void,
): Promise<void> {
  onProgress?.('capturing');

  const canvas = await captureFullHeight(element, { scale: 2 });

  onProgress?.('saving');

  // Trigger browser download via a temporary anchor element.
  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  onProgress?.('done');
}
