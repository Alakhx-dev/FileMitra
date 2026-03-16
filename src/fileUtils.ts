// Heavy libraries (pdf-lib, jszip, mammoth, docx) are loaded lazily via dynamic import()
// so they don't block the main thread or slow down the file picker interaction.

export interface ProcessingResult {
  blob: Blob;
  filename: string;
}

// Convert a WEBP image to PNG bytes via an offscreen canvas
const webpToPngBytes = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas context failed')); return; }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
          blob.arrayBuffer().then(resolve).catch(reject);
        }, 'image/png');
      };
      img.onerror = () => reject(new Error('Failed to load WEBP image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read WEBP file'));
    reader.readAsDataURL(file);
  });
};

export const mergeFiles = async (files: File[]): Promise<ProcessingResult> => {
  const { PDFDocument } = await import('pdf-lib');
  const mergedPdf = await PDFDocument.create();

  for (const file of files) {
    const fileType = file.type.toLowerCase();

    if (fileType === 'application/pdf') {
      // PDF: copy all pages into the merged document
      const pdfBytes = await file.arrayBuffer();
      const pdf = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));

    } else if (fileType === 'image/jpeg' || fileType === 'image/jpg') {
      const imageBytes = await file.arrayBuffer();
      const image = await mergedPdf.embedJpg(imageBytes);
      const page = mergedPdf.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

    } else if (fileType === 'image/png') {
      const imageBytes = await file.arrayBuffer();
      const image = await mergedPdf.embedPng(imageBytes);
      const page = mergedPdf.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

    } else if (fileType === 'image/webp') {
      // pdf-lib doesn't support WEBP natively — convert to PNG first
      const pngBytes = await webpToPngBytes(file);
      const image = await mergedPdf.embedPng(pngBytes);
      const page = mergedPdf.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

    } else {
      console.warn(`Skipping unsupported file type: ${file.type} (${file.name})`);
    }
  }

  const pdfBytes = await mergedPdf.save();
  return {
    blob: new Blob([pdfBytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
    filename: 'merged.pdf',
  };
};

export const imagesToPDF = async (files: File[]): Promise<ProcessingResult> => {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  for (const file of files) {
    const imageBytes = await file.arrayBuffer();
    let image;
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      image = await pdfDoc.embedJpg(imageBytes);
    } else if (file.type === 'image/png') {
      image = await pdfDoc.embedPng(imageBytes);
    } else {
      continue; // Skip unsupported types for now
    }

    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }
  const pdfBytes = await pdfDoc.save();
  return {
    blob: new Blob([pdfBytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
    filename: 'images.pdf',
  };
};

export const textToPDF = async (file: File): Promise<ProcessingResult> => {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const text = await file.text();
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const fontSize = 12;
  const margin = 50;
  const lineHeight = 15;

  // Normalize line endings and sanitize text for WinAnsi encoding
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, '    ');
  const sanitizedText = normalizedText.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');

  const paragraphs = sanitizedText.split('\n');
  let page = pdfDoc.addPage();
  let { width, height } = page.getSize();
  let cursorY = height - margin;

  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const textWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (textWidth > width - (margin * 2)) {
        if (cursorY < margin + lineHeight) {
          page = pdfDoc.addPage();
          cursorY = height - margin;
        }
        page.drawText(currentLine, {
          x: margin,
          y: cursorY,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
        cursorY -= lineHeight;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    // Draw the last line of the paragraph
    if (currentLine) {
      if (cursorY < margin + lineHeight) {
        page = pdfDoc.addPage();
        cursorY = height - margin;
      }
      page.drawText(currentLine, {
        x: margin,
        y: cursorY,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
      cursorY -= lineHeight;
    }

    // Add extra space between paragraphs
    cursorY -= lineHeight / 2;
  }

  const pdfBytes = await pdfDoc.save();
  return {
    blob: new Blob([pdfBytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
    filename: `${file.name.split('.')[0]}.pdf`,
  };
};

export const docxToPDF = async (file: File): Promise<ProcessingResult> => {
  const [{ PDFDocument, rgb, StandardFonts }, mammoth] = await Promise.all([
    import('pdf-lib'),
    import('mammoth'),
  ]);
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = result.value;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const fontSize = 12;
  const margin = 50;
  const lineHeight = 15;

  // Normalize line endings and sanitize text
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, '    ');
  const sanitizedText = normalizedText.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');
  const paragraphs = sanitizedText.split('\n');

  let page = pdfDoc.addPage();
  let { width, height } = page.getSize();
  let cursorY = height - margin;

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      cursorY -= lineHeight;
      continue;
    }

    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const textWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (textWidth > width - (margin * 2)) {
        if (cursorY < margin + lineHeight) {
          page = pdfDoc.addPage();
          cursorY = height - margin;
        }
        page.drawText(currentLine, { x: margin, y: cursorY, size: fontSize, font, color: rgb(0, 0, 0) });
        cursorY -= lineHeight;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      if (cursorY < margin + lineHeight) {
        page = pdfDoc.addPage();
        cursorY = height - margin;
      }
      page.drawText(currentLine, { x: margin, y: cursorY, size: fontSize, font, color: rgb(0, 0, 0) });
      cursorY -= lineHeight;
    }
    cursorY -= lineHeight / 2;
  }

  const pdfBytes = await pdfDoc.save();
  return {
    blob: new Blob([pdfBytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
    filename: `${file.name.split('.')[0]}.pdf`,
  };
};

export const docxToText = async (file: File): Promise<ProcessingResult> => {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return {
    blob: new Blob([result.value], { type: 'text/plain' }),
    filename: `${file.name.split('.')[0]}.txt`,
  };
};

export const createZip = async (files: File[]): Promise<ProcessingResult> => {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  files.forEach((file) => {
    zip.file(file.name, file);
  });
  const content = await zip.generateAsync({ type: 'blob' });
  return {
    blob: content,
    filename: 'archive.zip',
  };
};

export const compressImageClient = async (file: File, sliderValue: number): Promise<ProcessingResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        // Slider = compression amount: higher slider → more compression → lower quality
        // Slider 10 → quality 0.9 (light), Slider 50 → 0.5, Slider 80 → 0.2
        let canvasQuality = 1 - (sliderValue / 100);
        canvasQuality = Math.max(0.05, Math.min(0.95, canvasQuality)); // Clamp to safe range

        // Downscale dimensions for heavy compression (slider >= 60)
        let targetWidth = img.width;
        let targetHeight = img.height;
        if (sliderValue >= 60) {
          // Scale from 90% down to 70% as slider goes 60→100
          const scaleFactor = 0.9 - ((sliderValue - 60) / 40) * 0.2; // 0.9 → 0.7
          targetWidth = Math.round(img.width * scaleFactor);
          targetHeight = Math.round(img.height * scaleFactor);
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas context failed')); return; }
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // PNG: canvas.toBlob ignores quality for image/png (always lossless)
        // So for any meaningful compression, convert PNG to JPEG when slider >= 40
        const isOriginalPng = file.type === 'image/png';
        const outputMime = (isOriginalPng && sliderValue < 40) ? 'image/png' : 'image/jpeg';
        const ext = outputMime === 'image/png' ? 'png' : 'jpg';
        const baseName = file.name.replace(/\.[^.]+$/, '');

        // Try compression, retry with lower quality if output is still larger
        const tryCompress = (q: number) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) { reject(new Error('Canvas toBlob failed')); return; }

              if (blob.size >= file.size && q > 0.1) {
                // Output is larger — retry with lower quality
                tryCompress(q - 0.1);
              } else if (blob.size >= file.size) {
                // Even at minimum quality it's larger — return original
                resolve({
                  blob: file,
                  filename: file.name,
                });
              } else {
                resolve({
                  blob,
                  filename: `compressed_${baseName}.${ext}`,
                });
              }
            },
            outputMime,
            q
          );
        };

        tryCompress(canvasQuality);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
  });
};

export const resizeImage = async (file: File, width: number, height: number): Promise<ProcessingResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({
                blob,
                filename: `resized_${file.name}`,
              });
            } else {
              reject(new Error('Canvas toBlob failed'));
            }
          },
          file.type,
          0.9
        );
      };
    };
    reader.onerror = (error) => reject(error);
  });
};

export const convertImage = async (file: File, format: string): Promise<ProcessingResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);

        const mimeType = `image/${format.toLowerCase()}`;
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({
                blob,
                filename: `${file.name.split('.')[0]}.${format.toLowerCase()}`,
              });
            } else {
              reject(new Error('Canvas toBlob failed'));
            }
          },
          mimeType,
          0.9
        );
      };
    };
    reader.onerror = (error) => reject(error);
  });
};
