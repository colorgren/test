
import { VisualizationType, LinearGraphStyle, ColorTheme, PALETTES, ColorPaletteDefinition } from '../types';

// Core drawing functions, extracted to be reusable by Visualizer.tsx and App.tsx (for export)

export const drawImageCore = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  audioData: Uint8Array | null, // For pulse
  canvasW: number,
  canvasH: number,
  props: {
    visualizationType: VisualizationType;
    imageScale: number;
    pulseIntensity: number;
    imageCornerRadius: number;
    imageSwingIntensity: number;
    enablePulse: boolean;
    enableSwing: boolean;
    currentTime: number; // For deterministic swing
  },
  react: boolean = true
) => {
  const baseScaleFactor = props.visualizationType === VisualizationType.CIRCULAR ? 3.0 : 2.5;
  const maxImgWidth = canvasW / baseScaleFactor * props.imageScale;
  const maxImgHeight = canvasH / baseScaleFactor * props.imageScale;
  
  let imgScaleRatio = Math.min(maxImgWidth / img.naturalWidth, maxImgHeight / img.naturalHeight, 1 * props.imageScale);
  let dWidth = img.naturalWidth * imgScaleRatio;
  let dHeight = img.naturalHeight * imgScaleRatio;

  let currentBeatScale = 1.0;
  if (react && props.enablePulse && audioData && audioData.length > 0 && props.pulseIntensity > 0) {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i];
    }
    const average = sum / audioData.length;
    const basePulseEffect = 0.2; 
    currentBeatScale = 1 + (average / 255) * (basePulseEffect * props.pulseIntensity);
  }
  
  dWidth *= currentBeatScale;
  dHeight *= currentBeatScale;

  const dxInitial = (canvasW - dWidth) / 2;
  const dyInitial = (canvasH - dHeight) / 2;

  ctx.save();
  
  let dx = dxInitial;
  let dy = dyInitial;

  if (react && props.enableSwing && props.imageSwingIntensity > 0) {
      const swingSpeedFactor = 0.5; 
      const currentSwingAngleRad = Math.sin(props.currentTime * swingSpeedFactor) * (props.imageSwingIntensity * Math.PI / 180);
      ctx.translate(canvasW / 2, canvasH / 2);
      ctx.rotate(currentSwingAngleRad);
      dx = -dWidth / 2;
      dy = -dHeight / 2;
  }

  ctx.globalAlpha = 0.9; 
  
  if (props.imageCornerRadius > 0 && dWidth > 0 && dHeight > 0) {
      const cornerRadiusVal = Math.min(dWidth, dHeight) / 2 * (Math.min(props.imageCornerRadius, 50) / 50);
      
      ctx.beginPath();
      ctx.moveTo(dx + cornerRadiusVal, dy);
      ctx.arcTo(dx + dWidth, dy, dx + dWidth, dy + dHeight, cornerRadiusVal);
      ctx.arcTo(dx + dWidth, dy + dHeight, dx, dy + dHeight, cornerRadiusVal);
      ctx.arcTo(dx, dy + dHeight, dx, dy, cornerRadiusVal);
      ctx.arcTo(dx, dy, dx + dWidth, dy, cornerRadiusVal);
      ctx.closePath();
      ctx.clip();
  }
  
  ctx.drawImage(img, dx, dy, dWidth, dHeight);
  ctx.restore(); 
};

export const drawLinearBarsCore = (
  ctx: CanvasRenderingContext2D,
  audioData: Uint8Array,
  bufferLen: number,
  canvasW: number,
  canvasH: number,
  palette: ColorPaletteDefinition,
  visualizerDetailScale: number
) => {
  const spacing = Math.max(1, canvasW * 0.003);
  const numBarsToDisplay = Math.floor(bufferLen * 0.75); 
  const effectiveNumBars = Math.max(1, numBarsToDisplay);
  const barWidth = (canvasW - (effectiveNumBars -1) * spacing) / effectiveNumBars;
  let x = 0;

  for (let i = 0; i < effectiveNumBars; i++) {
    const barHeightPercentage = (audioData[i] / 255);
    const barHeight = barHeightPercentage * canvasH * 0.9 * visualizerDetailScale;

    const gradient = ctx.createLinearGradient(x, canvasH, x, canvasH - barHeight);
    gradient.addColorStop(0, palette.barGradient[0]);
    gradient.addColorStop(0.6, palette.barGradient[1]);
    gradient.addColorStop(1, palette.barGradient[2]);
    
    ctx.fillStyle = gradient;
    ctx.globalAlpha = Math.max(0.2, barHeightPercentage);
    ctx.fillRect(x, canvasH - barHeight, Math.max(1, barWidth), barHeight);
    ctx.globalAlpha = 1.0;
    x += barWidth + spacing;
  }
};

