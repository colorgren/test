import React, { useRef, useEffect } from 'react';
import { VisualizationType, LinearGraphStyle, ColorTheme, PALETTES } from '../types';
import { drawLinearBarsCore, drawLinearWaveformCore, drawCircularBarsCore, drawImageCore } from './visualizationRenderer';

interface VisualizerProps {
  analyserNode: AnalyserNode;
  visualizationType: VisualizationType;
  isPlaying: boolean;
  width: number;
  height: number;
  centerImage: HTMLImageElement | null;
  linearGraphStyle: LinearGraphStyle;
  colorTheme: ColorTheme;
  pulseIntensity: number; 
  imageScale: number;
  visualizerDetailScale: number;
  imageCornerRadius: number;
  imageSwingIntensity: number;
  enablePulse: boolean;
  enableSwing: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({
  analyserNode,
  visualizationType,
  isPlaying,
  width, 
  height, 
  centerImage,
  linearGraphStyle,
  colorTheme,
  pulseIntensity,
  imageScale,
  visualizerDetailScale,
  imageCornerRadius,
  imageSwingIntensity,
  enablePulse,
  enableSwing,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number | null>(null);
  const frequencyDataArrayRef = useRef<Uint8Array | null>(null);
  const timeDomainDataArrayRef = useRef<Uint8Array | null>(null);
  const liveCurrentTimeRef = useRef(0);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    analyserNode.fftSize = 512; // Ensure this is consistent
    const frequencyBufferLength = analyserNode.frequencyBinCount;
    
    if (!frequencyDataArrayRef.current || frequencyDataArrayRef.current.length !== frequencyBufferLength) {
      frequencyDataArrayRef.current = new Uint8Array(frequencyBufferLength);
    }
    if (!timeDomainDataArrayRef.current || timeDomainDataArrayRef.current.length !== analyserNode.fftSize) { // fftSize for time domain
      timeDomainDataArrayRef.current = new Uint8Array(analyserNode.fftSize);
    }
    
    const frequencyDataArray = frequencyDataArrayRef.current;
    const timeDomainDataArray = timeDomainDataArrayRef.current;

    const currentPalette = PALETTES[colorTheme];

    const renderFrame = (timestamp: number) => {
      if (!isPlaying) return; // Ensure isPlaying is checked inside the loop as well

      if (liveCurrentTimeRef.current === 0) liveCurrentTimeRef.current = timestamp;
      const elapsed = (timestamp - liveCurrentTimeRef.current) / 1000.0; // Elapsed time in seconds for swing

      analyserNode.getByteFrequencyData(frequencyDataArray);
      analyserNode.getByteTimeDomainData(timeDomainDataArray);

      ctx.fillStyle = currentPalette.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      if (visualizationType === VisualizationType.LINEAR) {
        if (linearGraphStyle === 'bars') {
          drawLinearBarsCore(ctx, frequencyDataArray, frequencyBufferLength, canvas.width, canvas.height, currentPalette, visualizerDetailScale);
        } else if (linearGraphStyle === 'waveform') {
          drawLinearWaveformCore(ctx, timeDomainDataArray, canvas.width, canvas.height, currentPalette, visualizerDetailScale);
        }
      } else { 
        drawCircularBarsCore(ctx, frequencyDataArray, frequencyBufferLength, canvas.width, canvas.height, currentPalette, visualizerDetailScale);
      }

      if (centerImage) {
        drawImageCore(ctx, centerImage, frequencyDataArray, canvas.width, canvas.height, {
            visualizationType,
            imageScale,
            pulseIntensity,
            imageCornerRadius,
            imageSwingIntensity,
            enablePulse,
            enableSwing,
            currentTime: elapsed // Use elapsed time for live swing animation
        });
      }
      animationFrameId.current = requestAnimationFrame(renderFrame);
    };

    if (isPlaying) {
      liveCurrentTimeRef.current = performance.now(); // Reset time for swing on play
      animationFrameId.current = requestAnimationFrame(renderFrame);
    } else {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
      ctx.fillStyle = currentPalette.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (centerImage) { 
        drawImageCore(ctx, centerImage, null, canvas.width, canvas.height, {
             visualizationType, imageScale, pulseIntensity, imageCornerRadius, imageSwingIntensity, enablePulse, enableSwing, currentTime: 0
        }, false); // Static image
      } else {
        ctx.fillStyle = currentPalette.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.min(24, canvas.width / 20)}px Inter, sans-serif`;
        ctx.fillText('Paused', canvas.width / 2, canvas.height / 2);
      }
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [
      analyserNode, visualizationType, isPlaying, width, height, 
      centerImage, linearGraphStyle, colorTheme, 
      pulseIntensity, imageScale, visualizerDetailScale, imageCornerRadius, imageSwingIntensity,
      enablePulse, enableSwing
    ]);
  
  return <canvas ref={canvasRef} className="rounded-lg shadow-xl block" style={{width: '100%', height: '100%'}} />;
};

export default Visualizer;
