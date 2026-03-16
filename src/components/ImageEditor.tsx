import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Crop, 
  Maximize2, 
  Lock, 
  Unlock, 
  RotateCcw, 
  Download, 
  Check,
  Move,
  Info
} from 'lucide-react';
import { cn } from '../utils';

interface ImageEditorProps {
  file: File;
  onResult: (result: { blob: Blob; filename: string }) => void;
}

type ActiveTool = 'none' | 'crop' | 'resize';

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ImageEditor: React.FC<ImageEditorProps> = ({ file, onResult }) => {
  const [imageUrl, setImageUrl] = useState('');
  const [originalWidth, setOriginalWidth] = useState(0);
  const [originalHeight, setOriginalHeight] = useState(0);
  const [currentWidth, setCurrentWidth] = useState(0);
  const [currentHeight, setCurrentHeight] = useState(0);
  const [activeTool, setActiveTool] = useState<ActiveTool>('none');
  const [lockAspect, setLockAspect] = useState(true);
  const [aspectRatio, setAspectRatio] = useState(1);

  // Crop state
  const [cropArea, setCropArea] = useState<CropArea>({ x: 0, y: 0, width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragType, setDragType] = useState<'move' | 'resize'>('move');

  // Canvas for current image state
  const [currentImageData, setCurrentImageData] = useState<HTMLImageElement | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);

  // Load image on mount
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);

    const img = new Image();
    img.onload = () => {
      setOriginalWidth(img.width);
      setOriginalHeight(img.height);
      setCurrentWidth(img.width);
      setCurrentHeight(img.height);
      setAspectRatio(img.width / img.height);
      setCurrentImageData(img);

      // Default crop area = full image
      setCropArea({ x: 0, y: 0, width: img.width, height: img.height });
    };
    img.src = url;

    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Handle resize width change
  const handleWidthChange = useCallback((newWidth: number) => {
    if (newWidth < 1) return;
    setCurrentWidth(newWidth);
    if (lockAspect) {
      setCurrentHeight(Math.round(newWidth / aspectRatio));
    }
  }, [lockAspect, aspectRatio]);

  // Handle resize height change
  const handleHeightChange = useCallback((newHeight: number) => {
    if (newHeight < 1) return;
    setCurrentHeight(newHeight);
    if (lockAspect) {
      setCurrentWidth(Math.round(newHeight * aspectRatio));
    }
  }, [lockAspect, aspectRatio]);

  // Reset to original dimensions
  const handleReset = useCallback(() => {
    setCurrentWidth(originalWidth);
    setCurrentHeight(originalHeight);
    setCropArea({ x: 0, y: 0, width: originalWidth, height: originalHeight });
    setActiveTool('none');
  }, [originalWidth, originalHeight]);

  // Get display scale for crop overlay
  const getDisplayScale = useCallback(() => {
    if (!previewRef.current || !currentImageData) return 1;
    const containerWidth = previewRef.current.clientWidth;
    const imgDisplayWidth = Math.min(containerWidth, currentImageData.width);
    return imgDisplayWidth / currentImageData.width;
  }, [currentImageData]);

  // Crop mouse events
  const handleCropMouseDown = useCallback((e: React.MouseEvent, type: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragType(type);
    setDragStart({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCropMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !currentImageData) return;

    const scale = getDisplayScale();
    const dx = (e.clientX - dragStart.x) / scale;
    const dy = (e.clientY - dragStart.y) / scale;

    setCropArea(prev => {
      if (dragType === 'move') {
        const newX = Math.max(0, Math.min(currentImageData.width - prev.width, prev.x + dx));
        const newY = Math.max(0, Math.min(currentImageData.height - prev.height, prev.y + dy));
        return { ...prev, x: newX, y: newY };
      } else {
        const newW = Math.max(20, Math.min(currentImageData.width - prev.x, prev.width + dx));
        const newH = Math.max(20, Math.min(currentImageData.height - prev.y, prev.height + dy));
        return { ...prev, width: newW, height: newH };
      }
    });

    setDragStart({ x: e.clientX, y: e.clientY });
  }, [isDragging, dragStart, dragType, currentImageData, getDisplayScale]);

  const handleCropMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Apply crop using canvas
  const applyCrop = useCallback(() => {
    if (!currentImageData) return;

    const canvas = document.createElement('canvas');
    const cropX = Math.round(cropArea.x);
    const cropY = Math.round(cropArea.y);
    const cropW = Math.round(cropArea.width);
    const cropH = Math.round(cropArea.height);

    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(currentImageData, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    // Update the current image
    const newImg = new Image();
    newImg.onload = () => {
      setCurrentImageData(newImg);
      setCurrentWidth(cropW);
      setCurrentHeight(cropH);
      setAspectRatio(cropW / cropH);
      setCropArea({ x: 0, y: 0, width: cropW, height: cropH });
      setImageUrl(canvas.toDataURL(file.type || 'image/png'));
      setActiveTool('none');
    };
    newImg.src = canvas.toDataURL(file.type || 'image/png');
  }, [currentImageData, cropArea, file.type]);

  // Apply resize using canvas
  const applyResize = useCallback(() => {
    if (!currentImageData) return;

    const canvas = document.createElement('canvas');
    canvas.width = currentWidth;
    canvas.height = currentHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(currentImageData, 0, 0, currentWidth, currentHeight);

    const newImg = new Image();
    newImg.onload = () => {
      setCurrentImageData(newImg);
      setAspectRatio(currentWidth / currentHeight);
      setCropArea({ x: 0, y: 0, width: currentWidth, height: currentHeight });
      setImageUrl(canvas.toDataURL(file.type || 'image/png'));
      setActiveTool('none');
    };
    newImg.src = canvas.toDataURL(file.type || 'image/png');
  }, [currentImageData, currentWidth, currentHeight, file.type]);

  // Download / produce result
  const handleDownload = useCallback(() => {
    if (!currentImageData) return;

    const canvas = document.createElement('canvas');
    canvas.width = currentWidth;
    canvas.height = currentHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(currentImageData, 0, 0, currentWidth, currentHeight);

    const mimeType = file.type || 'image/png';
    const ext = mimeType.split('/')[1] || 'png';
    const baseName = file.name.replace(/\.[^.]+$/, '');

    canvas.toBlob(
      (blob) => {
        if (blob) {
          onResult({ blob, filename: `edited_${baseName}.${ext}` });
        }
      },
      mimeType,
      0.92
    );
  }, [currentImageData, currentWidth, currentHeight, file, onResult]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const scale = getDisplayScale();

  return (
    <div className="space-y-8">
      {/* Image Info Bar */}
      <div className="glass p-4 md:p-5 rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-linear-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center shrink-0">
              <Info className="w-5 h-5 md:w-6 md:h-6 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm md:text-base truncate">{file.name}</p>
              <p className="text-[10px] md:text-xs uppercase tracking-widest font-black opacity-50">
                {file.type.split('/')[1]?.toUpperCase()} • {formatSize(file.size)}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4 text-sm">
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-widest font-black opacity-50">Original</p>
              <p className="font-bold text-brand-primary">{originalWidth} × {originalHeight} px</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-widest font-black opacity-50">Current</p>
              <p className="font-bold text-emerald-400">{currentWidth} × {currentHeight} px</p>
            </div>
          </div>
        </div>
      </div>

      {/* Image Preview */}
      <div 
        ref={previewRef}
        className="relative glass rounded-2xl overflow-hidden flex items-center justify-center p-2"
        onMouseMove={activeTool === 'crop' ? handleCropMouseMove : undefined}
        onMouseUp={activeTool === 'crop' ? handleCropMouseUp : undefined}
        onMouseLeave={activeTool === 'crop' ? handleCropMouseUp : undefined}
      >
        {imageUrl && (
          <img 
            src={imageUrl} 
            alt="Preview" 
            className="max-w-full max-h-[400px] object-contain rounded-xl"
            draggable={false}
          />
        )}

        {/* Crop overlay */}
        {activeTool === 'crop' && currentImageData && (
          <div 
            className="absolute inset-0 flex items-center justify-center"
            style={{ pointerEvents: 'none' }}
          >
            {/* Dark overlay outside crop area */}
            <div 
              className="absolute inset-0 bg-black/50"
              style={{ pointerEvents: 'auto' }}
            />
            {/* Crop selection box */}
            <div
              className="absolute border-2 border-white bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] cursor-move"
              style={{
                left: `calc(50% - ${(currentImageData.width * scale) / 2}px + ${cropArea.x * scale}px)`,
                top: `calc(50% - ${(currentImageData.height * scale) / 2}px + ${cropArea.y * scale}px)`,
                width: `${cropArea.width * scale}px`,
                height: `${cropArea.height * scale}px`,
                pointerEvents: 'auto',
              }}
              onMouseDown={(e) => handleCropMouseDown(e, 'move')}
            >
              {/* Grid lines */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30" />
                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30" />
                <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30" />
                <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30" />
              </div>
              {/* Resize handle */}
              <div
                className="absolute -bottom-2 -right-2 w-5 h-5 bg-white rounded-full shadow-lg cursor-se-resize border-2 border-brand-primary"
                onMouseDown={(e) => handleCropMouseDown(e, 'resize')}
              />
              {/* Corner handles */}
              <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-white" />
              <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-white" />
              <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-white" />
            </div>
          </div>
        )}
      </div>

      {/* Tool Buttons */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <button
          onClick={() => {
            setActiveTool(activeTool === 'crop' ? 'none' : 'crop');
            if (currentImageData) {
              setCropArea({ x: currentImageData.width * 0.1, y: currentImageData.height * 0.1, width: currentImageData.width * 0.8, height: currentImageData.height * 0.8 });
            }
          }}
          className={cn(
            "p-4 md:p-5 rounded-2xl border-2 transition-all font-bold text-sm md:text-base flex flex-col items-center space-y-2",
            activeTool === 'crop'
              ? "bg-brand-primary border-brand-primary text-white shadow-lg shadow-brand-primary/30"
              : "glass border-white/10 hover:border-white/30"
          )}
        >
          <Crop className="w-5 h-5 md:w-6 md:h-6" />
          <span>Crop</span>
        </button>

        <button
          onClick={() => setActiveTool(activeTool === 'resize' ? 'none' : 'resize')}
          className={cn(
            "p-4 md:p-5 rounded-2xl border-2 transition-all font-bold text-sm md:text-base flex flex-col items-center space-y-2",
            activeTool === 'resize'
              ? "bg-brand-primary border-brand-primary text-white shadow-lg shadow-brand-primary/30"
              : "glass border-white/10 hover:border-white/30"
          )}
        >
          <Maximize2 className="w-5 h-5 md:w-6 md:h-6" />
          <span>Resize</span>
        </button>

        <button
          onClick={handleReset}
          className="p-4 md:p-5 rounded-2xl border-2 glass border-white/10 hover:border-white/30 transition-all font-bold text-sm md:text-base flex flex-col items-center space-y-2"
        >
          <RotateCcw className="w-5 h-5 md:w-6 md:h-6" />
          <span>Reset</span>
        </button>
      </div>

      {/* Crop Controls */}
      {activeTool === 'crop' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass p-5 md:p-6 rounded-2xl space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Move className="w-5 h-5 text-brand-primary" />
              <span className="font-bold text-sm md:text-base">Drag the crop box to select area</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
            <div className="glass p-3 rounded-xl">
              <p className="text-[10px] uppercase tracking-widest font-black opacity-50">X</p>
              <p className="font-bold">{Math.round(cropArea.x)} px</p>
            </div>
            <div className="glass p-3 rounded-xl">
              <p className="text-[10px] uppercase tracking-widest font-black opacity-50">Y</p>
              <p className="font-bold">{Math.round(cropArea.y)} px</p>
            </div>
            <div className="glass p-3 rounded-xl">
              <p className="text-[10px] uppercase tracking-widest font-black opacity-50">Width</p>
              <p className="font-bold">{Math.round(cropArea.width)} px</p>
            </div>
            <div className="glass p-3 rounded-xl">
              <p className="text-[10px] uppercase tracking-widest font-black opacity-50">Height</p>
              <p className="font-bold">{Math.round(cropArea.height)} px</p>
            </div>
          </div>
          <button
            onClick={applyCrop}
            className="w-full btn-primary py-3 md:py-4 text-base md:text-lg shadow-xl"
          >
            <Check className="w-5 h-5 mr-2" />
            Apply Crop
          </button>
        </motion.div>
      )}

      {/* Resize Controls */}
      {activeTool === 'resize' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass p-5 md:p-6 rounded-2xl space-y-5"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm md:text-base">Resize Dimensions</span>
            <button
              onClick={() => setLockAspect(!lockAspect)}
              className={cn(
                "flex items-center space-x-2 px-3 py-2 rounded-xl text-xs md:text-sm font-bold transition-all",
                lockAspect 
                  ? "bg-brand-primary/20 text-brand-primary border border-brand-primary/30" 
                  : "glass border-white/10"
              )}
            >
              {lockAspect ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              <span>Aspect Ratio</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] md:text-xs uppercase tracking-widest font-black opacity-50">Width (px)</label>
              <input
                type="number"
                value={currentWidth}
                onChange={(e) => handleWidthChange(Number(e.target.value))}
                className="w-full px-4 py-3 rounded-xl glass border border-white/10 focus:border-brand-primary/50 outline-none font-bold text-lg bg-transparent transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] md:text-xs uppercase tracking-widest font-black opacity-50">Height (px)</label>
              <input
                type="number"
                value={currentHeight}
                onChange={(e) => handleHeightChange(Number(e.target.value))}
                className="w-full px-4 py-3 rounded-xl glass border border-white/10 focus:border-brand-primary/50 outline-none font-bold text-lg bg-transparent transition-all"
              />
            </div>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: '50%', w: Math.round(originalWidth * 0.5), h: Math.round(originalHeight * 0.5) },
              { label: '75%', w: Math.round(originalWidth * 0.75), h: Math.round(originalHeight * 0.75) },
              { label: '1080p', w: 1920, h: 1080 },
              { label: '720p', w: 1280, h: 720 },
            ].map((preset) => (
              <button
                key={preset.label}
                onClick={() => { setCurrentWidth(preset.w); setCurrentHeight(preset.h); }}
                className="px-3 py-1.5 rounded-lg glass border border-white/10 hover:border-brand-primary/30 text-xs font-bold transition-all"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <button
            onClick={applyResize}
            className="w-full btn-primary py-3 md:py-4 text-base md:text-lg shadow-xl"
          >
            <Check className="w-5 h-5 mr-2" />
            Apply Resize
          </button>
        </motion.div>
      )}

      {/* Download Button */}
      <button
        onClick={handleDownload}
        className="w-full btn-primary py-4 md:py-6 text-xl md:text-2xl shadow-2xl"
      >
        <Download className="w-6 h-6 mr-3" />
        Download Edited Image
      </button>
    </div>
  );
};