export const drawLinearWaveformCore = (
  ctx: CanvasRenderingContext2D,
  audioData: Uint8Array, // This should be time domain data
  canvasW: number,
  canvasH: number,
  palette: ColorPaletteDefinition,
  visualizerDetailScale: number
) => {
  ctx.lineWidth = Math.max(1, Math.min(3, canvasW * 0.004)) * visualizerDetailScale;
  ctx.strokeStyle = palette.waveformStroke;
  ctx.beginPath();

  const sliceWidth = canvasW / audioData.length;
  let x = 0;

  for (let i = 0; i < audioData.length; i++) {
    const v = audioData[i] / 128.0; 
    const y = (v * canvasH / 2 - canvasH / 2) * visualizerDetailScale + canvasH / 2;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    x += sliceWidth;
  }
  ctx.lineTo(canvasW, canvasH / 2); 
  ctx.stroke();
};

export const drawCircularBarsCore = (
  ctx: CanvasRenderingContext2D,
  audioData: Uint8Array,
  bufferLen: number,
  canvasW: number, 
  canvasH: number, 
  palette: ColorPaletteDefinition,
  visualizerDetailScale: number
) => {
  const centerX = canvasW / 2;
  const centerY = canvasH / 2;
  
  const innerRadius = 2; 
  const effectiveMaxOuterRadius = (Math.min(canvasW, canvasH) / 2) * 0.9 * visualizerDetailScale;

  const numBarsToDisplay = Math.floor(bufferLen * 0.7);
  const barAngularWidth = (Math.PI * 2) / numBarsToDisplay;
  const barDisplayWidthFactor = 0.85; 
  const barVisualThickness = Math.max(1, (Math.PI * 2 * (effectiveMaxOuterRadius * 0.5)) / numBarsToDisplay * barDisplayWidthFactor );

  for (let i = 0; i < numBarsToDisplay; i++) {
    const barHeightPercentage = audioData[i] / 255;
    const barLength = barHeightPercentage * (effectiveMaxOuterRadius - innerRadius);
    
    if (barLength < 1) continue;

    const angle = i * barAngularWidth;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle - Math.PI / 2); 

    const alpha = Math.max(0.2, barHeightPercentage);
    ctx.fillStyle = palette.circularFill(i / numBarsToDisplay, alpha);
    
    const capRadius = barVisualThickness / 2;

    if (barLength > capRadius * 0.5 && capRadius > 0) { 
      ctx.beginPath();
      ctx.moveTo(-capRadius, innerRadius);
      ctx.lineTo(-capRadius, innerRadius + barLength - capRadius);
      if (barLength > capRadius) { 
        ctx.arc(0, innerRadius + barLength - capRadius, capRadius, Math.PI, 0, false);
      } else { 
         ctx.lineTo(capRadius, innerRadius + barLength - capRadius);
      }
      ctx.lineTo(capRadius, innerRadius);
      ctx.closePath();
      ctx.fill();
    } else if (barLength > 0) {
       ctx.fillRect(-barVisualThickness / 2, innerRadius, barVisualThickness, barLength);
    }
    ctx.restore();
  }
};

export const renderSingleFrame = (
    ctx: CanvasRenderingContext2D,
    frequencyData: Uint8Array,
    timeDomainData: Uint8Array,
    props: {
        visualizationType: VisualizationType;
        linearGraphStyle: LinearGraphStyle;
        colorTheme: ColorTheme;
        centerImage: HTMLImageElement | null;
        imageScale: number;
        pulseIntensity: number;
        imageCornerRadius: number;
        imageSwingIntensity: number;
        enablePulse: boolean;
        enableSwing: boolean;
        visualizerDetailScale: number;
        width: number;
        height: number;
        currentTime: number; // For deterministic animations like swing
    }
) => {
    const currentPalette = PALETTES[props.colorTheme];
    ctx.fillStyle = currentPalette.background;
    ctx.fillRect(0, 0, props.width, props.height);

    if (props.visualizationType === VisualizationType.LINEAR) {
        if (props.linearGraphStyle === 'bars') {
            drawLinearBarsCore(ctx, frequencyData, frequencyData.length, props.width, props.height, currentPalette, props.visualizerDetailScale);
        } else if (props.linearGraphStyle === 'waveform') {
            drawLinearWaveformCore(ctx, timeDomainData, props.width, props.height, currentPalette, props.visualizerDetailScale);
        }
    } else {
        drawCircularBarsCore(ctx, frequencyData, frequencyData.length, props.width, props.height, currentPalette, props.visualizerDetailScale);
    }

    if (props.centerImage) {
        drawImageCore(ctx, props.centerImage, frequencyData, props.width, props.height, {
            visualizationType: props.visualizationType,
            imageScale: props.imageScale,
            pulseIntensity: props.pulseIntensity,
            imageCornerRadius: props.imageCornerRadius,
            imageSwingIntensity: props.imageSwingIntensity,
            enablePulse: props.enablePulse,
            enableSwing: props.enableSwing,
            currentTime: props.currentTime,
        }, true);
    }
};
