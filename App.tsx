
import React, { useState, useRef, useCallback, useEffect } from 'react';
import AudioUpload from './components/AudioUpload';
import ImageUpload from './components/ImageUpload';
import Visualizer from './components/Visualizer';
import { PlayIcon, PauseIcon, FullscreenEnterIcon, FullscreenExitIcon } from './components/IconComponents';
import { VisualizationType, LinearGraphStyle, ColorTheme, PALETTES } from './types';
import { renderSingleFrame } from './components/visualizationRenderer'; 

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

interface ExportSettings {
  resolution: string; // e.g., "1920x1080", "current"
  fps: number;
  exportType: 'webm' | 'mp4' | null;
  targetWidth: number;
  targetHeight: number;
}

const RESOLUTION_PRESETS: Record<string, {label: string, width?: number, height?: number}> = {
  current: { label: "Current Canvas Size" },
  "854x480": { label: "480p (854x480)", width: 854, height: 480 },
  "1280x720": { label: "720p (1280x720)", width: 1280, height: 720 },
  "1920x1080": { label: "1080p (1920x1080)", width: 1920, height: 1080 },
  "2560x1440": { label: "1440p (2560x1440)", width: 2560, height: 1440 },
  "3840x2160": { label: "4K (3840x2160)", width: 3840, height: 2160 },
};

const FPS_OPTIONS = [24, 30, 60];


