export enum VisualizationType {
  LINEAR = 'linear',
  CIRCULAR = 'circular',
}

export type LinearGraphStyle = 'bars' | 'waveform';

export type ColorTheme = 'sky' | 'sunset' | 'forest' | 'neon_dreams';

export type PlayerControlsVisibility = 'visible' | 'hidden';

export type ColorPaletteDefinition = {
  name: string;
  barGradient: string[];
  waveformStroke: string;
  circularFill: (hueMultiplier: number, alpha: number) => string;
  background: string;
  text: string;
};

export const PALETTES: Record<ColorTheme, ColorPaletteDefinition> = {
  sky: {
    name: 'Sky',
    barGradient: ['rgb(14, 165, 233)', 'rgb(56, 189, 248)', 'rgb(125, 211, 252)'],
    waveformStroke: 'rgb(56, 189, 248)',
    circularFill: (hue, alpha) => `hsla(${(hue * 300 + 180) % 360}, 90%, 65%, ${alpha})`,
    background: 'rgba(15, 23, 42, 1)', 
    text: 'rgba(203, 213, 225, 0.7)', 
  },
  sunset: {
    name: 'Sunset',
    barGradient: ['#F97316', '#FDBA74', '#FECACA'], 
    waveformStroke: '#F97316',
    circularFill: (hue, alpha) => `hsla(${(hue * 40 + 10) % 360}, 100%, 60%, ${alpha})`,
    background: 'rgba(30, 20, 10, 1)',
    text: 'rgba(253, 186, 116, 0.8)',
  },
  forest: {
    name: 'Forest',
    barGradient: ['#16A34A', '#4ADE80', '#BBF7D0'],
    waveformStroke: '#16A34A',
    circularFill: (hue, alpha) => `hsla(${(hue * 60 + 90) % 360}, 70%, 50%, ${alpha})`,
    background: 'rgba(10, 25, 15, 1)',
    text: 'rgba(134, 239, 172, 0.8)',
  },
  neon_dreams: {
    name: 'Neon Dreams',
    barGradient: ['#EC4899', '#F472B6', '#F9A8D4'],
    waveformStroke: '#DB2777',
    circularFill: (hue, alpha) => `hsla(${(hue * 360 + 280) % 360}, 100%, 65%, ${alpha})`,
    background: 'rgba(20, 5, 30, 1)',
    text: 'rgba(240, 171, 252, 0.8)',
  },
};
