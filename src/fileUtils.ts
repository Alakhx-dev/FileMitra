import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun } from 'docx';

export interface ProcessingResult {
  blob: Blob;
  filename: string;
}

export const mergePDFs = async (files: File[]): Promise<ProcessingResult> => {
  const mergedPdf = await PDFDocument.create();
  for (const file of files) {
    const pdfBytes = await file.arrayBuffer();
    const pdf = await PDFDocument.load(pdfBytes);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }
  const pdfBytes = await mergedPdf.save();
  return {
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    filename: 'merged.pdf',
  };
};

export const imagesToPDF = async (files: File[]): Promise<ProcessingResult> => {
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
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    filename: 'images.pdf',
  };
};

export const textToPDF = async (file: File): Promise<ProcessingResult> => {
  const text = await file.text();
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  const fontSize = 12;
  const margin = 50;
  const lineHeight = 15;
  
  // Normalize line endings and sanitize text for WinAnsi encoding
  // StandardFonts.Helvetica only supports WinAnsi, which doesn't include \r (0x0d) or \t (0x09)
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
        // Draw current line and start a new one
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
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    filename: `${file.name.split('.')[0]}.pdf`,
  };
};

export const docxToPDF = async (file: File): Promise<ProcessingResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = result.value;
  
  // Reuse textToPDF logic but with the extracted text
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
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    filename: `${file.name.split('.')[0]}.pdf`,
  };
};

export const docxToText = async (file: File): Promise<ProcessingResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return {
    blob: new Blob([result.value], { type: 'text/plain' }),
    filename: `${file.name.split('.')[0]}.txt`,
  };
};

export const createZip = async (files: File[]): Promise<ProcessingResult> => {
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

export const compressImageClient = async (file: File, quality: number): Promise<ProcessingResult> => {
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
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({
                blob,
                filename: `compressed_${file.name}`,
              });
            } else {
              reject(new Error('Canvas toBlob failed'));
            }
          },
          file.type,
          quality / 100
        );
      };
    };
    reader.onerror = (error) => reject(error);
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