const App: React.FC = () => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const visualizerContainerRef = useRef<HTMLDivElement | null>(null);
  
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [sourceNode, setSourceNode] = useState<MediaElementAudioSourceNode | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPendingPlay, setIsPendingPlay] = useState<boolean>(false);
  const [playDelayCountdown, setPlayDelayCountdown] = useState<number>(0);
  const playDelayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [startDelayDuration, setStartDelayDuration] = useState<number>(3);

  const [visualizationType, setVisualizationType] = useState<VisualizationType>(VisualizationType.LINEAR);
  const [isProcessingAudio, setIsProcessingAudio] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [centerImageFile, setCenterImageFile] = useState<File | null>(null);
  const [centerImageSrc, setCenterImageSrc] = useState<string | null>(null);
  const [loadedCenterImage, setLoadedCenterImage] = useState<HTMLImageElement | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false);

  const [linearGraphStyle, setLinearGraphStyle] = useState<LinearGraphStyle>('bars');
  const [colorTheme, setColorTheme] = useState<ColorTheme>('sky');
  
  const [enablePulse, setEnablePulse] = useState<boolean>(false);
  const [enableSwing, setEnableSwing] = useState<boolean>(false);
  
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [pulseIntensity, setPulseIntensity] = useState<number>(1.0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [visualizerSize, setVisualizerSize] = useState<{width: number; height: number}>({width: 640, height: 360});

  const [imageScale, setImageScale] = useState<number>(1.0);
  const [visualizerDetailScale, setVisualizerDetailScale] = useState<number>(1.0);
  const [imageCornerRadius, setImageCornerRadius] = useState<number>(0);
  const [imageSwingIntensity, setImageSwingIntensity] = useState<number>(0);

  const ffmpegRef = useRef(new FFmpeg());
  const [isFFmpegLoaded, setIsFFmpegLoaded] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusMessage, setExportStatusMessage] = useState<string>("");
  
  const [showExportSettingsModal, setShowExportSettingsModal] = useState(false);
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    resolution: "1920x1080",
    fps: 60,
    exportType: null,
    targetWidth: 1920,
    targetHeight: 1080,
  });

  const exportAudioRef = useRef<HTMLAudioElement | null>(null); 
  const exportAnalyserNodeRef = useRef<AnalyserNode | null>(null);
  const exportRenderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const exportAnimationRequestRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const exportPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [currentExportFrame, setCurrentExportFrame] = useState<number>(0);
  const [totalExportFrames, setTotalExportFrames] = useState<number>(0);


  useEffect(() => {
    const loadFFmpeg = async () => {
      const ffmpeg = ffmpegRef.current;
      ffmpeg.on('log', ({ message }) => {
         console.log('[FFmpeg]:', message); 
         setExportStatusMessage(`FFmpeg: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
         if (message.includes("Error") || message.includes("failed")) {
            setError(`FFmpeg error: ${message}. MP4 export might fail.`);
         }
      });
      ffmpeg.on('progress', ({ progress, time }) => {
        if (exportSettings.exportType === 'mp4') {
            const ffmpegProgress = Math.round(progress * 100);
            setExportProgress(50 + Math.round(ffmpegProgress / 2));
            setExportStatusMessage(`FFmpeg: Processing... ${ffmpegProgress}% (frame time: ${time})`);
        }
        console.log(`FFmpeg Progress: ${progress * 100}%, time: ${time}`);
      });
      try {
        setExportStatusMessage("Loading FFmpeg core...");
        await ffmpeg.load({
          coreURL: await toBlobURL('https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js', 'application/javascript'),
          wasmURL: await toBlobURL('https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm', 'application/wasm'),
        });
        setIsFFmpegLoaded(true);
        setExportStatusMessage("FFmpeg loaded successfully for MP4 export.");
        console.log('FFmpeg loaded successfully for MP4 export.');
      } catch (err) {
        console.error('Failed to load FFmpeg:', err);
        setError("MP4 export tools (FFmpeg) could not be loaded. WebM export is still available. Please refresh to try loading MP4 tools again.");
        setExportStatusMessage("Failed to load FFmpeg.");
      }
    };
    loadFFmpeg();
  }, []);


  const getAudioContext = useCallback((): AudioContext => {
    let currentAudioContext = audioContext;
    if (!currentAudioContext) {
      currentAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      setAudioContext(currentAudioContext);
    }
    if (currentAudioContext.state === 'suspended') {
      currentAudioContext.resume().catch(err => console.error("Error resuming AudioContext:", err));
    }
    return currentAudioContext;
  }, [audioContext]);

  const cleanupAudioNodes = useCallback(() => {
    if (sourceNode) {
      sourceNode.disconnect();
      setSourceNode(null);
    }
    if (analyserNode) {
      analyserNode.disconnect();
      setAnalyserNode(null);
    }
  }, [sourceNode, analyserNode]);

  const handleAudioFileChange = useCallback(async (file: File) => {
    setIsProcessingAudio(true);
    setError(null);
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
    }
    if (isPendingPlay && playDelayTimerRef.current) {
        clearTimeout(playDelayTimerRef.current);
        setIsPendingPlay(false);
        setPlayDelayCountdown(0);
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
        
    cleanupAudioNodes(); 
            
    setAudioFile(file);
    const newAudioSrc = URL.createObjectURL(file);
    if (audioSrc && audioSrc.startsWith('blob:')) {
        URL.revokeObjectURL(audioSrc);
    }
    setAudioSrc(newAudioSrc);
    setIsProcessingAudio(false);
  }, [isPlaying, isPendingPlay, cleanupAudioNodes, audioSrc]);

  const handleImageFileChange = useCallback((file: File) => {
    setIsProcessingImage(true);
    setCenterImageFile(file);
    const newImageSrc = URL.createObjectURL(file);
    if (centerImageSrc && centerImageSrc.startsWith('blob:')) {
        URL.revokeObjectURL(centerImageSrc);
    }
    setCenterImageSrc(newImageSrc);
    
    const img = new Image();
    img.onload = () => {
      setLoadedCenterImage(img);
      setIsProcessingImage(false);
      setEnablePulse(true); 
      setEnableSwing(false);
    };
    img.onerror = () => {
      setError("Could not load image. Please try a different file.");
      setLoadedCenterImage(null);
      setCenterImageSrc(null);
      setCenterImageFile(null);
      setIsProcessingImage(false);
      setEnablePulse(false);
      setEnableSwing(false);
    };
    img.src = newImageSrc;
  }, [centerImageSrc]);

  useEffect(() => {
    const currentAudioUrl = audioSrc;
    return () => {
      if (currentAudioUrl && currentAudioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentAudioUrl);
      }
    };
  }, [audioSrc]);

  useEffect(() => {
    const currentImageUrl = centerImageSrc;
    return () => {
      if (currentImageUrl && currentImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentImageUrl);
      }
    };
  }, [centerImageSrc]);

  useEffect(() => { 
    return () => {
        if (playDelayTimerRef.current) {
            clearTimeout(playDelayTimerRef.current);
        }
    };
  }, []);

  const startPlayback = async () => {
    if (!audioRef.current) return;
    const currentAudioContext = getAudioContext();
    if (!currentAudioContext) {
      setError("Audio system could not initialize.");
      setIsPendingPlay(false);
      return;
    }
    if (currentAudioContext.state === 'suspended') {
        try { await currentAudioContext.resume(); } 
        catch (err) { 
            setError("Audio system could not start. Please interact with the page."); 
            setIsPendingPlay(false); return; 
        }
    }

    if (!analyserNode && audioRef.current.readyState >= 1) {
        if (audioRef.current) {
            try {
              let CSourceNode = sourceNode;
              if (!CSourceNode || CSourceNode.mediaElement !== audioRef.current) {
                 if(CSourceNode) CSourceNode.disconnect();
                 CSourceNode = currentAudioContext.createMediaElementSource(audioRef.current);
                 setSourceNode(CSourceNode);
              }
              const newAnalyserNode = currentAudioContext.createAnalyser();
              newAnalyserNode.fftSize = 512;
              CSourceNode.connect(newAnalyserNode);
              newAnalyserNode.connect(currentAudioContext.destination);
              setAnalyserNode(newAnalyserNode);
            } catch (err) { 
                console.error("Error setting up audio graph on play fallback:", err);
                setError("Audio setup failed during playback attempt.");
                setIsPendingPlay(false); return;
            }
        }
    }

    try {
      if (analyserNode || audioRef.current.readyState >= 3) {
          await audioRef.current.play();
      } else if (audioRef.current.readyState < 3) {
          setError("Audio is not ready. Please wait or re-upload.");
      }
    } catch (err) {
      setError("Playback failed. Browser might have blocked it or file is corrupted.");
      setIsPlaying(false); 
    }
    setIsPendingPlay(false);
  };

  const togglePlayPause = useCallback(async () => {
    if (!audioRef.current ) return;
    setError(null);

    if (isPlaying) {
      audioRef.current.pause();
      if (playDelayTimerRef.current) {
          clearTimeout(playDelayTimerRef.current);
          setIsPendingPlay(false);
          setPlayDelayCountdown(0);
      }
    } else if (isPendingPlay) { 
        clearTimeout(playDelayTimerRef.current);
        setIsPendingPlay(false);
        setPlayDelayCountdown(0);
    } else { 
      if (startDelayDuration === 0) {
        startPlayback();
      } else {
        setIsPendingPlay(true);
        setPlayDelayCountdown(startDelayDuration);
        let countdown = startDelayDuration;
        playDelayTimerRef.current = setInterval(() => {
          countdown--;
          setPlayDelayCountdown(countdown);
          if (countdown === 0) {
            clearInterval(playDelayTimerRef.current!);
            playDelayTimerRef.current = null;
            startPlayback();
          }
        }, 1000);
      }
    }
  }, [isPlaying, isPendingPlay, audioContext, analyserNode, getAudioContext, sourceNode, startPlayback, startDelayDuration]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = useCallback(() => {
    const audioEl = audioRef.current;
    if (audioEl) {
      setDuration(audioEl.duration);
      if (audioSrc && audioEl.readyState >= 1) { 
        const currentAudioContext = getAudioContext();
        if (currentAudioContext) {
          try {
            let currentSourceNode = sourceNode;
            if (!currentSourceNode || currentSourceNode.mediaElement !== audioEl) {
              if(currentSourceNode) currentSourceNode.disconnect(); 
              currentSourceNode = currentAudioContext.createMediaElementSource(audioEl);
              setSourceNode(currentSourceNode);
            }
            
            if (!analyserNode || (sourceNode && sourceNode.mediaElement !== audioEl)) {
                if(analyserNode) analyserNode.disconnect();
                const newAnalyserNode = currentAudioContext.createAnalyser();
                newAnalyserNode.fftSize = 512;
                currentSourceNode.connect(newAnalyserNode);
                newAnalyserNode.connect(currentAudioContext.destination);
                setAnalyserNode(newAnalyserNode);
            }
            setError(null);
          } catch (err) {
            console.error("Error setting up audio graph in onLoadedMetadata:", err);
            setError("Could not set up audio processing.");
            cleanupAudioNodes(); 
          }
        }
      }
    }
  }, [audioSrc, getAudioContext, cleanupAudioNodes, sourceNode, analyserNode]); 


  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      const time = parseFloat(event.target.value);
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (timeInSeconds: number): string => {
    if (isNaN(timeInSeconds) || timeInSeconds === Infinity) return '00:00';
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    if(audioRef.current) audioRef.current.currentTime = 0;
    setCurrentTime(0);
  };

  const toggleFullscreen = useCallback(() => {
    const elem = visualizerContainerRef.current;
    if (!elem) return;

    if (!document.fullscreenElement) {
      elem.requestFullscreen().catch(err => {
        alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  }, []);
  
  useEffect(() => {
    const calculateNonFullscreenSize = () => {
      const visContainerElement = visualizerContainerRef.current;
      if (visContainerElement) {
        const currentWidth = visContainerElement.offsetWidth;
        if (currentWidth > 0) {
          setVisualizerSize({ width: currentWidth, height: currentWidth * (9 / 16) });
        } else {
          const parent = visContainerElement.parentElement;
          if (parent) {
              const parentWidth = parent.clientWidth;
              const cssMaxWidthForVisualizer = 896; 
              const calculatedWidth = Math.min(parentWidth, cssMaxWidthForVisualizer);
              if (calculatedWidth > 0) {
                   setVisualizerSize({ width: calculatedWidth, height: calculatedWidth * (9/16)});
              } else {
                   setVisualizerSize({width: 640, height: 360});
              }
          } else {
              setVisualizerSize({width: 640, height: 360});
          }
        }
      } else if (!isFullscreen) {
          setVisualizerSize({width: 640, height: 360}); 
      }
    };

    const handleResizeOrFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      if (isFullscreen !== isCurrentlyFullscreen) {
        setIsFullscreen(isCurrentlyFullscreen); 
      }

      if (isCurrentlyFullscreen && visualizerContainerRef.current === document.fullscreenElement) {
        setVisualizerSize({ width: window.innerWidth, height: window.innerHeight });
      } else if (!isCurrentlyFullscreen) {
        calculateNonFullscreenSize();
      }
    };

    window.addEventListener('resize', handleResizeOrFullscreenChange);
    document.addEventListener('fullscreenchange', handleResizeOrFullscreenChange);

    const timeoutId = setTimeout(() => {
      if (document.fullscreenElement && visualizerContainerRef.current === document.fullscreenElement) {
          setIsFullscreen(true);
          setVisualizerSize({ width: window.innerWidth, height: window.innerHeight });
      } else {
          if(isFullscreen && !document.fullscreenElement) setIsFullscreen(false); 
          calculateNonFullscreenSize();
      }
    }, 50); 

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResizeOrFullscreenChange);
      document.removeEventListener('fullscreenchange', handleResizeOrFullscreenChange);
    };
  }, [isFullscreen]); 

  // --- EXPORT VIDEO LOGIC ---

  const handleOpenExportSettings = (type: 'webm' | 'mp4') => {
    let currentTargetWidth = exportSettings.targetWidth;
    let currentTargetHeight = exportSettings.targetHeight;

    if (exportSettings.resolution === "current") {
        currentTargetWidth = visualizerSize.width;
        currentTargetHeight = visualizerSize.height;
    } else {
        const preset = RESOLUTION_PRESETS[exportSettings.resolution];
        if (preset && preset.width && preset.height) {
            currentTargetWidth = preset.width;
            currentTargetHeight = preset.height;
        }
    }

    setExportSettings(prev => ({
      ...prev,
      exportType: type,
      targetWidth: currentTargetWidth,
      targetHeight: currentTargetHeight,
    }));
    setShowExportSettingsModal(true);
  };

  const handleExportSettingChange = (field: keyof ExportSettings, value: string | number) => {
    setExportSettings(prev => {
      const newSettings = { ...prev, [field]: value };
      if (field === 'resolution') {
        if (value === "current") {
          newSettings.targetWidth = visualizerSize.width;
          newSettings.targetHeight = visualizerSize.height;
        } else {
          const preset = RESOLUTION_PRESETS[value as string];
          if (preset && preset.width && preset.height) {
            newSettings.targetWidth = preset.width;
            newSettings.targetHeight = preset.height;
          }
        }
      }
      return newSettings;
    });
  };
  
  const commonExportSetup = async (
    exportType: 'webm' | 'mp4',
    exportWidth: number,
    exportHeight: number,
    exportFPS: number
  ): Promise<{ renderCtx: CanvasRenderingContext2D; exportAudioContext: AudioContext } | false> => {
    setExportStatusMessage("Initializing export environment...");
    if (!audioFile || isExporting) {
        setError(isExporting ? "Export already in progress." : "Audio file needed for export.");
        setExportStatusMessage(isExporting ? "Export already in progress." : "Audio file needed for export.");
        return false;
    }
    if (exportType === 'mp4' && !isFFmpegLoaded) {
        setError("MP4 export tools (FFmpeg) not ready. Try WebM or refresh.");
        setExportStatusMessage("MP4 export tools (FFmpeg) not ready.");
        return false;
    }

    setError(null);
    setIsExporting(true);
    setExportProgress(0);
    setCurrentExportFrame(0);
    setTotalExportFrames(0);
    recordedChunksRef.current = [];

    setExportStatusMessage("Creating virtual render canvas...");
    const canvas = document.createElement('canvas');
    canvas.width = exportWidth;
    canvas.height = exportHeight;
    exportRenderCanvasRef.current = canvas;

    const renderCtx = exportRenderCanvasRef.current.getContext('2d');
    if (!renderCtx) {
        setError("Failed to create render canvas context for export.");
        setExportStatusMessage("Failed to create render canvas context.");
        setIsExporting(false);
        return false;
    }
    setExportStatusMessage("Setting up audio for export...");
    exportAudioRef.current = document.createElement('audio');
    exportAudioRef.current.src = URL.createObjectURL(audioFile);
    exportAudioRef.current.muted = true; 
    
    const exportAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    if (exportAudioContext.state === 'suspended') {
        try {
            setExportStatusMessage("Resuming export audio context...");
            await exportAudioContext.resume();
            console.log("Export AudioContext resumed successfully.");
        } catch (err) {
            console.error("Error resuming export AudioContext:", err);
            const resumeError = err instanceof Error ? err.message : String(err);
            setError(`Failed to resume audio context for export: ${resumeError}.`);
            setExportStatusMessage(`Export audio context resume failed: ${resumeError}`);
            setIsExporting(false); 
            // No need to call cleanupExportResources, returning false will stop the process
            return false;
        }
    }

    const exportAudioSource = exportAudioContext.createMediaElementSource(exportAudioRef.current);
    
    exportAnalyserNodeRef.current = exportAudioContext.createAnalyser();
    exportAnalyserNodeRef.current.fftSize = 512;
    exportAudioSource.connect(exportAnalyserNodeRef.current); 
    
    const mediaStreamDestination = exportAudioContext.createMediaStreamDestination();
    exportAudioSource.connect(mediaStreamDestination); 

    if (!exportRenderCanvasRef.current) {
        setError("Export render canvas not initialized.");
        setExportStatusMessage("Export render canvas not initialized.");
        cleanupExportResources(exportAudioContext, "Setup failure");
        return false;
    }
    setExportStatusMessage("Configuring video recorder...");
    const videoStream = exportRenderCanvasRef.current.captureStream(exportFPS);
    const audioStreamForRecord = mediaStreamDestination.stream; 
    
    const combinedStreamTracks: MediaStreamTrack[] = [];
    videoStream.getVideoTracks().forEach(track => combinedStreamTracks.push(track));
    audioStreamForRecord.getAudioTracks().forEach(track => combinedStreamTracks.push(track));
    
    const combinedStream = new MediaStream(combinedStreamTracks);

    const mimeTypeCandidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,vorbis',
      'video/webm;codecs=vp8,vorbis',
      'video/webm;codecs=h264,aac', 
      'video/webm', 
    ];

    let supportedMimeType: string | null = null;
    for (const mimeType of mimeTypeCandidates) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        supportedMimeType = mimeType;
        console.log(`MediaRecorder: Using supported MIME type: ${supportedMimeType}`);
        setExportStatusMessage(`Recorder: ${supportedMimeType.split(';')[0]}`);
        break;
      }
      console.info(`MediaRecorder: MIME type not supported by browser: ${mimeType}. Trying next...`);
    }

    if (!supportedMimeType) {
      setError("No suitable WebM codecs supported by your browser for recording. Try a different browser or check for updates.");
      setExportStatusMessage("MediaRecorder: Codec support issue.");
      cleanupExportResources(exportAudioContext, "MediaRecorder codec failure");
      return false;
    }

    mediaRecorderRef.current = new MediaRecorder(combinedStream, { 
        mimeType: supportedMimeType,
        videoBitsPerSecond: exportType === 'mp4' ? 8000000 : 12000000, 
    });
    setExportStatusMessage(`Recorder configured (${supportedMimeType.split(';')[0]}).`);
    return { renderCtx, exportAudioContext };
  };

  const cleanupExportResources = (exportAudioCtx?: AudioContext, status?: string) => {
    setExportStatusMessage(status || (error ? "Export failed. Cleaning up..." : (exportProgress >=100 ? "Export complete. Cleaning up..." : "Export cancelled. Cleaning up...")) );
    setIsExporting(false);

    if (exportAudioRef.current) {
        URL.revokeObjectURL(exportAudioRef.current.src);
        exportAudioRef.current = null;
    }
    exportAnalyserNodeRef.current = null;
    exportRenderCanvasRef.current = null; 
    if (exportAnimationRequestRef.current) {
        cancelAnimationFrame(exportAnimationRequestRef.current);
        exportAnimationRequestRef.current = null;
    }
    if (exportAudioCtx && exportAudioCtx.state !== 'closed') {
        exportAudioCtx.close().catch(e => console.warn("Error closing export audio context:", e));
    }
    if (mediaRecorderRef.current) {
        mediaRecorderRef.current.onstart = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onerror = null;
        if (mediaRecorderRef.current.state !== "inactive") {
           try { mediaRecorderRef.current.stop(); } catch(e) { console.warn("Error stopping media recorder in cleanup:", e); }
        }
        mediaRecorderRef.current = null;
    }
    recordedChunksRef.current = [];

    if (exportPreviewCanvasRef.current) {
        const prevCtx = exportPreviewCanvasRef.current.getContext('2d');
        if (prevCtx) {
            prevCtx.fillStyle = PALETTES[colorTheme].background; 
            prevCtx.fillRect(0, 0, exportPreviewCanvasRef.current.width, exportPreviewCanvasRef.current.height);
             if (exportProgress >= 100 && !error) {
                prevCtx.fillStyle = PALETTES[colorTheme].text;
                prevCtx.textAlign = 'center';
                prevCtx.textBaseline = 'middle';
                prevCtx.font = 'bold 12px Inter, sans-serif';
                prevCtx.fillText('Export Complete!', exportPreviewCanvasRef.current.width / 2, exportPreviewCanvasRef.current.height / 2);
             } else if (error && status !== "Setup failure") { 
                prevCtx.fillStyle = PALETTES[colorTheme].text;
                prevCtx.textAlign = 'center';
                prevCtx.textBaseline = 'middle';
                prevCtx.font = 'bold 12px Inter, sans-serif';
                prevCtx.fillText('Export Failed', exportPreviewCanvasRef.current.width / 2, exportPreviewCanvasRef.current.height / 2);
             }
        }
    }
  };
  
  const startActualExport = async () => {
    if (!exportSettings.exportType) return;
    setShowExportSettingsModal(false);
    setExportStatusMessage(`Starting ${exportSettings.exportType.toUpperCase()} export...`);

    const { targetWidth, targetHeight, fps, exportType } = exportSettings;

    if (exportType === 'webm') {
      await handleExportWebM(targetWidth, targetHeight, fps);
    } else if (exportType === 'mp4') {
      await handleExportMP4(targetWidth, targetHeight, fps);
    }
  };

  const handleExportWebM = async (exportWidth: number, exportHeight: number, exportFPS: number) => {
    const setupResult = await commonExportSetup('webm', exportWidth, exportHeight, exportFPS);
    if (!setupResult) return; // commonExportSetup now sets isExporting to false on early return
    const { renderCtx, exportAudioContext } = setupResult;

    if (!mediaRecorderRef.current || !exportAudioRef.current || !exportAnalyserNodeRef.current || !exportRenderCanvasRef.current) {
        setError("Export setup failed unexpectedly (WebM).");
        setExportStatusMessage("WebM export setup failed.");
        cleanupExportResources(exportAudioContext, "WebM setup failure");
        return;
    }
    
    mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
    };

    mediaRecorderRef.current.onstop = async () => {
        console.log("MediaRecorder stopped for WebM export.");
        if (error && !recordedChunksRef.current.length) { // Check if error occurred *before* any data
             cleanupExportResources(exportAudioContext, "WebM export error during recording.");
             return;
        }
        setExportProgress(100); 
        setExportStatusMessage("WebM recording complete. Creating file...");
        const videoBlob = new Blob(recordedChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'video/webm' });
        
        if (videoBlob.size === 0) {
            setError("WebM export resulted in an empty file. Recording might have failed.");
            setExportStatusMessage("WebM export: Empty file produced.");
            cleanupExportResources(exportAudioContext, "WebM empty file");
            return;
        }

        setExportStatusMessage("WebM file ready. Starting download...");
        const downloadUrl = URL.createObjectURL(videoBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${audioFile!.name.split('.')[0]}_${exportWidth}x${exportHeight}_${exportFPS}fps.webm`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(downloadUrl);
        a.remove();
        
        console.log("WebM Export finished.");
        setExportStatusMessage("WebM export finished and downloaded.");
        cleanupExportResources(exportAudioContext, "WebM export successful");
    };
    
    startExportRenderLoop(renderCtx, 'webm', exportAudioContext, exportWidth, exportHeight, exportFPS);
  };


  const handleExportMP4 = async (exportWidth: number, exportHeight: number, exportFPS: number) => {
    const setupResult = await commonExportSetup('mp4', exportWidth, exportHeight, exportFPS);
    if (!setupResult) return;
    const { renderCtx, exportAudioContext } = setupResult;

    if (!mediaRecorderRef.current || !exportAudioRef.current || !exportAnalyserNodeRef.current || !exportRenderCanvasRef.current) {
        setError("Export setup failed unexpectedly (MP4).");
        setExportStatusMessage("MP4 export setup failed.");
        cleanupExportResources(exportAudioContext, "MP4 setup failure");
        return;
    }

    mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
    };

    mediaRecorderRef.current.onstop = async () => {
        console.log("MediaRecorder stopped. Processing with FFmpeg for MP4...");
         if (error && !recordedChunksRef.current.length) {  // Check if error occurred *before* any data
             cleanupExportResources(exportAudioContext, "MP4 export error during recording.");
             return;
        }
        setExportProgress(50); 
        setExportStatusMessage("WebM recording complete. Preparing for MP4 conversion...");

        const videoBlob = new Blob(recordedChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'video/webm' });
        if (videoBlob.size === 0) {
            setError("Intermediate WebM for MP4 export was empty. Recording failed.");
            setExportStatusMessage("MP4 export: Intermediate WebM empty.");
            cleanupExportResources(exportAudioContext, "MP4 intermediate file empty");
            return;
        }
        const videoBuffer = await videoBlob.arrayBuffer();
        
        const ffmpeg = ffmpegRef.current;
        if (!ffmpeg.loaded) { 
            setError("FFmpeg not loaded. Cannot export MP4.");
            setExportStatusMessage("FFmpeg not loaded for MP4 conversion.");
            cleanupExportResources(exportAudioContext, "FFmpeg not loaded");
            return;
        }
        
        let ffmpegErrorOccurred = false;
        try {
            setExportStatusMessage("Writing intermediate WebM to FFmpeg memory...");
            await ffmpeg.writeFile('input.webm', new Uint8Array(videoBuffer));
            console.log(`Starting FFmpeg processing for MP4 (${exportWidth}x${exportHeight}@${exportFPS}fps)...`);
            setExportStatusMessage(`Starting FFmpeg for MP4 conversion (${exportWidth}x${exportHeight}@${exportFPS}fps)...`);
            await ffmpeg.exec([
                '-i', 'input.webm',
                '-c:v', 'libx264', '-preset', 'ultrafast', 
                '-vf', `scale=${exportWidth}:${exportHeight},fps=${exportFPS}`, 
                '-c:a', 'aac', '-b:a', '192k',
                '-shortest', 'output.mp4'
            ]);

            setExportStatusMessage("MP4 conversion complete. Reading file...");
            const outputData = await ffmpeg.readFile('output.mp4');
            const outputBlob = new Blob([outputData], { type: 'video/mp4' });
            
            setExportStatusMessage("MP4 file ready. Starting download...");
            const downloadUrl = URL.createObjectURL(outputBlob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `${audioFile!.name.split('.')[0]}_${exportWidth}x${exportHeight}_${exportFPS}fps.mp4`;
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(downloadUrl);
            a.remove();
            
            setExportStatusMessage("Cleaning up FFmpeg files...");
            await ffmpeg.deleteFile('input.webm');
            await ffmpeg.deleteFile('output.mp4');
            console.log("MP4 Export finished and files cleaned up.");
            setExportProgress(100);
            setExportStatusMessage("MP4 export finished and downloaded.");

        } catch (e: any) {
            ffmpegErrorOccurred = true;
            console.error("Error during FFmpeg processing:", e);
            const ffmpegErrorMessage = e.message || String(e);
            setError(`MP4 export failed during video processing: ${ffmpegErrorMessage}`);
            setExportStatusMessage(`MP4 conversion failed: ${ffmpegErrorMessage}`);
            setExportProgress(50); // Stuck at WebM conversion
        } finally {
            cleanupExportResources(exportAudioContext, ffmpegErrorOccurred ? "MP4 conversion failed. Cleaning up." : "MP4 export complete. Cleaning up.");
        }
    };
    startExportRenderLoop(renderCtx, 'mp4', exportAudioContext, exportWidth, exportHeight, exportFPS);
  };

  const startExportRenderLoop = (
    renderCtx: CanvasRenderingContext2D, 
    exportType: 'webm' | 'mp4',
    exportAudioCtx: AudioContext,
    exportWidth: number,
    exportHeight: number,
    currentExportFPS: number
  ) => {
    setExportStatusMessage("Preparing render loop...");
    if (!exportAudioRef.current || !exportAnalyserNodeRef.current || !mediaRecorderRef.current) {
        setError("Core export elements not ready for render loop.");
        setExportStatusMessage("Render loop setup failed: Missing elements.");
        cleanupExportResources(exportAudioCtx, "Render loop setup failure");
        return;
    }
    const frequencyData = new Uint8Array(exportAnalyserNodeRef.current.frequencyBinCount);
    const timeDomainData = new Uint8Array(exportAnalyserNodeRef.current.fftSize);
    let audioFullDuration = 0;

    const localMediaRecorder = mediaRecorderRef.current; 

    const renderFn = () => {
        if (!exportAudioRef.current || !exportAnalyserNodeRef.current || !renderCtx || !exportRenderCanvasRef.current || !localMediaRecorder ) {
             if (exportAnimationRequestRef.current) cancelAnimationFrame(exportAnimationRequestRef.current);
             console.warn("Render loop exiting due to missing refs.");
             return;
        }
        if (localMediaRecorder.state !== "recording") {
             if (exportAnimationRequestRef.current) cancelAnimationFrame(exportAnimationRequestRef.current);
             console.warn(`Render loop exiting because MediaRecorder state is ${localMediaRecorder.state}, not 'recording'.`);
             // If it stopped prematurely and no error is set, and no chunks, it might be an issue.
             // onstop handler should ultimately manage cleanup.
             if (localMediaRecorder.state === "inactive" && recordedChunksRef.current.length === 0 && !error) {
                setError("MediaRecorder stopped prematurely without data.");
                setExportStatusMessage("Recorder stopped before data capture.");
             }
             return;
        }


        const currentTimeVal = exportAudioRef.current.currentTime;
        if (audioFullDuration > 0 && currentTimeVal >= audioFullDuration) {
            setExportStatusMessage("Audio ended. Stopping recorder...");
            if (localMediaRecorder.state === "recording") {
                try { localMediaRecorder.stop(); } catch(e) { console.warn("Error stopping media recorder at end of audio:", e); }
            }
            if (exportAnimationRequestRef.current) cancelAnimationFrame(exportAnimationRequestRef.current);
            return;
        }
        
        exportAnalyserNodeRef.current.getByteFrequencyData(frequencyData);
        exportAnalyserNodeRef.current.getByteTimeDomainData(timeDomainData);

        const visualizerProps = {
            visualizationType, linearGraphStyle, colorTheme, centerImage: loadedCenterImage,
            imageScale, pulseIntensity, imageCornerRadius, imageSwingIntensity,
            enablePulse, enableSwing, visualizerDetailScale,
            width: exportWidth, height: exportHeight, currentTime: currentTimeVal
        };

        try {
            renderSingleFrame(renderCtx, frequencyData, timeDomainData, visualizerProps);
        } catch (renderError: any) {
            console.error("Error during renderSingleFrame in export loop:", renderError);
            const renderErrorMessage = renderError.message || String(renderError);
            setError(`Error rendering export frame: ${renderErrorMessage}`);
            setExportStatusMessage(`Frame render error: ${renderErrorMessage}`);
            if (localMediaRecorder.state === "recording") {
                try { localMediaRecorder.stop(); } catch (e) { console.warn("Error stopping media recorder after render error:", e); }
            }
            if (exportAnimationRequestRef.current) cancelAnimationFrame(exportAnimationRequestRef.current);
            // cleanupExportResources will be called by onstop or if error is already set
            return; 
        }
        
        const newFrameCount = currentExportFrame + 1;
        setCurrentExportFrame(newFrameCount); // Update frame count *after* successful render

        if (newFrameCount % 10 === 0 || newFrameCount === 1) { 
            setExportStatusMessage(`Rendering frame ${newFrameCount} of ${totalExportFrames}...`);
        }

        if (exportRenderCanvasRef.current && exportPreviewCanvasRef.current) {
            const prevCtx = exportPreviewCanvasRef.current.getContext('2d');
            if (prevCtx) {
                prevCtx.drawImage(
                    exportRenderCanvasRef.current, 
                    0, 0, exportRenderCanvasRef.current.width, exportRenderCanvasRef.current.height, 
                    0, 0, exportPreviewCanvasRef.current.width, exportPreviewCanvasRef.current.height
                );
            }
        }

        if (audioFullDuration > 0) {
           const progressPercentage = Math.round((currentTimeVal / audioFullDuration) * 100);
           setExportProgress(exportType === 'mp4' ? Math.min(50, Math.round(progressPercentage * 0.5)) : progressPercentage);
        }
        exportAnimationRequestRef.current = requestAnimationFrame(renderFn);
    };

    exportAudioRef.current.onloadedmetadata = () => {
        setExportStatusMessage("Audio metadata loaded. Preparing recorder...");
        if(!exportAudioRef.current || !localMediaRecorder) { 
            setError("Audio or recorder missing after metadata load.");
            cleanupExportResources(exportAudioCtx, "Audio or recorder missing after metadata load."); 
            return; 
        }
        audioFullDuration = exportAudioRef.current.duration;

        if (isNaN(audioFullDuration) || audioFullDuration <= 0) {
            setError("Failed to get valid audio duration for export.");
            setExportStatusMessage("Invalid audio duration for export.");
            cleanupExportResources(exportAudioCtx, "Invalid audio duration");
            return;
        }

        const calculatedTotalFrames = Math.floor(audioFullDuration * currentExportFPS);
        setTotalExportFrames(calculatedTotalFrames);
        setExportStatusMessage(`Total frames to render: ${calculatedTotalFrames}.`);

        if (exportPreviewCanvasRef.current) {
            const aspectRatio = exportWidth / exportHeight;
            const previewWidth = 160; 
            const previewHeight = Math.round(previewWidth / aspectRatio);
            exportPreviewCanvasRef.current.width = previewWidth;
            exportPreviewCanvasRef.current.height = previewHeight;
            const prevCtx = exportPreviewCanvasRef.current.getContext('2d');
            if (prevCtx) {
                prevCtx.fillStyle = PALETTES[colorTheme].background;
                prevCtx.fillRect(0,0, previewWidth, previewHeight);
            }
        }
        
        localMediaRecorder.onstart = () => {
            console.log("MediaRecorder onstart: recording has begun.");
            setExportStatusMessage("Recorder started. Playing audio for capture...");
            if (!exportAudioRef.current) {
                 setError("Export audio element missing when MediaRecorder started.");
                 setExportStatusMessage("Export audio missing at recorder start.");
                 if (localMediaRecorder.state === "recording") {
                    try { localMediaRecorder.stop(); } catch(e){ console.warn("Error stopping recorder", e);}
                 } else {
                    cleanupExportResources(exportAudioCtx, "Audio missing at recorder start, recorder not active");
                 }
                 return;
            }
            exportAudioRef.current.play().then(() => {
                 exportAnimationRequestRef.current = requestAnimationFrame(renderFn);
            }).catch(e => {
                const playErrorMsg = `Failed to start audio for export: ${(e as Error).message}`;
                setError(playErrorMsg);
                setExportStatusMessage(playErrorMsg);
                if (localMediaRecorder.state === "recording") {
                  try { localMediaRecorder.stop(); } catch(stopErr) { console.warn("Error stopping media recorder during play error:", stopErr); }
                } else {
                  cleanupExportResources(exportAudioCtx, "Audio play failed during export, recorder not active");
                }
            });
        };

        localMediaRecorder.onerror = (event: Event) => {
            const mrError = (event as any).error || new Error("Unknown MediaRecorder error");
            const errorMsg = `MediaRecorder error: ${mrError.name} - ${mrError.message}`;
            console.error("MediaRecorder error:", mrError);
            setError(errorMsg);
            setExportStatusMessage(errorMsg);
            if (exportAnimationRequestRef.current) {
                cancelAnimationFrame(exportAnimationRequestRef.current);
                exportAnimationRequestRef.current = null;
            }
            // onstop should handle cleanup if state transitions to inactive
        };

        try {
            setExportStatusMessage("Starting recorder...");
            localMediaRecorder.start();
        } catch (startError) {
            const startErrorMsg = `Failed to start MediaRecorder: ${(startError as Error).message}`;
            setError(startErrorMsg);
            setExportStatusMessage(startErrorMsg);
            cleanupExportResources(exportAudioCtx, "Recorder start failed");
        }
    };

    exportAudioRef.current.onerror = (e) => {
        setError(`Error with export audio element. Cannot load for export.`);
        setExportStatusMessage("Export audio element error.");
        cleanupExportResources(exportAudioCtx, "Export audio load error");
        if (exportAnimationRequestRef.current) cancelAnimationFrame(exportAnimationRequestRef.current);
    };
    setExportStatusMessage("Loading export audio...");
    exportAudioRef.current.load(); 
  };
  // --- END EXPORT VIDEO LOGIC ---

  const controlButtonClass = "px-3 py-1.5 sm:px-4 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors duration-200 ease-out";
  const activeControlButtonClass = "bg-sky-500 text-white shadow-md";
  const inactiveControlButtonClass = "bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-sky-300";
  const sliderLabelClass = "text-xs text-slate-400 block text-center mb-0.5";
  const sliderClass = "w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
  const checkboxLabelClass = "flex items-center space-x-2 cursor-pointer text-slate-300 hover:text-sky-300 text-xs sm:text-sm";
  const checkboxClass = "form-checkbox h-4 w-4 text-sky-500 bg-slate-700 border-slate-600 rounded focus:ring-sky-500 focus:ring-offset-slate-800 focus:ring-offset-2";
  const selectClass = "bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg focus:ring-sky-500 focus:border-sky-500 block w-full p-2";


  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center p-4 pt-6 sm:p-6 selection:bg-sky-500 selection:text-white">
      <header className="mb-4 text-center">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-400 pb-1">
          AudioBeat Visualizer Pro
        </h1>
        <p className="text-slate-400 mt-1 text-sm sm:text-base lg:text-lg">Upload, customize, and immerse yourself in the rhythm!</p>
      </header>

      <main className="w-full max-w-5xl flex flex-col items-center space-y-4 px-2">
        <div className="flex flex-col sm:flex-row items-center sm:space-x-4">
          <AudioUpload onFileChange={handleAudioFileChange} disabled={isProcessingAudio || isPendingPlay || isExporting} />
          <ImageUpload onFileChange={handleImageFileChange} disabled={isProcessingImage || !audioFile || isPendingPlay || isExporting} />
        </div>
        
        {error && (
            <div className="my-2 p-3 bg-red-700 border border-red-500 rounded-lg text-sm text-white w-full max-w-lg text-center">
                Error: {error}
            </div>
        )}
         {isExporting && (
            <div className="my-2 p-3 bg-blue-600 rounded-lg text-sm text-white w-full max-w-lg text-center space-y-2">
                <div>
                    Exporting {exportSettings.exportType?.toUpperCase()} ({exportSettings.targetWidth}x{exportSettings.targetHeight}@{exportSettings.fps}fps)... {exportProgress}%
                    <div className="w-full bg-blue-400 rounded-full h-2.5 mt-1">
                        <div className="bg-blue-200 h-2.5 rounded-full" style={{ width: `${exportProgress}%` }}></div>
                    </div>
                </div>
                <canvas ref={exportPreviewCanvasRef} className="mx-auto border border-slate-400 rounded shadow-md" style={{ display: 'block', backgroundColor: PALETTES[colorTheme].background }}></canvas>
                {totalExportFrames > 0 && (
                    <p className="text-xs text-blue-200">
                        Frame: {currentExportFrame} / {totalExportFrames}
                    </p>
                )}
                {exportStatusMessage && (
                    <p className="text-xs text-blue-100 mt-1 animate-pulse min-h-[1em]">
                        {exportStatusMessage}
                    </p>
                )}
            </div>
        )}


        {audioFile && !error && (
          <div className="p-2.5 bg-slate-800 rounded-lg shadow-md text-xs sm:text-sm text-slate-300 w-full max-w-lg text-center truncate">
            Audio: <span className="font-semibold text-sky-400">{audioFile.name}</span>
            {centerImageFile && loadedCenterImage && <span> | Image: <span className="font-semibold text-purple-400">{centerImageFile.name}</span></span>}
          </div>
        )}
        
        {audioSrc && (
          <audio
            ref={audioRef}
            src={audioSrc}
            onEnded={handleAudioEnded}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onError={(e) => { 
                console.error("Audio Element Error:", e); 
                setError("Error loading audio file. It might be corrupted or an unsupported format."); 
                cleanupAudioNodes(); 
                setAudioSrc(null); 
                setAudioFile(null);
            }}
            crossOrigin="anonymous"
            className="hidden"
          />
        )}

        {/* Export Settings Modal */}
        {showExportSettingsModal && (
          <div className="fixed inset-0 bg-slate-900 bg-opacity-75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 p-6 rounded-lg shadow-2xl w-full max-w-md space-y-4 border border-slate-700">
              <h2 className="text-xl font-semibold text-sky-400 text-center">Export Settings</h2>
              
              <div>
                <label htmlFor="exportResolution" className="block mb-1 text-sm font-medium text-slate-300">Resolution</label>
                <select 
                  id="exportResolution" 
                  value={exportSettings.resolution}
                  onChange={(e) => handleExportSettingChange('resolution', e.target.value)}
                  className={selectClass}
                  disabled={isExporting}
                >
                  {Object.entries(RESOLUTION_PRESETS).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="exportFps" className="block mb-1 text-sm font-medium text-slate-300">FPS (Frames Per Second)</label>
                <select 
                  id="exportFps"
                  value={exportSettings.fps}
                  onChange={(e) => handleExportSettingChange('fps', parseInt(e.target.value))}
                  className={selectClass}
                  disabled={isExporting}
                >
                  {FPS_OPTIONS.map(fps => (
                    <option key={fps} value={fps}>{fps} FPS</option>
                  ))}
                </select>
              </div>
              
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  onClick={() => setShowExportSettingsModal(false)}
                  className={`${controlButtonClass} ${inactiveControlButtonClass} !px-5`}
                  disabled={isExporting}
                >
                  Cancel
                </button>
                <button
                  onClick={startActualExport}
                  className={`${controlButtonClass} ${activeControlButtonClass} !px-5`}
                  disabled={isExporting}
                >
                  Start {exportSettings.exportType?.toUpperCase()} Export
                </button>
              </div>
            </div>
          </div>
        )}


        {analyserNode && !error && (
          <>
            <div className="flex flex-col items-center space-y-3 p-3 bg-slate-800 rounded-lg shadow-lg w-full max-w-xl">
              <div className="flex items-center space-x-3 sm:space-x-4">
                <button
                  onClick={togglePlayPause}
                  className={`p-3 sm:p-3.5 rounded-full shadow-xl transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-opacity-75 ${isPendingPlay ? 'bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-400' : 'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 focus:ring-emerald-400'}`}
                  aria-label={isPlaying ? 'Pause' : (isPendingPlay ? `Starting in ${playDelayCountdown}s` : 'Play')}
                  disabled={!audioFile || isProcessingAudio || isExporting}
                >
                  {isPendingPlay ? (
                     <span className="text-white text-xs font-semibold w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center">{playDelayCountdown}s</span>
                  ) : isPlaying ? (
                    <PauseIcon className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                  ) : (
                    <PlayIcon className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                  )}
                </button>
                <div className="text-xs sm:text-sm text-slate-400">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
                 <button
                    onClick={toggleFullscreen}
                    className="p-2 bg-slate-700 hover:bg-slate-600 rounded-full text-slate-300 hover:text-sky-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                    disabled={isExporting}
                  >
                    {isFullscreen ? <FullscreenExitIcon className="w-5 h-5 sm:w-6 sm:h-6" /> : <FullscreenEnterIcon className="w-5 h-5 sm:w-6 sm:h-6" />}
                  </button>
              </div>
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                disabled={!audioFile || duration === 0 || isProcessingAudio || isPendingPlay || isExporting}
                className={`${sliderClass} accent-sky-500`}
                aria-label="Audio Seek Bar"
              />
                <div>
                    <label htmlFor="startDelayDuration" className={sliderLabelClass}>
                        Start Delay: {startDelayDuration}s
                    </label>
                    <input type="range" id="startDelayDuration" min="0" max="10" step="1" value={startDelayDuration}
                           onChange={(e) => setStartDelayDuration(parseInt(e.target.value))}
                           className={`${sliderClass} accent-yellow-500 w-48 sm:w-64`} aria-label="Start Play Delay"
                           disabled={isExporting || isPendingPlay}/>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xs mt-2">
                    <button
                        onClick={() => handleOpenExportSettings('webm')}
                        disabled={!audioFile || isExporting}
                        className={`${controlButtonClass} ${(!audioFile || isExporting) ? 'bg-slate-600 text-slate-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700 text-white'}`}
                    >
                       Export WebM (Fast)
                    </button>
                    <button
                        onClick={() => handleOpenExportSettings('mp4')}
                        disabled={!audioFile || !isFFmpegLoaded || isExporting}
                        className={`${controlButtonClass} ${(!audioFile || !isFFmpegLoaded || isExporting) ? 'bg-slate-600 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                    >
                       {isFFmpegLoaded ? 'Export MP4' : (exportStatusMessage.includes("FFmpeg loaded") ? 'Export MP4' : 'MP4 Tools Loading...')}
                    </button>
                </div>
            </div>
            
            <div className="p-4 bg-slate-800 rounded-lg shadow-lg w-full max-w-xl space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {(Object.values(VisualizationType) as VisualizationType[]).map((type) => (
                      <button key={type} onClick={() => setVisualizationType(type)}
                          className={`${controlButtonClass} ${visualizationType === type ? activeControlButtonClass : inactiveControlButtonClass}`}
                          disabled={isExporting}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                  ))}
                </div>
                {visualizationType === VisualizationType.LINEAR && (
                  <div>
                    <label className={sliderLabelClass}>Linear Style</label>
                    <div className="grid grid-cols-2 gap-3">
                        {(['bars', 'waveform'] as LinearGraphStyle[]).map((style) => (
                            <button key={style} onClick={() => setLinearGraphStyle(style)}
                                className={`${controlButtonClass} ${linearGraphStyle === style ? activeControlButtonClass : inactiveControlButtonClass}`}
                                disabled={isExporting}>
                                {style.charAt(0).toUpperCase() + style.slice(1)}
                            </button>
                        ))}
                    </div>
                  </div>
                )}
                
                <div>
                    <label className={sliderLabelClass}>Color Theme</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {(Object.keys(PALETTES) as ColorTheme[]).map((theme) => (
                            <button key={theme} onClick={() => setColorTheme(theme)}
                                className={`${controlButtonClass} ${colorTheme === theme ? activeControlButtonClass : inactiveControlButtonClass} capitalize`}
                                disabled={isExporting}>
                                {theme.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="visualizerDetailScale" className={sliderLabelClass}>
                            Visualizer Detail: {Math.round(visualizerDetailScale * 100)}%
                        </label>
                        <input type="range" id="visualizerDetailScale" min="0.5" max="1.5" step="0.05" value={visualizerDetailScale}
                               onChange={(e) => setVisualizerDetailScale(parseFloat(e.target.value))}
                               className={`${sliderClass} accent-teal-500`} aria-label="Visualizer Detail Scale" disabled={isExporting}/>
                    </div>
                    {loadedCenterImage && (
                        <div>
                            <label htmlFor="imageScale" className={sliderLabelClass}>
                                Image Size: {Math.round(imageScale * 100)}%
                            </label>
                            <input type="range" id="imageScale" min="0.2" max="2" step="0.05" value={imageScale}
                                   onChange={(e) => setImageScale(parseFloat(e.target.value))}
                                   className={`${sliderClass} accent-pink-500`} aria-label="Image Size" disabled={isExporting}/>
                        </div>
                    )}
                </div>

                {loadedCenterImage && (
                  <>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 items-center">
                        <label className={checkboxLabelClass}>
                            <input type="checkbox" checked={enablePulse} onChange={(e) => setEnablePulse(e.target.checked)} className={checkboxClass} disabled={isExporting} />
                            <span>Pulse Effect</span>
                        </label>
                        <label className={checkboxLabelClass}>
                            <input type="checkbox" checked={enableSwing} onChange={(e) => setEnableSwing(e.target.checked)} className={checkboxClass} disabled={isExporting} />
                            <span>Swing Effect</span>
                        </label>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         {enablePulse && ( 
                            <div>
                                <label htmlFor="pulseIntensity" className={sliderLabelClass}>
                                    Pulse Strength: {Math.round(pulseIntensity / 4 * 100)}% 
                                </label>
                                <input
                                    type="range" id="pulseIntensity" min="0" max="4" step="0.1" 
                                    value={pulseIntensity}
                                    onChange={(e) => setPulseIntensity(parseFloat(e.target.value))}
                                    className={`${sliderClass} accent-purple-500`}
                                    aria-label="Image Pulse Intensity" disabled={isExporting}
                                />
                            </div>
                        )}
                        <div>
                            <label htmlFor="imageCornerRadius" className={sliderLabelClass}>
                                Corner Radius: {imageCornerRadius * 2}%
                            </label>
                            <input type="range" id="imageCornerRadius" min="0" max="50" step="1" value={imageCornerRadius}
                                   onChange={(e) => setImageCornerRadius(parseInt(e.target.value))}
                                   className={`${sliderClass} accent-indigo-500`} aria-label="Image Corner Radius" disabled={isExporting}/>
                        </div>
                    </div>

                    {enableSwing && (
                        <div>
                            <label htmlFor="imageSwingIntensity" className={sliderLabelClass}>
                                Swing Intensity: {imageSwingIntensity}°
                            </label>
                            <input type="range" id="imageSwingIntensity" min="0" max="30" step="1" value={imageSwingIntensity}
                                   onChange={(e) => setImageSwingIntensity(parseInt(e.target.value))}
                                   className={`${sliderClass} accent-lime-500`} aria-label="Image Swing Intensity" disabled={isExporting}/>
                        </div>
                    )}
                  </>
                )}
            </div>

            <div 
              ref={visualizerContainerRef} 
              className={`w-full bg-slate-800 rounded-lg shadow-2xl overflow-hidden border-2 border-slate-700 transition-all duration-300 ease-in-out ${
                isFullscreen ? 'fixed inset-0 z-50 !rounded-none !border-none' : 'relative max-w-4xl aspect-[16/9]'
              }`}
              style={isFullscreen ? {width: '100vw', height: '100vh'} : {width: `${visualizerSize.width}px`, height: `${visualizerSize.height}px` }}
            >
                 <Visualizer
                    analyserNode={analyserNode}
                    visualizationType={visualizationType}
                    isPlaying={isPlaying}
                    width={visualizerSize.width} 
                    height={visualizerSize.height}
                    centerImage={loadedCenterImage}
                    linearGraphStyle={linearGraphStyle}
                    colorTheme={colorTheme}
                    pulseIntensity={pulseIntensity}
                    imageScale={imageScale}
                    visualizerDetailScale={visualizerDetailScale}
                    imageCornerRadius={imageCornerRadius}
                    imageSwingIntensity={imageSwingIntensity}
                    enablePulse={enablePulse}
                    enableSwing={enableSwing}
                />
            </div>
          </>
        )}
         {!analyserNode && !isProcessingAudio && !error && !isExporting && (
            <div className="mt-8 p-6 sm:p-8 bg-slate-800 rounded-xl shadow-xl text-center text-slate-400 max-w-md">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 sm:h-16 sm:w-16 text-sky-500 mx-auto mb-3 sm:mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                </svg>
                <h2 className="text-xl sm:text-2xl font-semibold text-slate-200 mb-2">Ready to Visualize?</h2>
                <p className="text-sm sm:text-base">Upload an audio file to get started. You can also add an image to personalize your visualization.</p>
                {!isFFmpegLoaded && <p className="text-xs text-amber-400 mt-3">{exportStatusMessage || "Initializing MP4 export tools, please wait... WebM export is available."}</p>}
            </div>
        )}
      </main>
    </div>
  );
};

export default App;
    