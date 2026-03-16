import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  Image as ImageIcon, 
  FileArchive, 
  Layers, 
  Minimize2, 
  Settings2, 
  ArrowRight, 
  Moon, 
  Sun, 
  Github,
  CheckCircle2,
  Loader2,
  Download,
  Zap,
  Shield,
  Smartphone,
  TrendingDown,
  Info
} from 'lucide-react';
import { ThemeProvider, useTheme } from './ThemeContext';
import { FileUploader } from './components/FileUploader';
import { ImageEditor } from './components/ImageEditor';
import { cn } from './utils';
import { 
  mergeFiles, 
  imagesToPDF, 
  textToPDF, 
  docxToText, 
  docxToPDF,
  createZip, 
  compressImageClient,
  resizeImage,
  convertImage
} from './fileUtils';
import confetti from 'canvas-confetti';

type WorkflowStep = 'idle' | 'toolSelected' | 'configuring' | 'processing' | 'result';
type ActionType = 'convert' | 'compress' | 'merge' | 'resize' | 'image' | null;

const FloatingIcons = () => {
  const icons = [FileText, ImageIcon, FileArchive, Layers];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-10">
      {icons.map((Icon, i) => (
        <motion.div
          key={i}
          initial={{ 
            x: `${(i + 1) * 20}%`, 
            y: `${(i + 1) * 15}%`,
            rotate: 0
          }}
          animate={{ 
            y: [`${(i + 1) * 15}%`, `${(i + 1) * 15 + 5}%`, `${(i + 1) * 15}%`],
            rotate: [0, 10, 0]
          }}
          transition={{ 
            duration: 10 + i * 2, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
          className="absolute"
        >
          <Icon className="w-16 h-16 md:w-32 md:h-32 text-brand-primary/20" />
        </motion.div>
      ))}
    </div>
  );
};

const AppContent = () => {
  const { theme, toggleTheme } = useTheme();
  const [step, setStep] = useState<WorkflowStep>('idle');
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [outputFormat, setOutputFormat] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null);
  const [quality, setQuality] = useState(80);
  const [originalFileSize, setOriginalFileSize] = useState(0);

  const getFileCategory = (file: File) => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type === 'application/pdf') return 'pdf';
    if (file.type.includes('word') || file.type.includes('officedocument.wordprocessingml')) return 'document';
    if (file.type.includes('spreadsheet') || file.type.includes('excel')) return 'spreadsheet';
    if (file.type.includes('presentation') || file.type.includes('powerpoint')) return 'presentation';
    return 'other';
  };

  const getConversionOptions = () => {
    if (selectedFiles.length === 0) return [];
    const category = getFileCategory(selectedFiles[0]);
    
    switch (category) {
      case 'image':
        return ['JPG', 'PNG', 'WEBP', 'PDF'];
      case 'pdf':
        return ['DOCX', 'JPG', 'PNG'];
      case 'document':
        return ['PDF', 'TXT', 'DOCX'];
      default:
        return ['PDF', 'DOCX', 'XLSX', 'PPTX'];
    }
  };

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
    if (activeAction === 'convert' || activeAction === 'compress' || activeAction === 'image') {
      if (files.length > 0) {
        setOriginalFileSize(files[0].size);
      }
      setStep('configuring');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const estimatedSize = useMemo(() => {
    if (selectedFiles.length === 0 || originalFileSize === 0) return 0;
    // Match the actual compression: quality = 1 - (slider / 100)
    const qualityFactor = 1 - (quality / 100);
    // Downscaling kicks in at slider >= 60
    const scaleFactor = quality >= 60 
      ? (0.9 - ((quality - 60) / 40) * 0.2) ** 2  // area ratio of 0.9→0.7
      : 1;
    const estimated = Math.round(originalFileSize * Math.max(qualityFactor, 0.05) * scaleFactor);
    return Math.min(estimated, originalFileSize);
  }, [quality, originalFileSize, selectedFiles]);

  const handleActionSelect = (action: ActionType) => {
    setActiveAction(action);
    setStep('toolSelected');
    setSelectedFiles([]);
    setResult(null);
    setOutputFormat('');
  };

  const scrollToTools = () => {
    const element = document.getElementById('tools');
    element?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleProcess = async (actionOverride?: ActionType) => {
    const action = actionOverride || activeAction;
    if (selectedFiles.length === 0) return;
    
    setIsProcessing(true);
    setStep('processing');
    
    try {
      let res;
      if (action === 'merge') {
        res = await mergeFiles(selectedFiles);
      } else if (action === 'compress') {
        res = await compressImageClient(selectedFiles[0], quality);
      } else if (action === 'resize') {
        res = await resizeImage(selectedFiles[0], 800, 600); // Default resize for now
      } else if (action === 'convert') {
        const file = selectedFiles[0];
        const category = getFileCategory(file);
        
        if (category === 'document' && outputFormat === 'PDF') {
          res = await docxToPDF(file);
        } else if (category === 'document' && outputFormat === 'TXT') {
          res = await docxToText(file);
        } else if (category === 'image' && outputFormat === 'PDF') {
          res = await imagesToPDF([file]);
        } else if (category === 'image' && ['JPG', 'PNG', 'WEBP'].includes(outputFormat)) {
          res = await convertImage(file, outputFormat);
        } else if (file.type === 'text/plain' && outputFormat === 'PDF') {
          res = await textToPDF(file);
        } else {
          alert(`Conversion to ${outputFormat} is coming soon!`);
          setIsProcessing(false);
          setStep('configuring');
          return;
        }
      }
      
      if (res) {
        setResult(res);
        setStep('result');
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.6 },
          colors: ['#6366f1', '#a855f7', '#ec4899']
        });
      }
    } catch (error) {
      console.error(error);
      alert('Processing failed. Please try again.');
      setStep('toolSelected');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadResult = () => {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tools = [
    { id: 'convert', name: 'Convert', icon: FileText, desc: 'PDF to Word, Image to PDF, and more.', color: 'from-blue-500 to-cyan-500' },
    { id: 'merge', name: 'Merge', icon: Layers, desc: 'Combine multiple PDFs or images into one.', color: 'from-purple-500 to-pink-500' },
    { id: 'compress', name: 'Compress', icon: Minimize2, desc: 'Reduce file size without losing quality.', color: 'from-orange-500 to-red-500' },
    { id: 'image', name: 'Image Tools', icon: ImageIcon, desc: 'Resize, crop, and optimize images.', color: 'from-emerald-500 to-teal-500' },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-slate-900 dark:text-white selection:bg-brand-primary/30 font-sans">
      {/* Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-primary/10 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-brand-accent/10 rounded-full blur-[150px] animate-pulse" />
        <FloatingIcons />
      </div>

      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 glass border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center space-x-2 md:space-x-3 cursor-pointer group" onClick={() => setStep('idle')}>
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-linear-to-br from-brand-primary to-brand-secondary flex items-center justify-center shadow-lg shadow-brand-primary/20 group-hover:rotate-12 transition-transform duration-500">
              <Zap className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <span className="text-lg md:text-2xl font-black tracking-tighter">File Mitra</span>
          </div>
          
          <div className="flex items-center space-x-3 md:space-x-6">
            <button onClick={toggleTheme} className="p-2 md:p-3 rounded-lg md:rounded-xl glass hover:bg-white/20 transition-all duration-500">
              {theme === 'light' ? <Moon className="w-4 h-4 md:w-5 md:h-5" /> : <Sun className="w-4 h-4 md:w-5 md:h-5" />}
            </button>
            <button onClick={scrollToTools} className="btn-primary py-2 md:py-2.5 px-4 md:px-6 text-xs md:text-sm shadow-xl hidden sm:block">Get Started</button>
          </div>
        </div>
      </nav>

      <main className="pt-24 md:pt-32 pb-20 px-4 md:px-6 max-w-7xl mx-auto relative z-10">
        <AnimatePresence>
          {step === 'processing' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] glass flex items-center justify-center"
            >
              <div className="text-center space-y-6">
                <div className="relative w-24 h-24 mx-auto">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 border-4 border-brand-primary/20 border-t-brand-primary rounded-full"
                  />
                  <Zap className="absolute inset-0 m-auto w-8 h-8 text-brand-primary animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black tracking-tight">Processing File</h3>
                  <p className="text-muted-foreground font-medium">Mitra is working its magic...</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {step === 'idle' ? (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-24 md:space-y-32"
            >
              {/* Hero Section */}
              <div className="text-center space-y-6 md:space-y-10 max-w-5xl mx-auto">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="inline-flex items-center space-x-2 px-3 py-1.5 md:px-6 md:py-3 rounded-full glass border-white/10 text-xs md:text-sm font-bold tracking-widest uppercase"
                >
                  <span className="flex h-2 w-2 rounded-full bg-brand-primary animate-ping" />
                  <span>Your Smart File Assistant</span>
                </motion.div>
                
                <motion.h1 
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                  className="text-4xl sm:text-7xl md:text-9xl font-black tracking-tighter leading-[0.95] md:leading-[0.85]"
                >
                  FILE MITRA <br />
                  <span className="text-gradient">SMART TOOLS.</span>
                </motion.h1>
                
                <motion.p 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
                  className="text-lg md:text-2xl text-muted-foreground max-w-3xl mx-auto px-4 md:px-0 font-medium leading-relaxed"
                >
                  The ultimate companion for your digital documents. Convert, merge, and optimize 
                  with lightning speed and premium precision.
                </motion.p>


              </div>

              {/* Feature Grid */}
              <div id="tools" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {tools.map((tool, idx) => (
                  <motion.div
                    key={tool.id}
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ delay: 0.1 * idx, duration: 0.8, ease: "easeOut" }}
                    className="glass-card p-10 group cursor-pointer hover:border-brand-primary/50 transition-all"
                    onClick={() => handleActionSelect(tool.id as ActionType)}
                  >
                    <div className={cn("w-16 h-16 rounded-2xl bg-linear-to-br flex items-center justify-center mb-8 group-hover:rotate-12 transition-transform duration-500 shadow-2xl", tool.color)}>
                      <tool.icon className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-3xl font-black mb-4 tracking-tight">{tool.name}</h3>
                    <p className="text-muted-foreground mb-8 text-lg font-medium leading-snug">{tool.desc}</p>
                    <div className="flex items-center text-brand-primary font-bold group-hover:translate-x-2 transition-transform">
                      Open Tool <ArrowRight className="ml-2 w-5 h-5" />
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Trust Section */}
              <motion.div 
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.5 }}
                className="glass-card p-16 flex flex-wrap items-center justify-around gap-16 opacity-40 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-1000"
              >
                <div className="flex flex-col items-center space-y-4">
                  <Shield className="w-10 h-10 text-brand-primary" />
                  <span className="font-black tracking-tighter text-xl">SECURE SSL</span>
                </div>
                <div className="flex flex-col items-center space-y-4">
                  <Zap className="w-10 h-10 text-brand-secondary" />
                  <span className="font-black tracking-tighter text-xl">FAST ENGINE</span>
                </div>
                <div className="flex flex-col items-center space-y-4">
                  <Smartphone className="w-10 h-10 text-brand-accent" />
                  <span className="font-black tracking-tighter text-xl">MOBILE READY</span>
                </div>
              </motion.div>
            </motion.div>
          ) : step === 'toolSelected' ? (
            <motion.div
              key="tool-interface"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="max-w-4xl mx-auto"
            >
              <div className="mb-8 md:mb-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <button 
                  onClick={() => { setStep('idle'); setSelectedFiles([]); setActiveAction(null); }}
                  className="flex items-center text-muted-foreground hover:text-white transition-all font-bold text-base md:text-lg group"
                >
                  <div className="p-2 glass rounded-xl mr-3 md:mr-4 group-hover:-translate-x-2 transition-transform">
                    <ArrowRight className="w-4 h-4 md:w-5 md:h-5 rotate-180" />
                  </div>
                  Back to home
                </button>
                <div className="text-left sm:text-right w-full sm:w-auto">
                  <p className="text-[10px] md:text-sm font-black uppercase tracking-widest opacity-50">Active Tool</p>
                  <p className="text-lg md:text-xl font-bold capitalize">{activeAction} Tool</p>
                </div>
              </div>

              <div className="glass-card p-6 md:p-16 space-y-8 md:space-y-12">
                <div className="text-center space-y-3 md:space-y-4">
                  <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                    {activeAction === 'merge' ? "Upload files to merge" : 
                     activeAction === 'compress' ? "Upload file to compress" :
                     activeAction === 'resize' ? "Upload image to resize" :
                     "Upload file to convert"}
                  </h2>
                  <p className="text-base md:text-xl text-muted-foreground font-medium">
                    {activeAction === 'merge' ? "Select multiple files to combine them into one." : 
                     "Drag and drop your file below to get started."}
                  </p>
                </div>

                <FileUploader 
                  onFilesSelected={handleFilesSelected} 
                  multiple={activeAction === 'merge'}
                />

                {selectedFiles.length > 0 && activeAction !== 'convert' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="pt-8"
                  >
                    <button
                      onClick={() => handleProcess()}
                      className="w-full btn-primary py-4 md:py-6 text-xl md:text-2xl shadow-2xl"
                    >
                      {activeAction === 'merge' ? "Merge Files" : 
                       activeAction === 'compress' ? "Compress Now" : 
                       "Resize Now"}
                    </button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          ) : step === 'configuring' ? (
            <motion.div
              key="configuring"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="max-w-4xl mx-auto"
            >
              <div className="mb-8 md:mb-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <button 
                  onClick={() => { setStep('toolSelected'); setSelectedFiles([]); }}
                  className="flex items-center text-muted-foreground hover:text-white transition-all font-bold text-base md:text-lg group"
                >
                  <div className="p-2 glass rounded-xl mr-3 md:mr-4 group-hover:-translate-x-2 transition-transform">
                    <ArrowRight className="w-4 h-4 md:w-5 md:h-5 rotate-180" />
                  </div>
                  Change file
                </button>
                <div className="text-left sm:text-right w-full sm:w-auto">
                  <p className="text-[10px] md:text-sm font-black uppercase tracking-widest opacity-50">Selected File</p>
                  <p className="text-lg md:text-xl font-bold truncate max-w-[200px]">{selectedFiles[0]?.name}</p>
                </div>
              </div>

              {activeAction === 'compress' ? (
                /* ── Compress Configuration Panel ── */
                <div className="glass-card p-6 md:p-16 space-y-8 md:space-y-10">
                  <div className="text-center space-y-3 md:space-y-4">
                    <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                      Compression Settings
                    </h2>
                    <p className="text-base md:text-xl text-muted-foreground font-medium">
                      Adjust quality to control the output file size.
                    </p>
                  </div>

                  {/* File Info Card */}
                  <div className="glass p-5 md:p-6 rounded-2xl space-y-4">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-linear-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center shrink-0">
                        <Info className="w-6 h-6 md:w-7 md:h-7 text-orange-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-base md:text-lg truncate">{selectedFiles[0]?.name}</p>
                        <div className="flex items-center space-x-3 mt-1">
                          <span className="text-[10px] md:text-xs uppercase tracking-widest font-black opacity-50">
                            {selectedFiles[0]?.type.split('/')[1]?.toUpperCase() || 'FILE'}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-white/20" />
                          <span className="text-[10px] md:text-xs uppercase tracking-widest font-black text-brand-primary">
                            {formatSize(originalFileSize)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quality Slider */}
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm md:text-base font-bold opacity-70">Compression Level</span>
                      <span className="text-2xl md:text-3xl font-black text-brand-primary">{quality}%</span>
                    </div>

                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={quality}
                      onChange={(e) => setQuality(Number(e.target.value))}
                      className="compress-slider w-full"
                    />

                    <div className="flex justify-between text-xs md:text-sm font-bold">
                      <span className="text-emerald-400 opacity-70">Higher Quality</span>
                      <span className="text-red-400 opacity-70">Smaller File Size</span>
                    </div>
                  </div>

                  {/* Size Comparison */}
                  <motion.div 
                    className="glass p-5 md:p-6 rounded-2xl"
                    animate={{ scale: [1, 1.01, 1] }}
                    transition={{ duration: 0.3 }}
                    key={quality}
                  >
                    <div className="grid grid-cols-2 gap-6 text-center">
                      <div className="space-y-2">
                        <p className="text-[10px] md:text-xs uppercase tracking-widest font-black opacity-50">Original Size</p>
                        <p className="text-xl md:text-2xl font-black">{formatSize(originalFileSize)}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] md:text-xs uppercase tracking-widest font-black opacity-50">Estimated Size</p>
                        <p className="text-xl md:text-2xl font-black text-brand-primary">{formatSize(estimatedSize)}</p>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/10 text-center">
                      <p className="text-sm font-bold opacity-60">
                        Estimated reduction: <span className="text-brand-accent">{originalFileSize > 0 ? Math.round((1 - estimatedSize / originalFileSize) * 100) : 0}%</span>
                      </p>
                    </div>
                  </motion.div>

                  {/* Compress Button */}
                  <button
                    onClick={() => handleProcess()}
                    className="w-full btn-primary py-4 md:py-6 text-xl md:text-2xl shadow-2xl"
                  >
                    <Minimize2 className="w-6 h-6 mr-3" />
                    Compress Now
                  </button>
                </div>
              ) : activeAction === 'image' ? (
                /* ── Image Tools (Editor) Panel ── */
                <ImageEditor 
                  file={selectedFiles[0]} 
                  onResult={(res) => {
                    setResult(res);
                    setStep('result');
                    confetti({
                      particleCount: 150,
                      spread: 100,
                      origin: { y: 0.6 },
                      colors: ['#6366f1', '#a855f7', '#ec4899']
                    });
                  }} 
                />
              ) : (
                /* ── Convert Configuration Panel (existing) ── */
                <div className="glass-card p-6 md:p-16 space-y-8 md:space-y-12">
                  <div className="text-center space-y-3 md:space-y-4">
                    <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                      What do you want to convert this file to?
                    </h2>
                    <p className="text-base md:text-xl text-muted-foreground font-medium">
                      Choose the format you want to convert to.
                    </p>
                  </div>

                  <div className="space-y-8">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {getConversionOptions().map((format) => (
                        <button
                          key={format}
                          onClick={() => setOutputFormat(format)}
                          className={cn(
                            "p-6 rounded-2xl border-2 transition-all font-black text-xl",
                            outputFormat === format 
                              ? "bg-brand-primary border-brand-primary text-white shadow-lg shadow-brand-primary/30" 
                              : "glass border-white/10 hover:border-white/30"
                          )}
                        >
                          {format}
                        </button>
                      ))}
                    </div>

                    <button
                      disabled={!outputFormat}
                      onClick={() => handleProcess()}
                      className="w-full btn-primary py-4 md:py-6 text-xl md:text-2xl shadow-2xl disabled:opacity-50"
                    >
                      Convert to {outputFormat || '...'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ) : step === 'result' && result ? (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-4xl mx-auto"
            >
              <div className="glass-card p-8 md:p-16 space-y-10 text-center">
                <div className="mx-auto w-32 h-32 rounded-full bg-emerald-500/20 flex items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.2)]">
                  <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                </div>
                <div className="space-y-3">
                  <h3 className="text-5xl font-black tracking-tight">File Ready!</h3>
                  <p className="text-xl text-muted-foreground font-medium">Your smart assistant has finished the job.</p>
                </div>

                {/* Compression Stats — only for compress action */}
                {activeAction === 'compress' && originalFileSize > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="glass p-6 md:p-8 rounded-3xl max-w-xl mx-auto space-y-6"
                  >
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="space-y-2">
                        <p className="text-[10px] md:text-xs uppercase tracking-widest font-black opacity-50">Original</p>
                        <p className="text-lg md:text-2xl font-black">{formatSize(originalFileSize)}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] md:text-xs uppercase tracking-widest font-black opacity-50">Compressed</p>
                        <p className="text-lg md:text-2xl font-black text-brand-primary">{formatSize(result.blob.size)}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] md:text-xs uppercase tracking-widest font-black opacity-50">Saved</p>
                        <p className="text-lg md:text-2xl font-black text-emerald-400">
                          {Math.max(0, Math.round((1 - result.blob.size / originalFileSize) * 100))}%
                        </p>
                      </div>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden">
                      <motion.div 
                        className="h-full rounded-full bg-linear-to-r from-brand-primary to-emerald-400"
                        initial={{ width: '100%' }}
                        animate={{ width: `${Math.round((result.blob.size / originalFileSize) * 100)}%` }}
                        transition={{ duration: 1.2, ease: 'easeOut', delay: 0.4 }}
                      />
                    </div>
                  </motion.div>
                )}
                
                <div className="glass p-6 md:p-8 rounded-3xl flex flex-col sm:flex-row items-center justify-between max-w-xl mx-auto border-emerald-500/20 gap-6">
                  <div className="flex items-center space-x-4 md:space-x-6 w-full sm:w-auto">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-white/5 flex items-center justify-center overflow-hidden shrink-0">
                      {result.blob.type.startsWith('image/') ? (
                        <img src={URL.createObjectURL(result.blob)} alt="preview" className="w-full h-full object-cover" />
                      ) : (
                        <FileArchive className="w-6 h-6 md:w-7 md:h-7 text-brand-primary" />
                      )}
                    </div>
                    <div className="text-left min-w-0">
                      <p className="font-bold text-base md:text-lg truncate max-w-[150px] md:max-w-[200px]">{result.filename}</p>
                      <p className="text-[10px] md:text-xs uppercase tracking-widest font-black opacity-50">{formatSize(result.blob.size)}</p>
                    </div>
                  </div>
                  <button onClick={downloadResult} className="w-full sm:w-auto p-4 bg-brand-primary rounded-2xl hover:scale-105 transition-all shadow-xl shadow-brand-primary/30 flex items-center justify-center space-x-2">
                    <Download className="w-5 h-5 md:w-6 md:h-6 text-white" />
                    <span className="sm:hidden font-bold">Download File</span>
                  </button>
                </div>

                <div className="pt-6">
                  <button 
                    onClick={() => { setStep('idle'); setSelectedFiles([]); setResult(null); setOutputFormat(''); setOriginalFileSize(0); }}
                    className="text-brand-primary font-bold text-lg hover:underline decoration-2 underline-offset-8"
                  >
                    Process another file
                  </button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-20 px-6 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center">
              <Zap className="w-6 h-6 text-brand-primary" />
            </div>
            <span className="text-2xl font-black tracking-tighter">File Mitra</span>
          </div>
          <p className="text-muted-foreground font-medium">© 2026 File Mitra – Your Smart File Assistant. All rights reserved.</p>
          <div className="flex space-x-8">
            <a href="#" className="text-muted-foreground hover:text-brand-primary transition-colors"><Github className="w-6 h-6" /></a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
