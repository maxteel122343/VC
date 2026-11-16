
import { UIElement } from '../types';

export const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

// Crops specific regions from the source image and assigns them to the elements
export const extractElementImages = async (
  sourceImageBase64: string, 
  elements: UIElement[]
): Promise<UIElement[]> => {
  const img = await loadImage(sourceImageBase64);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return elements;

  return elements.map(el => {
    // Convert percentage to pixels
    const x = (el.x / 100) * img.width;
    const y = (el.y / 100) * img.height;
    const w = (el.width / 100) * img.width;
    const h = (el.height / 100) * img.height;

    // Safety check for zero dimensions
    if (w <= 0 || h <= 0) return el;

    canvas.width = w;
    canvas.height = h;
    
    // Draw the specific region
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
    
    return {
      ...el,
      imageData: canvas.toDataURL('image/png')
    };
  });
};

// Fills the area of the elements with a solid color derived from the edges (naive inpainting)
export const eraseElementsFromBackground = async (
  backgroundImageBase64: string,
  elements: UIElement[]
): Promise<string> => {
  const img = await loadImage(backgroundImageBase64);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return backgroundImageBase64;

  // Draw original
  ctx.drawImage(img, 0, 0);

  elements.forEach(el => {
    const x = Math.floor((el.x / 100) * img.width);
    const y = Math.floor((el.y / 100) * img.height);
    const w = Math.ceil((el.width / 100) * img.width);
    const h = Math.ceil((el.height / 100) * img.height);

    if (w <= 0 || h <= 0) return;

    // Get color from the top-left pixel just outside the box (simple heuristic)
    // A better approach would be averaging the border, but for speed, we sample a few points
    try {
        const sampleX = Math.max(0, x - 2);
        const sampleY = Math.max(0, y - 2);
        const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
        const color = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
        
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
    } catch (e) {
        // Fallback if reading pixel fails
        ctx.clearRect(x, y, w, h); 
    }
  });

  return canvas.toDataURL('image/png');
};
