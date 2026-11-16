
import { GoogleGenAI, Type } from "@google/genai";
import { UIElement, Project } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const ELEMENT_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      label: { type: Type.STRING },
      x: { type: Type.NUMBER },
      y: { type: Type.NUMBER },
      width: { type: Type.NUMBER },
      height: { type: Type.NUMBER },
      type: { type: Type.STRING },
      text: { type: Type.STRING },
      color: { type: Type.STRING },
    },
    required: ['id', 'label', 'x', 'y', 'width', 'height', 'type']
  }
};

export const analyzeInterfaceImage = async (base64Image: string): Promise<UIElement[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image.split(',')[1] } },
          { text: "Analyze this UI and return a JSON array of UI elements (buttons, inputs, cards, etc) with their bounding boxes (x,y,w,h as 0-100 percentages)." }
        ],
      },
      config: { responseMimeType: "application/json", responseSchema: ELEMENT_SCHEMA }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Analysis error:", error);
    return [];
  }
};

export const runAiFunction = async (
  task: 'merge' | 'optimize_space' | 'modernize' | 'theme', 
  context: { elements: UIElement[], prompt?: string, secondaryImage?: string, theme?: string }
): Promise<UIElement[]> => {
  let systemPrompt = "";
  const parts: any[] = [];

  switch (task) {
    case 'merge':
      systemPrompt = "Merge the layout from the secondary image into the existing layout logic. Do not duplicate items, combine them into a single coherent interface.";
      if (context.secondaryImage) {
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: context.secondaryImage.split(',')[1] } });
      }
      break;
    case 'optimize_space':
      systemPrompt = "Reorganize the elements to fix overlaps, fill awkward gaps, and ensure a logical grid flow. Maintain functionality.";
      break;
    case 'modernize':
      systemPrompt = "Update the style and positioning of these elements to look like a modern, 2025-era UI. Keep original content.";
      break;
    case 'theme':
      systemPrompt = `Redefine the entire layout to match the theme: "${context.theme}". Adjust positioning and structure for the target audience.`;
      break;
  }

  parts.push({ text: `${systemPrompt}\nCurrent elements: ${JSON.stringify(context.elements)}\nUser context: ${context.prompt || ""}` });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: { responseMimeType: "application/json", responseSchema: ELEMENT_SCHEMA }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error(`AI Task ${task} failed:`, error);
    return context.elements;
  }
};

export const getColorPalette = async (theme: string): Promise<string[]> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Modern UI color palette for theme: "${theme}". JSON array of 5 hex strings.`,
    config: { responseMimeType: "application/json", responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } } }
  });
  return JSON.parse(response.text || '[]');
};

export const suggestChangesToSpecific = async (prompt: string, allElements: UIElement[], selectedIds: string[]): Promise<UIElement[]> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Modify ONLY these elements: ${JSON.stringify(allElements.filter(e => selectedIds.includes(e.id)))}, within the context of the whole app: ${JSON.stringify(allElements)}. Task: ${prompt}. Return full updated element list.`,
    config: { responseMimeType: "application/json", responseSchema: ELEMENT_SCHEMA }
  });
  return JSON.parse(response.text || "[]");
};

export const deconstructElement = async (base64Image: string, targetElement: UIElement): Promise<UIElement[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image.split(',')[1] } },
          { text: `Focus strictly on the region defined by x=${targetElement.x}%, y=${targetElement.y}%, width=${targetElement.width}%, height=${targetElement.height}%. 
                   This region represents a '${targetElement.type}'. 
                   Deconstruct this single element into its smaller atomic sub-components (icons, labels, backgrounds, inner buttons). 
                   Return a JSON array of these new sub-elements with absolute coordinates (0-100% of the full image).
                   Do NOT return the original container element.` }
        ],
      },
      config: { responseMimeType: "application/json", responseSchema: ELEMENT_SCHEMA }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Deconstruction error:", error);
    return [];
  }
};

export const detectMissingElements = async (base64Image: string, existingElements: UIElement[]): Promise<UIElement[]> => {
  try {
    // We simplify the input to avoid token limits, sending just bounding boxes
    const existingBoxes = existingElements.map(e => ({ id: e.id, type: e.type, box: [e.x, e.y, e.width, e.height] }));
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image.split(',')[1] } },
          { text: `The following elements have already been detected: ${JSON.stringify(existingBoxes)}. 
                   Analyze the image and identify valid UI components that are MISSING from this list. 
                   Look for small icons, text labels, decorations, or containers that were skipped.
                   Return ONLY the new elements found.` }
        ],
      },
      config: { responseMimeType: "application/json", responseSchema: ELEMENT_SCHEMA }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Detection error:", error);
    return [];
  }
};
