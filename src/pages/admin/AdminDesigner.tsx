import { useState, useRef, useEffect, MouseEvent as ReactMouseEvent } from 'react';
import { Download, Upload, Image as ImageIcon, Type, Save, QrCode, Trash2, ArrowLeft, RefreshCw, ZoomIn, ZoomOut, Maximize, Lock, Unlock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as fabric from 'fabric';
import toast from 'react-hot-toast';

interface DesignSettings {
  backgroundUrl: string | null;
  backgroundColor: string;
  elements: any[]; // Fabric JSON elements
}

export default function AdminDesigner() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fbCanvas, setFbCanvas] = useState<fabric.Canvas | null>(null);
  const [zoom, setZoom] = useState(1);
  const [activeObject, setActiveObject] = useState<fabric.Object | null>(null);

  // ISO PVC Card Aspect Ratio (85.6mm x 53.98mm = 1.5857)
  const CARD_WIDTH = 1000;
  const CARD_HEIGHT = 630;

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
    });

    setFbCanvas(canvas);

    const handleSelection = () => setActiveObject(canvas.getActiveObject());
    const handleClear = () => setActiveObject(null);

    canvas.on('selection:created', handleSelection);
    canvas.on('selection:updated', handleSelection);
    canvas.on('selection:cleared', handleClear);

    // Initial scale to fit container
    const fitToContainer = () => {
      if (!containerRef.current) return;
      const containerW = containerRef.current.clientWidth - 40;
      const scale = Math.min(1, containerW / CARD_WIDTH);
      setZoom(scale);
      document.querySelector('.canvas-container')?.setAttribute('style', `transform: scale(${scale}); transform-origin: top left;`);
    };

    fitToContainer();
    window.addEventListener('resize', fitToContainer);

    return () => {
      window.removeEventListener('resize', fitToContainer);
      canvas.dispose();
    };
  }, []);

  const addText = (text: string, templateKey?: string) => {
    if (!fbCanvas) return;
    const textObj = new fabric.IText(text, {
      left: CARD_WIDTH / 2 - 100,
      top: CARD_HEIGHT / 2 - 20,
      fontFamily: 'sans-serif',
      fontSize: 40,
      fill: '#000000',
      fontWeight: 'bold',
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 2, offsetX: 1, offsetY: 1 }),
    });
    if (templateKey) {
      // @ts-ignore
      textObj.set('templateKey', templateKey);
    }
    fbCanvas.add(textObj);
    fbCanvas.setActiveObject(textObj);
    fbCanvas.renderAll();
  };

  const addQRCode = () => {
    if (!fbCanvas) return;
    fabric.FabricImage.fromURL('https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=MARKET-CASH-QR-PREVIEW').then((img) => {
      img.set({
        left: CARD_WIDTH - 200,
        top: CARD_HEIGHT - 200,
        scaleX: 0.5,
        scaleY: 0.5,
      });
      // @ts-ignore
      img.set('templateKey', 'qrcode');
      fbCanvas.add(img);
      fbCanvas.setActiveObject(img);
      fbCanvas.renderAll();
    });
  };

  const handleUploadBackground = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !fbCanvas) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      if (!event.target?.result) return;
      fabric.FabricImage.fromURL(event.target.result as string).then((img) => {
        // scale image to fit canvas exactly
        img.scaleToWidth(CARD_WIDTH);
        img.scaleToHeight(CARD_HEIGHT);
        fbCanvas.backgroundImage = img;
        fbCanvas.renderAll();
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const deleteSelected = () => {
    if (!fbCanvas || !activeObject) return;
    fbCanvas.remove(activeObject);
    fbCanvas.discardActiveObject();
    setActiveObject(null);
  };

  const saveDesign = () => {
    if (!fbCanvas) return;
    const json = fbCanvas.toObject(['templateKey']);
    // TODO: Save this JSON to Firestore global settings
    localStorage.setItem('market_cash_card_design', JSON.stringify(json));
    toast.success('Design sauvegardé avec succès !');
  };

  const changeColor = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!fbCanvas || !activeObject) return;
    activeObject.set('fill', e.target.value);
    fbCanvas.renderAll();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto h-[calc(100vh-100px)] flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 to-indigo-950 p-6 rounded-[2rem] text-white shadow-xl shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition cursor-pointer">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
              <ImageIcon size={28} className="text-pink-400" />
              Designer de Cartes
            </h1>
            <p className="text-sm text-slate-300">Créez le visuel des cartes virtuelles et physiques.</p>
          </div>
        </div>
        <button onClick={saveDesign} className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white font-black py-3 px-6 rounded-xl flex items-center gap-2 shadow-lg shadow-pink-500/25 transition transform hover:scale-105 cursor-pointer">
          <Save size={18} />
          <span>Sauvegarder le design</span>
        </button>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0">
        {/* LEFT TOOLBAR */}
        <div className="w-full md:w-64 shrink-0 bg-white border border-slate-200 rounded-[2rem] p-5 shadow-sm overflow-y-auto space-y-6">
          
          <div className="space-y-3">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Arrière-plan</h3>
            <div 
              onClick={() => document.getElementById('bg-upload')?.click()}
              className="w-full bg-slate-50 border-2 border-slate-200 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-pink-400 hover:bg-pink-50 transition text-slate-600 hover:text-pink-600"
            >
              <Upload size={20} />
              <span className="text-xs font-bold text-center">Importer une image</span>
              <input id="bg-upload" type="file" accept="image/*" className="hidden" onChange={handleUploadBackground} />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Éléments Dynamiques</h3>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => addText('Numéro Carte', 'cardNumber')} className="p-3 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-xl font-bold text-xs flex flex-col items-center gap-1 transition shadow-sm border border-slate-200 hover:border-indigo-200">
                <Type size={16} />
                <span>N° Carte</span>
              </button>
              <button onClick={() => addText('Nom du Titulaire', 'cardName')} className="p-3 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-xl font-bold text-xs flex flex-col items-center gap-1 transition shadow-sm border border-slate-200 hover:border-indigo-200">
                <Type size={16} />
                <span>Nom</span>
              </button>
              <button onClick={addQRCode} className="p-3 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-xl font-bold text-xs flex flex-col items-center gap-1 transition shadow-sm border border-slate-200 hover:border-indigo-200 col-span-2">
                <QrCode size={16} />
                <span>QR Code Dynamique</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Texte Libre</h3>
            <button onClick={() => addText('Texte Personnalisé')} className="w-full p-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition shadow-sm border border-slate-200">
              <Type size={16} />
              <span>Ajouter un texte</span>
            </button>
          </div>
        </div>

        {/* CANVAS WORKSPACE */}
        <div className="flex-1 bg-slate-100/50 border border-slate-200 rounded-[2rem] overflow-hidden flex flex-col shadow-inner relative">
          
          {/* Top Actions */}
          <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
             <div className="flex items-center gap-3">
               <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Espace de travail</span>
             </div>
             {activeObject && (
               <div className="flex items-center gap-3">
                  {activeObject.type === 'i-text' && (
                    <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                      <span className="text-xs font-bold text-slate-500">Couleur</span>
                      <input 
                        type="color" 
                        value={(activeObject.get('fill') as string) || '#000000'}
                        onChange={changeColor}
                        className="w-6 h-6 rounded cursor-pointer border-none p-0"
                      />
                    </div>
                  )}
                  <button onClick={deleteSelected} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-bold text-xs transition border border-red-200">
                    <Trash2 size={14} /> Supprimer
                  </button>
               </div>
             )}
          </div>

          {/* Canvas Container */}
          <div ref={containerRef} className="flex-1 overflow-auto p-4 sm:p-8 flex items-center justify-center bg-[#E5E7EB] bg-[linear-gradient(45deg,#d1d5db_25%,transparent_25%,transparent_75%,#d1d5db_75%,#d1d5db_100%),linear-gradient(45deg,#d1d5db_25%,transparent_25%,transparent_75%,#d1d5db_75%,#d1d5db_100%)] bg-[length:20px_20px] bg-[position:0_0,10px_10px]">
            {/* The absolute positioning handles scaling centering via CSS if needed, but fabric handles it on the canvas element. We use transform for zoom. */}
            <div className="shadow-2xl bg-white relative transition-transform" style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}>
              <canvas ref={canvasRef} />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
