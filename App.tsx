
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { UIElement, Project, ElementType } from './types';
import * as AiService from './services/geminiService';
import * as ImageProcessor from './utils/imageProcessor';
import DraggableElement from './components/DraggableElement';

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([{ id: '1', name: 'Untitled Project', image: null, originalImage: null, elements: [], canvasWidth: 800, canvasHeight: 600 }]);
  const [activeId, setActiveId] = useState('1');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [zoom, setZoom] = useState(100);
  const [palette, setPalette] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, visible: boolean } | null>(null);
  const [clipboard, setClipboard] = useState<UIElement[]>([]);
  const [selectionMarquee, setSelectionMarquee] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
  
  // New States for "Detect Missing" Review Flow
  const [candidates, setCandidates] = useState<UIElement[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const activeProject = projects.find(p => p.id === activeId)!;

  // -- State Updaters --
  const updateProject = (id: string, updates: Partial<Project>) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const updateElements = (newElements: UIElement[]) => {
    updateProject(activeId, { elements: newElements });
  };

  // -- Handlers --
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      setIsAnalyzing(true);
      
      // 1. Detect Elements
      const detected = await AiService.analyzeInterfaceImage(base64);
      
      // 2. Crop Images for Elements (Deconstruction)
      const elementsWithImages = await ImageProcessor.extractElementImages(base64, detected);
      
      // 3. Erase Elements from Background
      const cleanBackground = await ImageProcessor.eraseElementsFromBackground(base64, detected);

      updateProject(activeId, { 
        image: cleanBackground, 
        originalImage: base64,
        elements: elementsWithImages 
      });
      setIsAnalyzing(false);
    };
    reader.readAsDataURL(file);
  };

  const handleMergeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      setIsAnalyzing(true);
      const merged = await AiService.runAiFunction('merge', { elements: activeProject.elements, secondaryImage: base64 });
      updateElements(merged);
      setIsAnalyzing(false);
    };
    reader.readAsDataURL(file);
  };

  const handleAiAction = async (task: any, extra?: any) => {
    setIsAnalyzing(true);
    let result;
    if (selectedIds.length > 0 && task === 'prompt') {
      result = await AiService.suggestChangesToSpecific(aiPrompt, activeProject.elements, selectedIds);
    } else if (task === 'prompt') {
      result = await AiService.runAiFunction('modernize', { elements: activeProject.elements, prompt: aiPrompt });
    } else {
      result = await AiService.runAiFunction(task, { elements: activeProject.elements, ...extra });
    }
    updateElements(result);
    setIsAnalyzing(false);
    setAiPrompt("");
  };

  const onElementSelect = (id: string, multi: boolean) => {
    if (isReviewing) return;
    if (multi) {
      setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    } else {
      setSelectedIds([id]);
    }
  };

  const updateElement = useCallback((id: string, updates: Partial<UIElement>) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== activeId) return p;
      return {
        ...p,
        elements: p.elements.map(el => el.id === id ? { ...el, ...updates } : el)
      };
    }));
  }, [activeId]);

  // -- Context Menu Logic --
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, visible: true });
  };

  const handleAction = async (type: string) => {
    const selected = activeProject.elements.filter(el => selectedIds.includes(el.id));
    setContextMenu(null);

    switch (type) {
      case 'copy': setClipboard([...selected]); break;
      case 'duplicate':
        const dups = selected.map(s => ({ ...s, id: Math.random().toString(36), x: s.x + 2, y: s.y + 2 }));
        updateElements([...activeProject.elements, ...dups]);
        break;
      case 'delete':
        updateElements(activeProject.elements.filter(el => !selectedIds.includes(el.id)));
        setSelectedIds([]);
        break;
      case 'paste':
        const pasted = clipboard.map(c => ({ ...c, id: Math.random().toString(36), x: c.x + 5, y: c.y + 5 }));
        updateElements([...activeProject.elements, ...pasted]);
        break;
      case 'deconstruct':
        // Deconstruct a specific item into sub-items
        if (selected.length === 1 && activeProject.originalImage) {
          setIsAnalyzing(true);
          const subElements = await AiService.deconstructElement(activeProject.originalImage, selected[0]);
          
          // Crop images for new sub-elements from the ORIGINAL source
          const subElementsWithImages = await ImageProcessor.extractElementImages(activeProject.originalImage, subElements);
          
          // Remove the parent container and add sub-elements
          const remaining = activeProject.elements.filter(el => el.id !== selected[0].id);
          updateElements([...remaining, ...subElementsWithImages]);
          
          // Note: We don't re-erase the background here because the parent was likely already erasing that area,
          // or if it wasn't, the sub-elements will now cover it. 
          // Ideally, we might want to update the background again, but for speed we skip re-erasing the whole canvas.
          
          setIsAnalyzing(false);
          setSelectedIds([]);
        }
        break;
      case 'detect':
        // Detect missing items
        if (activeProject.originalImage) {
          setIsAnalyzing(true);
          const newItems = await AiService.detectMissingElements(activeProject.originalImage, activeProject.elements);
          
          // Prepare candidates - we don't crop yet until confirmed
          setCandidates(newItems);
          setSelectedCandidateIds(newItems.map(i => i.id));
          setIsReviewing(true);
          setIsAnalyzing(false);
        }
        break;
    }
  };

  // -- Candidate Review Logic --
  const toggleCandidate = (id: string) => {
    setSelectedCandidateIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const applyCandidates = async () => {
    if (!activeProject.originalImage) return;

    setIsAnalyzing(true);
    const toAddRaw = candidates.filter(c => selectedCandidateIds.includes(c.id));
    
    // 1. Crop images for the new items
    const toAddWithImages = await ImageProcessor.extractElementImages(activeProject.originalImage, toAddRaw);
    
    // 2. Erase these new items from the CURRENT background
    // We use the current active background (which already has holes) and make more holes
    const newBackground = await ImageProcessor.eraseElementsFromBackground(activeProject.image || activeProject.originalImage, toAddWithImages);
    
    updateProject(activeId, {
      image: newBackground,
      elements: [...activeProject.elements, ...toAddWithImages]
    });
    
    setIsReviewing(false);
    setCandidates([]);
    setIsAnalyzing(false);
  };

  // -- Selection Box Logic --
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isReviewing) return;
    setSelectedIds([]);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setSelectionMarquee({ x1: e.clientX - rect.left, y1: e.clientY - rect.top, x2: e.clientX - rect.left, y2: e.clientY - rect.top });
    }
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!selectionMarquee || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      setSelectionMarquee(prev => prev ? { ...prev, x2: e.clientX - rect.left, y2: e.clientY - rect.top } : null);
    };
    const onUp = () => {
      if (selectionMarquee && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const xMin = Math.min(selectionMarquee.x1, selectionMarquee.x2) / rect.width * 100;
        const xMax = Math.max(selectionMarquee.x1, selectionMarquee.x2) / rect.width * 100;
        const yMin = Math.min(selectionMarquee.y1, selectionMarquee.y2) / rect.height * 100;
        const yMax = Math.max(selectionMarquee.y1, selectionMarquee.y2) / rect.height * 100;

        const inside = activeProject.elements
          .filter(el => el.x >= xMin && el.x + el.width <= xMax && el.y >= yMin && el.y + el.height <= yMax)
          .map(el => el.id);
        setSelectedIds(inside);
      }
      setSelectionMarquee(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [selectionMarquee, activeProject.elements]);

  return (
    <div className="flex flex-col h-screen bg-[#f1f5f9] select-none" onContextMenu={handleContextMenu} onClick={() => setContextMenu(null)}>
      {/* Header & Tabs */}
      <header className="h-14 border-b bg-white flex items-center px-4 gap-4 shrink-0 z-30 shadow-sm relative">
        <div className="flex items-center gap-2 pr-4 border-r">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white"><i className="fas fa-cubes"></i></div>
          <span className="font-bold text-slate-800">VisionCraft</span>
        </div>
        
        <div className="flex-1 flex gap-1 overflow-x-auto no-scrollbar">
          {projects.map(p => (
            <div 
              key={p.id} 
              onClick={() => setActiveId(p.id)}
              className={`h-9 px-4 flex items-center gap-2 rounded-t-lg border-x border-t transition-all cursor-pointer text-xs font-medium whitespace-nowrap ${activeId === p.id ? 'bg-white border-slate-200 text-indigo-600' : 'bg-slate-100 border-transparent text-slate-500 hover:bg-slate-200'}`}
            >
              {p.name}
              <i className="fas fa-times hover:text-red-500" onClick={(e) => { e.stopPropagation(); setProjects(prev => prev.filter(pr => pr.id !== p.id)); }}></i>
            </div>
          ))}
          <button 
            onClick={() => {
              const id = Math.random().toString(36);
              setProjects(prev => [...prev, { id, name: 'New Project', image: null, originalImage: null, elements: [], canvasWidth: 800, canvasHeight: 600 }]);
              setActiveId(id);
            }}
            className="h-9 px-3 flex items-center text-slate-400 hover:text-indigo-600 hover:bg-white rounded-t-lg transition-colors"
          ><i className="fas fa-plus"></i></button>
        </div>

        {/* Detect Review Bar Overlay */}
        {isReviewing && (
           <div className="absolute inset-0 bg-green-50 z-40 flex items-center px-6 justify-between border-b border-green-200 animate-slideDown">
             <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                 <i className="fas fa-search-plus"></i>
               </div>
               <div>
                 <p className="text-xs font-bold text-green-800">Reviewing Detected Elements</p>
                 <p className="text-[10px] text-green-600">Select items to add to your project</p>
               </div>
             </div>
             <div className="flex items-center gap-3">
               <span className="text-xs font-medium text-green-700">{selectedCandidateIds.length} selected</span>
               <button onClick={() => { setIsReviewing(false); setCandidates([]); }} className="px-4 py-1.5 bg-white border border-green-200 text-green-700 rounded text-xs font-bold hover:bg-green-50">Cancel</button>
               <button onClick={applyCandidates} className="px-4 py-1.5 bg-green-600 text-white rounded text-xs font-bold hover:bg-green-700 shadow-sm">Apply Changes</button>
             </div>
           </div>
        )}

        {!isReviewing && (
          <div className="flex gap-2">
            <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded text-xs font-bold hover:bg-indigo-100"><i className="fas fa-file-import mr-2"></i>New UI</button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <aside className="w-72 border-r bg-white p-5 flex flex-col gap-6 overflow-y-auto z-20 shrink-0">
          
          {isReviewing ? (
             <div className="space-y-4">
                <h3 className="text-[10px] font-bold text-green-600 uppercase tracking-widest flex items-center gap-2">
                  <i className="fas fa-list-ul"></i> Candidates Found
                </h3>
                <div className="space-y-1">
                  {candidates.map(c => (
                    <div 
                      key={c.id} 
                      onClick={() => toggleCandidate(c.id)}
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer text-xs ${selectedCandidateIds.includes(c.id) ? 'bg-green-50 text-green-800 font-medium' : 'hover:bg-slate-50 text-slate-500'}`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedCandidateIds.includes(c.id) ? 'bg-green-500 border-green-500' : 'border-slate-300'}`}>
                        {selectedCandidateIds.includes(c.id) && <i className="fas fa-check text-white text-[9px]"></i>}
                      </div>
                      <span>{c.label} ({c.type})</span>
                    </div>
                  ))}
                </div>
             </div>
          ) : (
            <>
              <div className="space-y-4">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI Designer</h3>
                <div className="relative group">
                  <textarea 
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder={selectedIds.length > 0 ? `Modify ${selectedIds.length} selected items...` : "Prompt AI to design..."}
                    className="w-full h-28 p-3 bg-slate-50 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all"
                  />
                  <button 
                    onClick={() => handleAiAction('prompt')}
                    disabled={isAnalyzing}
                    className="absolute bottom-3 right-3 w-8 h-8 bg-indigo-600 text-white rounded-lg shadow-md hover:scale-105 transition-transform disabled:bg-slate-200"
                  ><i className={`fas ${isAnalyzing ? 'fa-spinner fa-spin' : 'fa-magic'}`}></i></button>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Smart Toolbox</h3>
                <div className="grid grid-cols-1 gap-2">
                  <button onClick={() => mergeInputRef.current?.click()} className="text-left p-3 rounded-lg border hover:bg-slate-50 transition-colors flex items-center gap-3">
                    <i className="fas fa-object-group text-blue-500"></i>
                    <div><p className="text-xs font-bold">Merge Layouts</p><p className="text-[9px] text-slate-400 leading-tight">Combine two designs into one</p></div>
                  </button>
                  <input type="file" ref={mergeInputRef} onChange={handleMergeUpload} className="hidden" />
                  
                  <button onClick={() => handleAiAction('optimize_space')} className="text-left p-3 rounded-lg border hover:bg-slate-50 transition-colors flex items-center gap-3">
                    <i className="fas fa-expand-arrows-alt text-green-500"></i>
                    <div><p className="text-xs font-bold">Optimize Space</p><p className="text-[9px] text-slate-400 leading-tight">Fix gaps and overlaps</p></div>
                  </button>

                  <button onClick={() => handleAiAction('modernize')} className="text-left p-3 rounded-lg border hover:bg-slate-50 transition-colors flex items-center gap-3">
                    <i className="fas fa-sparkles text-amber-500"></i>
                    <div><p className="text-xs font-bold">Modernize UI</p><p className="text-[9px] text-slate-400 leading-tight">2025 style refinement</p></div>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Theme & Audience</h3>
                <select 
                  onChange={(e) => handleAiAction('theme', { theme: e.target.value })}
                  className="w-full p-2 bg-slate-50 border rounded text-xs font-medium"
                >
                  <option value="">Apply Theme...</option>
                  <option value="Professional & Clean">Professional</option>
                  <option value="High-End Luxury">Luxury</option>
                  <option value="Creative & Artistic">Artistic</option>
                  <option value="Futuristic Tech">Technological</option>
                </select>
              </div>

              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Palettes</h3>
                  <button onClick={() => AiService.getColorPalette("Modern UI").then(setPalette)} className="text-[9px] text-indigo-600 font-bold">New</button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {palette.map((c, i) => (
                    <div 
                      key={i} 
                      className="w-6 h-6 rounded-full border cursor-pointer hover:scale-125 transition-transform" 
                      style={{ backgroundColor: c }}
                      onClick={() => {
                        const mapped = activeProject.elements.map((el, idx) => ({ ...el, color: palette[idx % palette.length] }));
                        updateElements(mapped);
                      }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>

        {/* CANVAS */}
        <main className="flex-1 relative overflow-auto canvas-bg p-20 flex flex-col items-center">
          <div className="relative" onMouseDown={handleCanvasMouseDown}>
            <div 
              ref={canvasRef}
              className="bg-white shadow-2xl relative transition-transform duration-200"
              style={{ 
                width: activeProject.canvasWidth, 
                height: activeProject.canvasHeight, 
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'top center'
              }}
            >
              {activeProject.image && (
                <img src={activeProject.image} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
              )}
              
              {/* Render Existing Elements */}
              {activeProject.elements.map(el => (
                <DraggableElement 
                  key={el.id}
                  element={el}
                  isSelected={selectedIds.includes(el.id)}
                  onSelect={onElementSelect}
                  onUpdate={updateElement}
                  containerRef={canvasRef}
                  isDraggingGroup={selectedIds.length > 1}
                />
              ))}

              {/* Render Candidate Elements (Review Mode) */}
              {isReviewing && candidates.map(el => (
                <DraggableElement 
                  key={el.id}
                  element={el}
                  isSelected={selectedCandidateIds.includes(el.id)}
                  onSelect={() => {}} // Disabled for candidates, handled by toggle
                  onUpdate={() => {}} // Candidates are read-only position-wise
                  containerRef={canvasRef}
                  isDraggingGroup={false}
                  isCandidate={true}
                  onToggleCandidate={toggleCandidate}
                />
              ))}

              {selectionMarquee && (
                <div 
                  className="absolute border-2 border-indigo-400 bg-indigo-500/10 pointer-events-none z-[100]"
                  style={{
                    left: Math.min(selectionMarquee.x1, selectionMarquee.x2),
                    top: Math.min(selectionMarquee.y1, selectionMarquee.y2),
                    width: Math.abs(selectionMarquee.x2 - selectionMarquee.x1),
                    height: Math.abs(selectionMarquee.y2 - selectionMarquee.y1)
                  }}
                />
              )}

              {/* Canvas Resize Handles */}
              <div 
                className="absolute -right-2 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-indigo-300 transition-colors"
                onMouseDown={(e) => {
                  const startX = e.clientX;
                  const startW = activeProject.canvasWidth;
                  const onMove = (me: MouseEvent) => updateProject(activeId, { canvasWidth: startW + (me.clientX - startX) });
                  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                  window.addEventListener('mousemove', onMove);
                  window.addEventListener('mouseup', onUp);
                }}
              />
              <div 
                className="absolute -bottom-2 left-0 right-0 h-2 cursor-ns-resize hover:bg-indigo-300 transition-colors"
                onMouseDown={(e) => {
                  const startY = e.clientY;
                  const startH = activeProject.canvasHeight;
                  const onMove = (me: MouseEvent) => updateProject(activeId, { canvasHeight: startH + (me.clientY - startY) });
                  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                  window.addEventListener('mousemove', onMove);
                  window.addEventListener('mouseup', onUp);
                }}
              />
            </div>
          </div>

          {/* Zoom & Utils */}
          <div className="fixed bottom-8 right-8 flex flex-col gap-2 items-end">
            {selectedIds.length > 0 && (
              <div className="bg-indigo-600 text-white px-3 py-1.5 rounded-full text-[10px] font-bold shadow-lg animate-bounce">
                {selectedIds.length} Items Selected
              </div>
            )}
            <div className="bg-white rounded-lg shadow-xl border flex items-center p-1">
              <button onClick={() => setZoom(z => Math.max(25, z-10))} className="p-2 hover:bg-slate-50 text-slate-400"><i className="fas fa-minus text-[10px]"></i></button>
              <span className="px-3 text-xs font-bold w-12 text-center text-slate-600">{zoom}%</span>
              <button onClick={() => setZoom(z => Math.min(300, z+10))} className="p-2 hover:bg-slate-50 text-slate-400"><i className="fas fa-plus text-[10px]"></i></button>
            </div>
          </div>
        </main>
      </div>

      {/* Context Menu */}
      {contextMenu?.visible && (
        <div className="fixed bg-white shadow-2xl border rounded-lg py-1 w-48 z-[500]" style={{ left: contextMenu.x, top: contextMenu.y }}>
          {selectedIds.length === 1 && (
            <button onClick={() => handleAction('deconstruct')} className="w-full text-left px-4 py-2 text-xs hover:bg-indigo-50 flex items-center gap-3 text-indigo-600 font-semibold border-b border-slate-100">
              <i className="fas fa-puzzle-piece"></i> Deconstruct Item
            </button>
          )}
          <button onClick={() => handleAction('detect')} className="w-full text-left px-4 py-2 text-xs hover:bg-indigo-50 flex items-center gap-3 text-indigo-600 font-semibold border-b border-slate-100">
             <i className="fas fa-eye"></i> Detect Missing
          </button>
          
          <button onClick={() => handleAction('copy')} className="w-full text-left px-4 py-2 text-xs hover:bg-indigo-50 flex items-center gap-3 mt-1"><i className="fas fa-copy text-slate-400"></i> Copy</button>
          <button onClick={() => handleAction('duplicate')} className="w-full text-left px-4 py-2 text-xs hover:bg-indigo-50 flex items-center gap-3"><i className="fas fa-clone text-slate-400"></i> Duplicate</button>
          <button onClick={() => handleAction('cut')} className="w-full text-left px-4 py-2 text-xs hover:bg-indigo-50 flex items-center gap-3"><i className="fas fa-cut text-slate-400"></i> Cut</button>
          <button onClick={() => handleAction('paste')} className={`w-full text-left px-4 py-2 text-xs hover:bg-indigo-50 flex items-center gap-3 ${clipboard.length === 0 ? 'opacity-30 cursor-not-allowed' : ''}`} disabled={clipboard.length === 0}><i className="fas fa-paste text-slate-400"></i> Paste</button>
          <div className="h-px bg-slate-100 my-1"></div>
          <button onClick={() => handleAction('delete')} className="w-full text-left px-4 py-2 text-xs hover:bg-red-50 text-red-500 flex items-center gap-3"><i className="fas fa-trash-alt"></i> Delete</button>
        </div>
      )}

      {isAnalyzing && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center z-[1000] text-white">
          <div className="w-16 h-16 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="font-bold text-lg animate-pulse tracking-tight">AI Optimizing Design...</p>
        </div>
      )}
    </div>
  );
};

export default App;
