import React, { useState, useRef, useCallback, DragEvent } from 'react';
import { Upload, File as FileIcon, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../utils';

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  accept?: Record<string, string[]>;
  multiple?: boolean;
}

// Schedule work when the browser is idle, with a fallback for unsupported browsers
const scheduleIdle = (cb: () => void) => {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(cb);
  } else {
    setTimeout(cb, 0);
  }
};

export const FileUploader: React.FC<FileUploaderProps> = ({ onFilesSelected, accept, multiple = true }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate image previews in idle time so it never blocks the main thread
  const generatePreviews = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      if (file.type.startsWith('image/')) {
        scheduleIdle(() => {
          const reader = new FileReader();
          reader.onload = (e) => {
            setPreviews(prev => [...prev, e.target?.result as string]);
          };
          reader.readAsDataURL(file);
        });
      }
    });
  }, []);

  // Handle files after selection — this runs AFTER the file picker closes
  const handleFiles = useCallback((acceptedFiles: File[]) => {
    const newFiles = multiple ? [...files, ...acceptedFiles] : acceptedFiles;
    setFiles(newFiles);
    onFilesSelected(newFiles);
    generatePreviews(acceptedFiles);
  }, [files, multiple, onFilesSelected, generatePreviews]);

  // Click handler: ONLY opens the native file picker — zero other logic
  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  // File input change: runs only AFTER user picks files
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      handleFiles(Array.from(selectedFiles));
    }
    // Reset so the same file can be re-selected
    e.target.value = '';
  }, [handleFiles]);

  // Lightweight drag-and-drop handlers — only set a boolean flag, no heavy work
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    const droppedFiles = e.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      handleFiles(Array.from(droppedFiles));
    }
  }, [handleFiles]);

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    onFilesSelected(newFiles);
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Build accept string for native input from the Accept record
  const acceptString = accept
    ? Object.entries(accept).flatMap(([mime, exts]: [string, string[]]) => [mime, ...exts]).join(',')
    : undefined;

  return (
    <div className="w-full space-y-6">
      {/* Hidden native file input — only thing that runs on click */}
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={acceptString}
        onChange={handleInputChange}
        className="hidden"
      />

      <div
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative group cursor-pointer transition-all duration-700 overflow-hidden",
          "rounded-[32px] p-6 md:p-16 text-center",
          isDragActive 
            ? "bg-brand-primary/10 scale-[1.02]" 
            : "bg-white/5 hover:bg-white/10"
        )}
      >
        {/* Animated border overlay */}
        <div className={cn(
          "absolute inset-0 pointer-events-none transition-opacity duration-500",
          isDragActive ? "opacity-100" : "opacity-40 group-hover:opacity-100"
        )}>
          <svg width="100%" height="100%" className="absolute inset-0">
            <rect 
              width="100%" 
              height="100%" 
              fill="none" 
              rx="32" 
              ry="32" 
              stroke="currentColor" 
              strokeWidth="4" 
              strokeDasharray="12 12" 
              className={cn(
                "text-brand-primary/50",
                isDragActive && "animate-[dash_10s_linear_infinite]"
              )}
            />
          </svg>
        </div>

        <div className="relative z-10 space-y-4 md:space-y-6">
          <motion.div 
            animate={isDragActive ? { scale: 1.1, rotate: 5 } : { scale: 1, rotate: 0 }}
            className="mx-auto w-20 h-20 md:w-24 md:h-24 rounded-3xl bg-linear-to-br from-brand-primary/20 to-brand-secondary/20 flex items-center justify-center shadow-2xl"
          >
            <Upload className={cn("w-10 h-10 md:w-12 md:h-12 transition-colors", isDragActive ? "text-brand-primary" : "text-brand-primary/60")} />
          </motion.div>
          <div className="space-y-2">
            <h3 className="text-2xl md:text-3xl font-black tracking-tight">
              {isDragActive ? "Release to Upload" : "Drop your files here"}
            </h3>
            <p className="text-base md:text-lg text-muted-foreground font-medium">
              or <span className="text-brand-primary underline decoration-2 underline-offset-4">browse files</span> from your device
            </p>
            {multiple && (
              <p className="text-xs uppercase tracking-widest font-black opacity-30 pt-2">Multiple files supported</p>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {files.map((file, index) => (
              <motion.div
                key={`${file.name}-${index}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ scale: 1.02 }}
                className="glass-card p-5 flex items-center justify-between group relative overflow-hidden border-white/5"
              >
                <div className="flex items-center space-x-3 md:space-x-5 relative z-10 min-w-0">
                  <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-white/5 flex items-center justify-center overflow-hidden shadow-inner shrink-0">
                    {file.type.startsWith('image/') && previews[index] ? (
                      <img src={previews[index]} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="p-2 md:p-3 bg-brand-primary/10 rounded-lg md:rounded-xl">
                        <FileIcon className="w-4 h-4 md:w-6 md:h-6 text-brand-primary" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold truncate text-sm md:text-base">{file.name}</p>
                    <div className="flex items-center space-x-2 md:space-x-3">
                      <p className="text-[8px] md:text-[10px] uppercase tracking-widest font-black opacity-40">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                      <span className="w-1 h-1 rounded-full bg-white/20" />
                      <p className="text-[8px] md:text-[10px] uppercase tracking-widest font-black text-brand-primary">Ready</p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                  className="relative z-20 p-3 hover:bg-red-500/20 text-muted-foreground hover:text-red-500 rounded-2xl transition-all duration-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
