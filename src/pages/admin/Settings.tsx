/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/authStore';
import { cardService } from '../../services/cardService';
import { CardDesignSettings, UserCard } from '../../types';
import MarketCashCard from '../../components/MarketCashCard';
import toast from 'react-hot-toast';
import { 
  Palette, 
  Upload, 
  RotateCcw, 
  Save, 
  Image as ImageIcon, 
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  Info,
  Layers,
  ShieldAlert
} from 'lucide-react';

const MOCK_PREVIEW_CARD: Partial<UserCard> = {
  cardId: 'MC-DEMO-001',
  cardIdentifier: 'MC-DEMO-001',
  cardNumber: '0000000000000000',
  cardHolder: 'CLIENT EXEMPLE',
  cardHolderName: 'CLIENT EXEMPLE',
  validFrom: '12/28',
  validUntil: '12/29',
  expiryStart: '12/28',
  expiryEnd: '12/29',
  expiry: '12/28 — 12/29',
  cvv: '123',
  rechargeNumber: '0000000000',
  qrData: 'MC:MC-DEMO-001:0000000000000000',
  network: 'visa',
  type: 'physical',
  status: 'active'
};

export default function AdminSettings() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'card_design' | 'general'>('card_design');
  
  // Card design states
  const [currentDesign, setCurrentDesign] = useState<CardDesignSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewBackgroundUrl, setPreviewBackgroundUrl] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to Firestore card design settings
  useEffect(() => {
    setLoading(true);
    const unsubscribe = cardService.subscribeCardDesign((design) => {
      setCurrentDesign(design);
      if (design && design.backgroundUrl) {
        setPreviewBackgroundUrl(design.backgroundUrl);
      } else {
        setPreviewBackgroundUrl('');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Veuillez sélectionner un fichier image valide (JPG, PNG, WebP).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      toast.error("L'image ne doit pas dépasser 8 Mo.");
      return;
    }

    setSelectedFile(file);
    const localUrl = URL.createObjectURL(file);
    setPreviewBackgroundUrl(localUrl);
    toast.success('Image chargée dans l’aperçu. Cliquez sur "Enregistrer le design" pour appliquer.');
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleSaveDesign = async () => {
    if (!user || user.role !== 'admin_general') {
      toast.error('Seul un Administrateur Général peut modifier le design de la carte.');
      return;
    }

    try {
      setSaving(true);
      let targetUrl = previewBackgroundUrl;

      // If a new local file was selected, upload it to Firebase Storage
      if (selectedFile) {
        setUploading(true);
        targetUrl = await cardService.uploadCardBackground(selectedFile);
        setUploading(false);
      }

      await cardService.updateCardDesign({
        backgroundUrl: targetUrl,
        userEmail: user.email
      });

      setSelectedFile(null);
      toast.success('Design de carte enregistré et appliqué avec succès à toutes les cartes !');
    } catch (err: any) {
      console.error('[SAVE_CARD_DESIGN_ERROR]', err);
      toast.error(`Erreur lors de l'enregistrement : ${err?.message || 'Erreur inconnue'}`);
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const handleResetToDefault = async () => {
    if (!user || user.role !== 'admin_general') {
      toast.error('Seul un Administrateur Général peut réinitialiser le design.');
      return;
    }

    if (!window.confirm('Voulez-vous vraiment restaurer le fond de carte Market-Cash par défaut ?')) {
      return;
    }

    try {
      setSaving(true);
      await cardService.resetCardDesign(user.email);
      setSelectedFile(null);
      setPreviewBackgroundUrl('');
      toast.success('Fond par défaut Market-Cash rétabli.');
    } catch (err: any) {
      console.error('[RESET_CARD_DESIGN_ERROR]', err);
      toast.error(`Erreur lors de la réinitialisation : ${err?.message || 'Erreur inconnue'}`);
    } finally {
      setSaving(false);
    }
  };

  const isGeneralAdmin = user?.role === 'admin_general';

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-400 text-blue-950 flex items-center justify-center font-black shadow-md">
            <Palette size={24} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Paramètres & Design
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Personnalisation graphique du fond et gestion des calques dynamiques
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl">
          <button
            onClick={() => setActiveTab('card_design')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'card_design'
                ? 'bg-blue-950 text-amber-400 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers size={16} />
            <span>Design de la carte</span>
          </button>
        </div>
      </div>

      {!isGeneralAdmin && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3 text-amber-900 text-xs sm:text-sm">
          <ShieldAlert size={20} className="text-amber-600 shrink-0" />
          <span>
            Mode consultation : seul un compte <strong>Admin Général</strong> est autorisé à enregistrer ou remplacer le fond de carte.
          </span>
        </div>
      )}

      {/* Main Card Design Section */}
      {activeTab === 'card_design' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Real-time Interactive Preview (5 cols) */}
          <div className="lg:col-span-6 flex flex-col space-y-4">
            <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                      Aperçu en Direct (PVC ID-1)
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    Ratio 1.586 : 1
                  </span>
                </div>

                {/* MarketCashCard Preview Component */}
                <div className="w-full max-w-md mx-auto my-2">
                  <MarketCashCard 
                    card={MOCK_PREVIEW_CARD}
                    backgroundUrl={previewBackgroundUrl}
                    mode="preview"
                    isRevealed={true}
                  />
                </div>

                <div className="mt-4 p-3 bg-slate-50 rounded-2xl border border-slate-200/60 text-slate-600 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <Info size={14} className="text-blue-600 shrink-0" />
                    <span>Séparation Architecture Fond & Informations</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    Les données (nom, numéro, validité, QR code) sont générées dynamiquement par-dessus le fond sous forme de calques HTML nets et proportionnels.
                  </p>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-medium">Fond actif :</span>
                  <span className={`font-bold px-2 py-0.5 rounded-md ${
                    previewBackgroundUrl ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {previewBackgroundUrl ? 'Personnalisé (Admin)' : 'Par défaut (Market-Cash)'}
                  </span>
                </div>
                {currentDesign?.version && (
                  <span className="text-slate-400 font-mono text-[11px]">
                    v{currentDesign.version}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Upload & Controls (6 cols) */}
          <div className="lg:col-span-6 flex flex-col space-y-5">
            <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-5">
              <div>
                <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Upload size={18} className="text-amber-500" />
                  <span>Importer un Fond Graphique de Carte</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Importez une illustration ou maquette graphique au ratio standard PVC (85.6mm × 53.98mm). Les informations texte et QR seront automatiquement projetées par-dessus.
                </p>
              </div>

              {/* Hidden File Input */}
              <input 
                type="file"
                ref={fileInputRef}
                accept="image/png,image/jpeg,image/webp,image/jpg"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              {/* Drag & Drop Upload Box */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => isGeneralAdmin && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center min-h-[160px] ${
                  isDragOver 
                    ? 'border-amber-400 bg-amber-50/50 scale-[1.01]' 
                    : 'border-slate-300 hover:border-amber-400 hover:bg-slate-50/80'
                } ${!isGeneralAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-3">
                  <ImageIcon size={24} />
                </div>
                <p className="text-xs sm:text-sm font-bold text-slate-800">
                  {selectedFile ? selectedFile.name : 'Cliquez ou glissez une image ici'}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  JPG, PNG ou WebP haute définition (max 8 Mo)
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSaveDesign}
                  disabled={!isGeneralAdmin || saving || uploading}
                  className="w-full sm:flex-1 py-3.5 px-5 bg-gradient-to-r from-blue-950 to-blue-900 hover:from-blue-900 hover:to-blue-800 active:scale-[0.98] text-amber-400 font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {saving || uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                      <span>Enregistrement en cours...</span>
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      <span>Enregistrer le design</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleResetToDefault}
                  disabled={!isGeneralAdmin || saving || !previewBackgroundUrl}
                  className="w-full sm:w-auto py-3.5 px-4 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 font-bold rounded-2xl transition-all flex items-center justify-center gap-2 text-xs sm:text-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Restaurer le fond Market-Cash par défaut"
                >
                  <RotateCcw size={16} />
                  <span>Fond par défaut</span>
                </button>
              </div>

              {/* Info Details */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 space-y-2 text-xs">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span>Impact de la mise à jour</span>
                </div>
                <p className="text-slate-500 leading-relaxed text-[11px]">
                  Toutes les cartes actives des clients et du catalogue utiliseront instantanément ce nouveau fond sans modifier leurs données (numéro, nom, ID, solde, validité, etc.).
                </p>
                {currentDesign?.updatedAt && (
                  <div className="pt-2 border-t border-slate-200/60 text-[10px] text-slate-400 font-mono">
                    Dernière mise à jour : {new Date(currentDesign.updatedAt).toLocaleString('fr-FR')} {currentDesign.updatedBy && `par ${currentDesign.updatedBy}`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
