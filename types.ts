
import React from 'react';

export type ElementType = 'button' | 'card' | 'input' | 'text' | 'image' | 'header' | 'container' | 'sidebar' | 'nav';

export interface UIElement {
  id: string;
  label: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage
  height: number; // percentage
  color?: string;
  text?: string;
  type: ElementType;
  style?: React.CSSProperties;
  imageData?: string; // Base64 string of the cropped element
}

export interface Project {
  id: string;
  name: string;
  image: string | null; // The background image (with holes erased)
  originalImage: string | null; // The pristine source image
  elements: UIElement[];
  canvasWidth: number; // pixels
  canvasHeight: number; // pixels
}

export interface AppState {
  projects: Project[];
  activeProjectId: string;
  selectedElementIds: string[];
  clipboard: UIElement[];
  isAnalyzing: boolean;
  zoom: number;
}
