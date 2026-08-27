import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  collection, query, where, doc, getDoc, setDoc, onSnapshot 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../../firebase/config';
import { useAuthStore } from '../../store/authStore';
import { UserCard, CardPurchaseRequest, PhysicalCardRequest } from '../../types';
import { removeUndefined } from '../../lib/firestoreUtils';
import toast from 'react-hot-toast';
import { 
  CreditCard, Eye, EyeOff, Plus, X, Clock, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, ShieldCheck, FileCheck, Image as ImageIcon, Truck, Coins, Lock, Fingerprint, Calendar, MapPin, Sparkles, Copy, Check, Info, Trash2, UploadCloud, Smartphone, AlertTriangle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn, formatTimeAgo } from '../../lib/utils';
import MarketCashCard from '../../components/MarketCashCard';

import { cardService, DEFAULT_CARD_PRICING, CardPricingSettings } from '../../services/cardService';
import { PaymentMethodItem } from '../../types';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export default function ClientCards() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [myCards, setMyCards] = useState<UserCard[]>([]);
  const [cardBackgroundUrl, setCardBackgroundUrl] = useState<string>('');
  const [myRequests, setMyRequests] = useState<CardPurchaseRequest[]>([]);
  const [myDeliveryRequests, setMyDeliveryRequests] = useState<PhysicalCardRequest[]>([]);
  
  const [pricing, setPricing] = useState<CardPricingSettings>(DEFAULT_CARD_PRICING);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([]);
  const [pricingUnavailable, setPricingUnavailable] = useState(false);
  
  // Purchase flow: one Market-Cash card with two independent options.
  const [purchaseStep, setPurchaseStep] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [printRequested, setPrintRequested] = useState(false);
  const [urgentProcessing, setUrgentProcessing] = useState(false);
  const [copiedNumber, setCopiedNumber] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  
  // Purchase Modal State
  const [purchaseForm, setPurchaseForm] = useState({
    name: user?.displayName || '',
    phone: user?.phone || '',
    paymentMethod: 'M-Pesa',
    reference: '',
    note: ''
  });
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [identityFile, setIdentityFile] = useState<File | null>(null);
  const [identityPreviewUrl, setIdentityPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const physicalOption: 'none' | 'normal' | 'urgent' = urgentProcessing
    ? 'urgent'
    : printRequested ? 'normal' : 'none';
  const hasRequiredPrices = pricing.cardPrice !== null
    && (!printRequested || pricing.printingPrice !== null)
    && (!urgentProcessing || pricing.urgencyFee !== null);
  const actualPrice = hasRequiredPrices
    ? (pricing.cardPrice || 0)
      + (printRequested ? (pricing.printingPrice || 0) : 0)
      + (urgentProcessing ? (pricing.urgencyFee || 0) : 0)
    : null;

  // Cards Reveal Security State
  const [revealedCards, setRevealedCards] = useState<Record<string, boolean>>({});
  const [pendingCardToReveal, setPendingCardToReveal] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);

  // Physical Card Delivery Order Modal State
  const [cardForDelivery, setCardForDelivery] = useState<UserCard | null>(null);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [deliveryLandmark, setDeliveryLandmark] = useState('');
  const [submittingDelivery, setSubmittingDelivery] = useState(false);

  // Recharge Screen State
  const [cardForRecharge, setCardForRecharge] = useState<UserCard | null>(null);
  const [copiedRecharge, setCopiedRecharge] = useState(false);

  // Sync user details to form when user loads
  useEffect(() => {
    if (user) {
      setPurchaseForm(prev => ({
        ...prev,
        name: prev.name || user.displayName || '',
        phone: prev.phone || user.phone || ''
      }));
      setDeliveryPhone(prev => prev || user.phone || '');
    }
  }, [user]);

  // Clean up object preview URLs.
  useEffect(() => {
    return () => {
      if (proofPreviewUrl) {
        URL.revokeObjectURL(proofPreviewUrl);
      }
      if (identityPreviewUrl) {
        URL.revokeObjectURL(identityPreviewUrl);
      }
    };
  }, [proofPreviewUrl, identityPreviewUrl]);

  useEffect(() => {
    if (!user) return;

    // 1. Real-time listener for user's cards
    const userCardsRef = query(collection(db, 'cards'), where('userId', '==', user.uid));
    const unsubscribeCards = onSnapshot(userCardsRef, (snap) => {
      const loadedMyCards = snap.docs.map(d => ({ ...d.data(), cardId: d.id, id: d.id } as UserCard));
      setMyCards(loadedMyCards);
    }, (err) => {
      console.error('[CARDS_LISTENER_ERROR]', err);
    });

    // 2. Real-time listener for card purchase requests
    const requestsQuery = query(
      collection(db, 'card_purchase_requests'),
      where('userId', '==', user.uid)
    );
    const unsubscribeRequests = onSnapshot(requestsQuery, (snap) => {
      const loadedRequests = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as CardPurchaseRequest))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setMyRequests(loadedRequests);
      setLoading(false);
    }, (err) => {
      console.error('[REQUESTS_LISTENER_ERROR]', err);
      setLoading(false);
    });

    // 3. Real-time listener for physical card delivery requests
    const deliveryQuery = query(
      collection(db, 'physical_card_requests'),
      where('userId', '==', user.uid)
    );
    const unsubscribeDeliveries = onSnapshot(deliveryQuery, (snap) => {
      const loadedDeliveries = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as PhysicalCardRequest))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setMyDeliveryRequests(loadedDeliveries);
    }, (err) => {
      console.error('[DELIVERY_REQUESTS_LISTENER_ERROR]', err);
    });

    // 4. Real-time listener for administrable card design
    const unsubscribeCardDesign = cardService.subscribeCardDesign((design) => {
      if (design && design.backgroundUrl) {
        setCardBackgroundUrl(design.backgroundUrl);
      } else {
        setCardBackgroundUrl('');
      }
    });

    // 5. Real-time listener for payment methods
    const unsubscribePaymentMethods = cardService.subscribePaymentMethods((methods) => {
      setPaymentMethods(methods.filter(m => m.active));
    });

    // 6. Real-time listener for pricing
    const unsubscribePricing = cardService.subscribePricing((p) => {
      setPricing(p);
      setPricingUnavailable(p.cardPrice === null);
    });

    return () => {
      unsubscribeCards();
      unsubscribeRequests();
      unsubscribeDeliveries();
      unsubscribeCardDesign();
      unsubscribePaymentMethods();
      unsubscribePricing();
    };
  }, [user?.uid]);

  // Handle URL param for auto-opening delivery modal from notifications
  useEffect(() => {
    const isDeliveryAction = searchParams.get('delivery') === 'true';
    const cardIdParam = searchParams.get('cardId');
    if (isDeliveryAction && cardIdParam && myCards.length > 0) {
      const targetCard = myCards.find(c => c.id === cardIdParam || c.cardId === cardIdParam || c.cardIdentifier === cardIdParam);
      if (targetCard) {
        setCardForDelivery(targetCard);
        setDeliveryDate('');
        setDeliveryAddress('');
        setDeliveryPhone(user?.phone || '');
        setDeliveryLandmark('');
        console.log('[DELIVERY_MODAL_OPEN]', {
          cardId: targetCard.cardId || targetCard.id || targetCard.cardIdentifier || '',
          userId: user?.uid || ''
        });
        // Clear params to avoid reopen on reload
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('delivery');
        newParams.delete('cardId');
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [searchParams, myCards, setSearchParams]);

  // Card Formatters
  const formatCardNumber = (rawNum: string, isRevealed: boolean) => {
    const clean = (rawNum || '').replace(/\s+/g, '');
    if (!isRevealed) {
      const last4 = clean.slice(-4) || '••••';
      return `•••• •••• •••• ${last4}`;
    }
    return clean.replace(/(\d{4})(?=\d)/g, '$1 ') || '•••• •••• •••• ••••';
  };

  const formatRechargeNumber = (rechargeNum: string | undefined, isRevealed: boolean) => {
    if (!isRevealed) {
      return '•••• •••• ••••';
    }
    return rechargeNum || 'Non renseigné';
  };

  const formatCardHolder = (card: UserCard, isRevealed: boolean) => {
    const name = card.cardHolder || card.cardHolderName || user?.displayName || 'Titulaire';
    if (!isRevealed) {
      const parts = name.split(' ');
      return parts.map(p => p ? p.charAt(0) + '•'.repeat(Math.max(2, p.length - 1)) : '').join(' ');
    }
    return name;
  };

  const formatExpiry = (card: UserCard, isRevealed: boolean) => {
    if (!isRevealed) {
      return '••/•• - ••/••';
    }
    const start = card.expiryStart || '02/27';
    const end = card.expiryEnd || card.expiry || '08/27';
    return `${start} - ${end}`;
  };

  const formatCVV = (card: UserCard, isRevealed: boolean) => {
    if (!isRevealed) {
      return '•••';
    }
    return card.cvv || '•••';
  };

  const getMarketCashCardId = (card: UserCard, index: number) => {
    if (card.cardIdentifier) return card.cardIdentifier;
    const dateObj = card.createdAt ? new Date(card.createdAt) : new Date();
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const order = String(index + 1).padStart(3, '0');
    return `MC-${order}${year}${month}${day}`;
  };

  // Biometrics & PIN Verification Logic for Eye Button
  const handleToggleCardReveal = async (cardId: string) => {
    if (revealedCards[cardId]) {
      setRevealedCards(prev => ({ ...prev, [cardId]: false }));
      return;
    }

    if (user?.useBiometrics) {
      try {
        let biometricSucceeded = false;
        if (window.PublicKeyCredential) {
          const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false);
          if (available) {
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            const assertion = await navigator.credentials.get({
              publicKey: {
                challenge,
                timeout: 30000,
                userVerification: 'preferred',
                rpId: window.location.hostname
              }
            }).catch((e) => {
              console.log('[BIOMETRIC_CHECK_FALLBACK]', e);
              return null;
            });

            if (assertion) {
              biometricSucceeded = true;
            }
          }
        }

        if (biometricSucceeded) {
          setRevealedCards(prev => ({ ...prev, [cardId]: true }));
          toast.success('Empreinte biométrique validée.', { icon: '🔐' });
          return;
        }
      } catch (err) {
        console.log('[BIOMETRICS_FAILED_FALLBACK_TO_PIN]', err);
      }
    }

    setPendingCardToReveal(cardId);
    setPinInput('');
  };

  const handleVerifyPinAndReveal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingCardToReveal || !user) return;

    if (pinInput.length < 4) {
      toast.error('Le code PIN doit comporter 4 à 6 chiffres.');
      return;
    }

    setVerifyingPin(true);
    try {
      const encoded = new TextEncoder().encode(pinInput);
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const enteredHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      if (user.pinHash === enteredHash || !user.pinHash) {
        setRevealedCards(prev => ({ ...prev, [pendingCardToReveal]: true }));
        toast.success('Informations de la carte affichées en clair.', { icon: '🔓' });
        setPendingCardToReveal(null);
        setPinInput('');
      } else {
        toast.error('Code PIN incorrect.');
        setPinInput('');
      }
    } catch (error) {
      console.error('[PIN_VERIFY_ERROR]', error);
      toast.error('Erreur lors de la validation du code PIN.');
    } finally {
      setVerifyingPin(false);
    }
  };

  const openDeliveryModal = (card: UserCard) => {
    const cardId = card.cardId || card.id || card.cardIdentifier || '';
    setCardForDelivery(card);
    setDeliveryDate('');
    setDeliveryAddress('');
    setDeliveryPhone(user?.phone || '');
    setDeliveryLandmark('');
    console.log('[DELIVERY_MODAL_OPEN]', { cardId, userId: user?.uid || '' });
  };

  const closeDeliveryModal = () => {
    setCardForDelivery(null);
    setDeliveryDate('');
    setDeliveryAddress('');
    setDeliveryPhone('');
    setDeliveryLandmark('');
  };

  // Physical Card Delivery Request Submit
  const handlePhysicalDeliverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardForDelivery || !user) return;

    const cardIdentifier = 
      cardForDelivery.cardIdentifier || 
      cardForDelivery.cardId || 
      cardForDelivery.id || 
      null;

    const cardId = 
      cardForDelivery.id || 
      cardForDelivery.cardId || 
      cardForDelivery.cardIdentifier || 
      null;

    console.log('[DELIVERY_FORM_VALIDATE]', {
      hasAddress: deliveryAddress.trim().length >= 5,
      hasWhatsapp: deliveryPhone.trim().length >= 5,
      hasDate: Boolean(deliveryDate),
      hasLocation: Boolean(deliveryLandmark.trim())
    });

    if (!cardId || !cardIdentifier) {
      toast.error("Impossible d'identifier la carte sélectionnée.");
      return;
    }

    if (!deliveryDate) {
      toast.error('Veuillez sélectionner une date de livraison souhaitée.');
      return;
    }

    if (!deliveryPhone.trim() || deliveryPhone.trim().length < 5) {
      toast.error('Veuillez renseigner un numéro WhatsApp valide pour la livraison.');
      return;
    }

    if (!deliveryAddress.trim() || deliveryAddress.trim().length < 5) {
      toast.error('Veuillez renseigner une adresse complète de livraison valide.');
      return;
    }

    console.log('[DELIVERY_REQUEST_START]', {
      cardId,
      cardIdentifier,
      userId: user.uid
    });

    setSubmittingDelivery(true);
    try {
      await cardService.submitDeliveryRequest({
        cardId,
        cardIdentifier,
        cardHolder: cardForDelivery.cardHolder || user.displayName || 'Client',
        userId: user.uid,
        userName: user.displayName || cardForDelivery.cardHolder || 'Client',
        userEmail: user.email || '',
        userPhone: deliveryPhone.trim(),
        whatsapp: deliveryPhone.trim(),
        deliveryDate: deliveryDate,
        deliveryAddress: deliveryAddress.trim(),
        deliveryNote: deliveryLandmark.trim() || undefined
      });

      toast.success('Demande de livraison envoyée avec succès ! Nos livreurs et administrateurs ont été notifiés.');
      closeDeliveryModal();
    } catch (error: any) {
      console.error('[DELIVERY_REQUEST_ERROR]', {
        code: error?.code || 'unknown',
        message: error?.message || 'Erreur inconnue'
      });
      toast.error("Impossible d'envoyer la demande pour le moment. Vérifiez les informations de livraison et réessayez.");
    } finally {
      setSubmittingDelivery(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setProofFile(null);
      if (proofPreviewUrl) {
        URL.revokeObjectURL(proofPreviewUrl);
        setProofPreviewUrl(null);
      }
      return;
    }

    const isAllowedType = ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase());

    if (!isAllowedType) {
      toast.error('Format MIME non supporté. Veuillez sélectionner une image JPEG/JPG, PNG ou WebP valide.');
      e.target.value = '';
      setProofFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(`Le fichier est trop volumineux (${(file.size / (1024 * 1024)).toFixed(1)} MB). Taille maximale autorisée : 5 MB.`);
      e.target.value = '';
      setProofFile(null);
      return;
    }

    setProofFile(file);
    if (proofPreviewUrl) {
      URL.revokeObjectURL(proofPreviewUrl);
    }
    const preview = URL.createObjectURL(file);
    setProofPreviewUrl(preview);
  };

  const handleIdentityFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
      toast.error("Pièce d'identité refusée : utilisez une image JPEG/JPG, PNG ou WebP valide.");
      e.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("La pièce d'identité dépasse la taille maximale de 5 Mo.");
      e.target.value = '';
      return;
    }
    if (identityPreviewUrl) URL.revokeObjectURL(identityPreviewUrl);
    setIdentityFile(file);
    setIdentityPreviewUrl(URL.createObjectURL(file));
  };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !auth.currentUser) {
      toast.error('Session expirée ou utilisateur non authentifié. Veuillez vous reconnecter.');
      return;
    }

    if (actualPrice === null || actualPrice <= 0 || !Number.isFinite(actualPrice)) {
      toast.error("Cette carte n'est momentanément pas disponible à l'achat car son tarif n'est pas configuré. Veuillez contacter l'équipe.");
      return;
    }

    if (myCards.length >= 4) {
      toast.error("Vous avez atteint la limite maximale de 4 cartes.");
      return;
    }

    const fullName = purchaseForm.name.trim();
    if (!fullName) {
      toast.error('Le nom complet est obligatoire.');
      return;
    }

    const phone = purchaseForm.phone.trim();
    if (!phone) {
      toast.error('Le numéro de téléphone est obligatoire.');
      return;
    }

    

    

    if (!urgentProcessing && !identityFile) {
      toast.error("Une pièce d'identité est obligatoire pour le traitement normal.");
      return;
    }

    if (!proofFile) {
      toast.error('La preuve de paiement (capture d\'écran) est obligatoire.');
      return;
    }

    setIsSubmitting(true);
    let uploadedDownloadUrl: string | null = null;
    let identityDownloadUrl: string | null = null;
    const currentUid = auth.currentUser.uid;
    const timestamp = Date.now();
    const cleanFileName = proofFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `payment-proofs/${currentUid}/${timestamp}_${cleanFileName}`;

    try {
      if (!urgentProcessing && identityFile) {
        const cleanIdentityName = identityFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const identityRef = ref(storage, `identity-proofs/${currentUid}/${timestamp}_${cleanIdentityName}`);
        await uploadBytes(identityRef, identityFile, {
          contentType: identityFile.type,
          customMetadata: { userId: currentUid, uploadedAt: new Date().toISOString() }
        });
        identityDownloadUrl = await getDownloadURL(identityRef);
      }

      const proofRef = ref(storage, storagePath);
      const metadata = {
        contentType: proofFile.type || 'image/jpeg',
        customMetadata: {
          userId: currentUid,
          uploadedAt: new Date().toISOString(),
          originalName: proofFile.name
        }
      };

      try {
        await uploadBytes(proofRef, proofFile, metadata);
      } catch (storageError: any) {
        console.error('[STORAGE_UPLOAD_ERROR]', storageError);
        toast.error(`Échec de l'upload de la preuve : ${storageError?.message || storageError?.code || 'Erreur inconnue'}`);
        return;
      }

      uploadedDownloadUrl = await getDownloadURL(proofRef);
      if (!uploadedDownloadUrl) {
        toast.error("Erreur : l'URL de la preuve de paiement est introuvable.");
        return;
      }

      const requestId = doc(collection(db, 'card_purchase_requests')).id;
      const optionLabels = [printRequested ? 'Impression physique' : '', urgentProcessing ? 'Traitement urgent' : ''].filter(Boolean);
      const cardTitle = `Carte Market-Cash${optionLabels.length ? ` + ${optionLabels.join(' + ')}` : ''}`;
      const cleanNote = purchaseForm.note.trim();

      const rawRequestPayload: Partial<CardPurchaseRequest> = {
        id: requestId,
        userId: currentUid,
        fullName: fullName,
        userName: fullName,
        userEmail: auth.currentUser.email || user.email || '',
        phone: phone,
        userPhone: phone,
        cardType: 'virtual',
        physicalOption: physicalOption,
        printRequested,
        urgentProcessing,
        isUrgent: urgentProcessing,
        identityRequired: !urgentProcessing,
        identityProofUrl: identityDownloadUrl || undefined,
        identityProofFileName: identityFile?.name || undefined,
        identityVerified: false,
        pricingBreakdown: {
          cardPrice: pricing.cardPrice || 0,
          printingPrice: printRequested ? (pricing.printingPrice || 0) : 0,
          urgencyFee: urgentProcessing ? (pricing.urgencyFee || 0) : 0
        },
        cardName: cardTitle,
        amount: actualPrice,
        currency: pricing.currency || 'USD',
        paymentMethod: 'Non spécifié',
        transactionReference: 'Non spécifié',
        paymentReference: 'Non spécifié',
        proofUrl: uploadedDownloadUrl,
        paymentProofUrl: uploadedDownloadUrl,
        proofFileName: proofFile.name,
        note: cleanNote ? cleanNote : '',
        clientNote: cleanNote ? cleanNote : '',
        agencyId: user.agencyId || undefined,
        agencyName: user.agencyName || undefined,
        status: 'pending',
        createdAt: timestamp,
        updatedAt: timestamp
      };

      console.log("[PURCHASE_REQUEST_DATA_READY]", {
        requestId,
        userId: currentUid,
        cardType: 'virtual',
        printRequested,
        urgentProcessing,
        identityRequired: !urgentProcessing,
        hasNote: Boolean(cleanNote),
        hasAgencyId: Boolean(user.agencyId),
        hasCardIdentifier: false
      });

      const requestPayload = removeUndefined(rawRequestPayload);

      await setDoc(doc(db, 'card_purchase_requests', requestId), requestPayload);

      toast.success('Demande enregistrée avec succès !');
      setPurchaseStep(5);
      setProofFile(null);
      if (proofPreviewUrl) {
        URL.revokeObjectURL(proofPreviewUrl);
        setProofPreviewUrl(null);
      }
      setPurchaseForm(prev => ({ ...prev, reference: '', note: '' }));
      setIdentityFile(null);
      if (identityPreviewUrl) {
        URL.revokeObjectURL(identityPreviewUrl);
        setIdentityPreviewUrl(null);
      }

    } catch (globalError: any) {
      console.error('[PURCHASE_SUBMIT_UNEXPECTED_ERROR]', globalError);
      toast.error(`Erreur inattendue : ${globalError?.message || 'Impossible de finaliser la demande.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyNumber = (num: string) => {
    navigator.clipboard.writeText(num);
    setCopiedNumber(num);
    toast.success('Numéro copié dans le presse-papiers !');
    setTimeout(() => setCopiedNumber(null), 2500);
  };

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-slate-500">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-bold">Chargement de votre espace cartes...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-3.5 sm:px-6 py-4 pb-28 space-y-6 sm:space-y-8">
      
      {/* My Cards Section */}
      <section>
        <div className="flex items-center justify-between mb-4 sm:mb-5">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Mes Cartes</h2>
            <p className="text-slate-500 text-xs font-medium">Cartes attribuées et gestion de solde</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-[11px] sm:text-xs font-extrabold px-2.5 sm:px-3 py-1 bg-blue-50 text-blue-800 rounded-full border border-blue-100 whitespace-nowrap">
              {myCards.length} / 4
            </span>
            {myCards.length < 4 && myCards.length > 0 && (
              <button 
                onClick={() => {
                  setPrintRequested(false);
                  setUrgentProcessing(false);
                  setPurchaseStep(1);
                }}
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs py-2 px-3 sm:px-4 rounded-xl transition-all shadow-sm flex items-center gap-1 cursor-pointer"
              >
                <Plus size={14} />
                <span>Commander</span>
              </button>
            )}
          </div>
        </div>

        {myCards.length === 0 ? (
          <div className="bg-white rounded-3xl sm:rounded-[2.5rem] border-2 border-slate-100 p-8 sm:p-12 text-center flex flex-col items-center justify-center min-h-[320px] shadow-sm">
            <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-5 shadow-inner">
              <CreditCard size={36} />
            </div>
            <h3 className="text-slate-900 font-black text-xl sm:text-2xl mb-2 tracking-tight">Vous n'avez pas encore de carte</h3>
            <p className="text-slate-500 text-sm max-w-sm mb-6 font-medium">
              Commandez votre carte Market-Cash pour effectuer vos opérations en toute simplicité.
            </p>
            <button 
              onClick={() => {
                setPrintRequested(false);
                setUrgentProcessing(false);
                setPurchaseStep(1);
              }}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black py-3.5 px-8 rounded-2xl transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 text-base cursor-pointer"
            >
              <span>Acheter une carte</span>
              <ArrowRight size={18} />
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {myCards.map((card, idx) => {
              const isRevealed = !!revealedCards[card.cardId || card.id || ''];
              const currentCardId = card.cardId || card.id || '';
              const customCardId = getMarketCashCardId(card, idx);

              return (
                <div key={currentCardId} className="flex flex-col space-y-3.5">
                  {/* CARD CANVAS (Landscape ISO PVC ratio 1.586 : 1) */}
                  <MarketCashCard 
                    card={card}
                    backgroundUrl={cardBackgroundUrl}
                    mode="client"
                    isRevealed={isRevealed}
                    showRevealButton={true}
                    onToggleReveal={() => handleToggleCardReveal(currentCardId)}
                    useBiometrics={user?.useBiometrics}
                  />

                  {/* 3 MOBILE ACTIONS UNDER EACH CARD */}
                  <div className="space-y-2 pt-0.5">
                    {/* BOUTON 1: Commander la carte physique */}
                    <button
                      type="button"
                      onClick={() => openDeliveryModal(card)}
                      className="w-full min-h-[46px] py-3 px-4 bg-blue-950 hover:bg-blue-900 active:scale-[0.99] text-white font-black text-xs sm:text-sm rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer group"
                    >
                      <Truck size={16} className="text-amber-400 group-hover:scale-110 transition-transform" />
                      <span>{card.printStatus === 'printed' ? 'Préparer ma livraison' : 'Commander la carte physique'}</span>
                    </button>

                    {/* BOUTONS 2 & 3 */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* BOUTON 2: Recharger la carte */}
                      <button
                        type="button"
                        onClick={() => setCardForRecharge(card)}
                        className="min-h-[46px] py-2.5 px-3 bg-amber-500 hover:bg-amber-600 active:scale-[0.99] text-blue-950 font-black text-xs sm:text-sm rounded-2xl transition-all shadow-sm shadow-amber-500/20 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Coins size={16} />
                        <span>Recharger la carte</span>
                      </button>

                      {/* BOUTON 3: Voir le solde (Désactivé - Bientôt disponible) */}
                      <button
                        type="button"
                        disabled
                        className="min-h-[46px] py-2 px-3 bg-slate-100 border border-slate-200/80 rounded-2xl text-slate-400 font-bold text-xs flex flex-col items-center justify-center leading-tight cursor-not-allowed opacity-85 select-none"
                        title="Fonctionnalité de solde bientôt disponible"
                      >
                        <div className="flex items-center gap-1 text-slate-600 font-bold text-[11px]">
                          <Coins size={13} className="text-slate-400" />
                          <span>Voir le solde</span>
                        </div>
                        <span className="text-[8px] bg-slate-200 text-slate-500 px-1.5 py-0.2 rounded font-extrabold uppercase mt-0.5">
                          Bientôt disponible
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Card Requests Real-Time Tracker Section */}
      {myRequests.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Clock className="text-blue-600" size={20} />
                Suivi de mes demandes d'achat
              </h2>
              <p className="text-slate-500 text-xs font-medium">Mises à jour instantanées de vos demandes de cartes</p>
            </div>
            <span className="text-xs font-bold text-slate-400">
              {myRequests.length} demande{myRequests.length > 1 ? 's' : ''}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {myRequests.map((req) => (
              <div 
                key={req.id} 
                className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm relative overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <div>
                      <h4 className="font-black text-slate-900 text-base">{req.cardName || (req.cardType === 'virtual' ? 'Carte Virtuelle' : 'Carte Physique')}</h4>
                      <p className="text-xs text-slate-500">Réf : {req.transactionReference || req.paymentReference} • {req.paymentMethod}</p>
                    </div>
                    
                    {/* Status Badge */}
                    <div className="flex-shrink-0">
                      {req.status === 'pending' && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200/60 rounded-xl text-xs font-black">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          En cours de validation
                        </span>
                      )}
                      {req.status === 'approved' && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/60 rounded-xl text-xs font-black">
                          <CheckCircle2 size={13} className="text-emerald-600" />
                          Approuvée & Active
                        </span>
                      )}
                      {req.status === 'rejected' && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-800 border border-red-200/60 rounded-xl text-xs font-black">
                          <AlertCircle size={13} className="text-red-600" />
                          Refusée
                        </span>
                      )}
                    </div>
                  </div>

                  {req.status === 'rejected' && req.rejectionReason && (
                    <div className="bg-red-50/80 p-3 rounded-2xl border border-red-100 mb-3 text-xs text-red-800">
                      <span className="font-bold">Motif du refus :</span> {req.rejectionReason}
                    </div>
                  )}

                  {req.status === 'pending' && (
                    <div className="bg-blue-50/60 p-3 rounded-2xl border border-blue-100/60 mb-3 text-xs text-blue-900 flex items-center gap-2">
                      <ShieldCheck size={16} className="text-blue-600 flex-shrink-0" />
                      <span>Votre demande est en cours de traitement par notre équipe de vérification.</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center text-[11px] text-slate-400 font-medium pt-3 border-t border-slate-100 mt-2">
                  <span>Montant : <strong className="text-slate-700 font-bold">{req.amount} {req.currency || 'USD'}</strong></span>
                  <span>{formatTimeAgo(req.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Physical Card Delivery Tracker Section */}
      {myDeliveryRequests.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Truck className="text-amber-500" size={20} />
                Suivi de mes commandes de cartes physiques
              </h2>
              <p className="text-slate-500 text-xs font-medium">Suivi de livraison à l'adresse indiquée</p>
            </div>
            <span className="text-xs font-bold text-slate-400">
              {myDeliveryRequests.length} commande{myDeliveryRequests.length > 1 ? 's' : ''}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {myDeliveryRequests.map((dReq) => (
              <div 
                key={dReq.id} 
                className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <div>
                      <h4 className="font-black text-slate-900 text-base">{dReq.cardName || 'Carte Physique Market-Cash'}</h4>
                      <p className="text-xs text-slate-500 font-mono">Carte : {dReq.cardNumberMasked}</p>
                    </div>

                    {/* Delivery Status Badge */}
                    <div className="flex-shrink-0">
                      {dReq.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold">
                          <Clock size={12} />
                          En attente de livreur
                        </span>
                      )}
                      {(dReq.status === 'assigned' || dReq.status === 'out_for_delivery') && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-xl text-xs font-bold">
                          <Truck size={12} />
                          {dReq.status === 'out_for_delivery' ? 'En cours de livraison' : 'Livreur assigné'}
                        </span>
                      )}
                      {dReq.status === 'delivered' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold">
                          <CheckCircle2 size={12} />
                          Livrée
                        </span>
                      )}
                      {dReq.status === 'reported' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-50 text-orange-800 border border-orange-200 rounded-xl text-xs font-bold">
                          <Clock size={12} />
                          Livraison reportée
                        </span>
                      )}
                      {dReq.status === 'cancelled' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-800 border border-red-200 rounded-xl text-xs font-bold">
                          <AlertCircle size={12} />
                          Annulée
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Calendar size={14} className="text-slate-400 flex-shrink-0" />
                      <span>Date souhaitée : <strong className="text-slate-800">{dReq.deliveryDate}</strong></span>
                    </div>
                    <div className="flex items-start gap-1.5 font-medium">
                      <MapPin size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-2">Adresse : <strong className="text-slate-800">{dReq.deliveryAddress}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center text-[11px] text-slate-400 font-medium pt-3 border-t border-slate-100 mt-3">
                  <span>Demande effectuée le {new Date(dReq.createdAt).toLocaleDateString('fr-FR')}</span>
                  <span>{formatTimeAgo(dReq.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* PIN / BIOMETRIC VERIFICATION MODAL */}
      {pendingCardToReveal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <form 
            onSubmit={handleVerifyPinAndReveal} 
            className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
          >
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner border-2 border-blue-100">
                <Lock size={28} />
              </div>
              <h3 className="font-black text-2xl text-slate-900 tracking-tight">Code PIN de sécurité</h3>
              <p className="text-xs text-slate-500 font-medium">
                Veuillez saisir votre code PIN pour afficher les détails sensibles de votre carte.
              </p>
            </div>

            <div>
              <input
                type="password"
                maxLength={6}
                autoFocus
                value={pinInput}
                onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl outline-none focus:border-blue-600 focus:bg-white text-center font-mono text-2xl tracking-[0.5em] font-black text-slate-900 transition-all"
                required
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPendingCardToReveal(null);
                  setPinInput('');
                }}
                className="flex-1 py-3.5 bg-slate-100 text-slate-700 font-bold rounded-2xl hover:bg-slate-200 transition cursor-pointer text-sm"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={verifyingPin || pinInput.length < 4}
                className="flex-1 py-3.5 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer shadow-lg shadow-blue-600/30 text-sm"
              >
                {verifyingPin ? 'Vérification...' : 'Valider'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PHYSICAL CARD DELIVERY REQUEST MODAL */}
      {cardForDelivery && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-white rounded-[1.75rem] sm:rounded-[2.5rem] w-full max-w-lg overflow-hidden flex flex-col max-h-[calc(100dvh-1.25rem)] sm:max-h-[90dvh] shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-slate-100 shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                  <Truck size={20} />
                </div>
                <div>
                  <h3 className="font-black text-lg sm:text-xl text-slate-900 tracking-tight">Commander une livraison</h3>
                  <p className="text-xs text-slate-500 font-medium">Livraison directement à votre adresse</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={closeDeliveryModal}
                className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                aria-label="Fermer la demande de livraison"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handlePhysicalDeliverySubmit} className="flex-1 min-h-0 p-4 sm:p-6 overflow-y-auto overscroll-contain space-y-4 sm:space-y-5">
              {/* Card preview badge */}
              <div className="bg-gradient-to-r from-blue-50 to-slate-50 p-4 rounded-2xl border border-blue-100 flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">Carte sélectionnée</span>
                  <span className="text-sm font-black text-slate-800 font-mono">
                    •••• •••• •••• {(cardForDelivery.cardNumber || '').replace(/\s+/g, '').slice(-4)}
                  </span>
                </div>
                <span className="text-xs font-bold px-3 py-1 bg-amber-100 text-amber-800 rounded-full">
                  {cardForDelivery.type === 'virtual' ? 'Conversion Physique' : 'Carte Physique'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Adresse de livraison / Point relais <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={e => setDeliveryAddress(e.target.value)}
                  maxLength={300}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none transition-all font-semibold text-slate-800 text-sm"
                  placeholder="Ex: Agence Gombe, Kinshasa"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Date de retrait souhaitée <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={e => setDeliveryDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none transition-all font-semibold text-slate-800 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Numéro WhatsApp <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Smartphone size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600" />
                  <input
                    type="tel"
                    value={deliveryPhone}
                    onChange={e => setDeliveryPhone(e.target.value)}
                    maxLength={30}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-emerald-500 focus:bg-white outline-none transition-all font-semibold text-slate-800 text-sm"
                    placeholder="Ex : 0820742730"
                    autoComplete="tel"
                    required
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">Ce numéro permettra au livreur ou à l’agence de vous contacter.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Localisation / Point de repère <span className="text-slate-400 normal-case tracking-normal">(facultatif)</span>
                </label>
                <div className="relative">
                  <MapPin size={17} className="absolute left-4 top-3.5 text-blue-600" />
                  <textarea
                    value={deliveryLandmark}
                    onChange={e => setDeliveryLandmark(e.target.value)}
                    maxLength={300}
                    rows={2}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none transition-all font-semibold text-slate-800 text-sm resize-none"
                    placeholder="Commune, quartier ou point de repère utile"
                  />
                </div>
              </div>

              <div className="sticky bottom-0 -mx-1 pt-3 pb-1 bg-gradient-to-t from-white via-white to-white/80">
                <button
                  type="submit"
                  disabled={submittingDelivery || !deliveryAddress.trim() || !deliveryDate || !deliveryPhone.trim()}
                  className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-blue-950 font-black rounded-2xl transition-all shadow-lg shadow-amber-500/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submittingDelivery ? 'Traitement...' : 'Confirmer la demande de livraison'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PURCHASE MODAL */}
      {purchaseStep !== null && (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm z-[110] flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] shadow-2xl">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="font-black text-xl text-blue-950">Commander une carte Market-Cash</h3>
                <p className="text-xs text-slate-500">Une carte, avec impression et urgence en options</p>
              </div>
              <button type="button" aria-label="Fermer" onClick={() => {
                setPurchaseStep(null);
                setPrintRequested(false);
                setUrgentProcessing(false);
              }} className="p-2 text-slate-500 hover:bg-slate-200 rounded-full"><X size={20} /></button>
            </div>

            <div className="grid grid-cols-5 gap-2 px-5 pt-5">
              {['Options', 'Identité', 'Paiement', 'Preuve', 'Confirmation'].map((label, index) => (
                <div key={label}>
                  <div className={`h-1.5 rounded-full ${purchaseStep >= index + 1 ? 'bg-blue-600' : 'bg-slate-200'}`} />
                  <span className="hidden sm:block mt-1 text-[9px] font-bold text-slate-500">{label}</span>
                </div>
              ))}
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto">
              {purchaseStep === 1 && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Produit principal</p>
                    <div className="flex justify-between mt-1">
                      <span className="font-black text-blue-950">Carte Market-Cash</span>
                      <span className="font-black text-blue-700">{pricing.cardPrice ?? '—'} {pricing.currency}</span>
                    </div>
                  </div>

                  <button type="button" disabled={pricing.printingPrice === null}
                    onClick={() => setPrintRequested(value => !value)}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition ${printRequested ? 'border-amber-500 bg-amber-50' : 'border-slate-200'} disabled:opacity-50`}>
                    <div className="flex justify-between gap-3">
                      <div><p className="font-black text-slate-900">Impression physique</p>
                        <p className="text-xs text-slate-500 mt-1">La même carte sera préparée au format PVC, sans créer une seconde carte.</p></div>
                      <span className="font-black text-amber-600">+{pricing.printingPrice ?? '—'} {pricing.currency}</span>
                    </div>
                  </button>

                  <button type="button" disabled={pricing.urgencyFee === null}
                    onClick={() => setUrgentProcessing(value => !value)}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition ${urgentProcessing ? 'border-red-500 bg-red-50' : 'border-slate-200'} disabled:opacity-50`}>
                    <div className="flex justify-between gap-3">
                      <div><p className="font-black text-slate-900">Traitement urgent</p>
                        <p className="text-xs text-slate-500 mt-1">Après validation du paiement, une carte disponible peut être attribuée en quelques minutes.</p></div>
                      <span className="font-black text-red-600">+{pricing.urgencyFee ?? '—'} {pricing.currency}</span>
                    </div>
                  </button>

                  <div className="rounded-2xl bg-slate-950 text-white p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span>Carte Market-Cash</span><b>{pricing.cardPrice ?? 0} {pricing.currency}</b></div>
                    {printRequested && <div className="flex justify-between"><span>Impression physique</span><b>+{pricing.printingPrice ?? 0} {pricing.currency}</b></div>}
                    {urgentProcessing && <div className="flex justify-between"><span>Traitement urgent</span><b>+{pricing.urgencyFee ?? 0} {pricing.currency}</b></div>}
                    <div className="flex justify-between border-t border-white/20 pt-2 text-base"><strong>TOTAL</strong><strong className="text-amber-400">{actualPrice ?? '—'} {pricing.currency}</strong></div>
                  </div>
                  <button type="button" disabled={actualPrice === null} onClick={() => setPurchaseStep(2)}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black disabled:opacity-50">Continuer</button>
                </div>
              )}

              {purchaseStep === 2 && (
                <div className="space-y-4">
                  <div className={`p-4 rounded-2xl border ${urgentProcessing ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                    <p className="text-sm font-bold text-slate-800">
                      {urgentProcessing
                        ? "Traitement urgent : la pièce d'identité n'est pas obligatoire dans ce parcours."
                        : "Le traitement normal peut prendre jusqu'à 48 heures après validation du paiement et des informations."}
                    </p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div><label className="text-xs font-bold text-slate-700">Nom complet *</label>
                      <input value={purchaseForm.name} onChange={e => setPurchaseForm({...purchaseForm, name: e.target.value})}
                        className="mt-1 w-full px-4 py-3 border rounded-xl" required /></div>
                    <div><label className="text-xs font-bold text-slate-700">Téléphone *</label>
                      <input type="tel" value={purchaseForm.phone} onChange={e => setPurchaseForm({...purchaseForm, phone: e.target.value})}
                        className="mt-1 w-full px-4 py-3 border rounded-xl" required /></div>
                  </div>
                  {!urgentProcessing && (
                    <div className="p-4 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/40">
                      <label className="block font-black text-blue-950">Pièce d'identité obligatoire *</label>
                      <p className="text-xs text-slate-500 mt-1">JPEG/JPG, PNG ou WebP — 5 Mo maximum.</p>
                      <input className="mt-3 block w-full text-sm" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        onChange={handleIdentityFileChange} />
                      {identityPreviewUrl && <img src={identityPreviewUrl} alt="Aperçu de la pièce d'identité" className="mt-3 h-32 w-full object-contain rounded-xl bg-white" />}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setPurchaseStep(1)} className="px-5 py-3 bg-slate-100 rounded-xl font-bold">Retour</button>
                    <button type="button" disabled={!purchaseForm.name.trim() || !purchaseForm.phone.trim() || (!urgentProcessing && !identityFile)}
                      onClick={() => setPurchaseStep(3)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black disabled:opacity-50">Continuer vers le paiement</button>
                  </div>
                </div>
              )}

              {purchaseStep === 3 && (
                <div className="space-y-5">
                  <div className="flex justify-between items-center p-4 rounded-2xl bg-blue-950 text-white">
                    <span className="font-bold">Montant à régler</span><strong className="text-xl text-amber-400">{actualPrice} {pricing.currency}</strong>
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 mb-3">Moyens de paiement disponibles</h4>
                    {paymentMethods.length === 0 ? <p className="p-4 bg-red-50 text-red-700 rounded-xl text-sm">Aucun moyen de paiement actif.</p> :
                      <div className="grid gap-3">{paymentMethods.map(method => (
                        <div key={method.id} className="p-4 rounded-xl border bg-slate-50">
                          <p className="text-xs font-bold text-slate-500">{method.network}</p>
                          <p className="text-lg font-black text-blue-950">{method.number}</p>
                          <p className="text-xs text-slate-600">Bénéficiaire : {method.beneficiary}</p>
                        </div>
                      ))}</div>}
                  </div>
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-xl">Effectuez le paiement puis préparez une capture claire comme preuve.</p>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setPurchaseStep(2)} className="px-5 py-3 bg-slate-100 rounded-xl font-bold">Retour</button>
                    <button type="button" disabled={paymentMethods.length === 0} onClick={() => setPurchaseStep(4)}
                      className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black disabled:opacity-50">J'ai effectué le paiement</button>
                  </div>
                </div>
              )}

              {purchaseStep === 4 && (
                <form onSubmit={handlePurchaseSubmit} className="space-y-4">
                  <div className="p-4 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/40">
                    <label className="block font-black text-blue-950">Preuve de paiement obligatoire *</label>
                    <p className="text-xs text-slate-500 mt-1">JPEG/JPG, PNG ou WebP — 5 Mo maximum.</p>
                    <input className="mt-3 block w-full text-sm" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleFileChange} />
                    {proofPreviewUrl && <img src={proofPreviewUrl} alt="Aperçu de la preuve de paiement" className="mt-3 h-40 w-full object-contain rounded-xl bg-white" />}
                  </div>
                  <div><label className="text-xs font-bold text-slate-700">Note supplémentaire (facultatif)</label>
                    <textarea maxLength={1000} rows={3} value={purchaseForm.note} onChange={e => setPurchaseForm({...purchaseForm, note: e.target.value})}
                      className="mt-1 w-full px-4 py-3 border rounded-xl resize-none" /></div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setPurchaseStep(3)} disabled={isSubmitting} className="px-5 py-3 bg-slate-100 rounded-xl font-bold">Retour</button>
                    <button type="submit" disabled={isSubmitting || !proofFile}
                      className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-black disabled:opacity-50">{isSubmitting ? 'Envoi…' : 'Confirmer la demande'}</button>
                  </div>
                </form>
              )}

              {purchaseStep === 5 && (
                <div className="text-center py-6 space-y-5">
                  <CheckCircle2 size={54} className="mx-auto text-emerald-600" />
                  <div><h4 className="text-2xl font-black text-slate-900">Demande enregistrée</h4>
                    <p className="mt-2 text-sm text-slate-600">Votre paiement sera vérifié avant toute attribution de carte.</p></div>
                  <button type="button" onClick={() => {
                    setPurchaseStep(null);
                    setPrintRequested(false);
                    setUrgentProcessing(false);
                  }} className="w-full py-4 bg-blue-950 text-white rounded-2xl font-black">Consulter mes demandes</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DEDICATED RECHARGE MODAL / SCREEN */}
      {cardForRecharge && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh] shadow-2xl animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-5 sm:p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCardForRecharge(null);
                    setCopiedRecharge(false);
                  }}
                  className="p-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer sm:hidden"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center border border-amber-200/60">
                  <Coins size={20} />
                </div>
                <div>
                  <h3 className="font-black text-lg sm:text-xl text-slate-900 tracking-tight">Recharger ma carte</h3>
                  <p className="text-xs text-slate-500 font-medium">Instructions et coordonnées de recharge</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setCardForRecharge(null);
                  setCopiedRecharge(false);
                }} 
                className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
              {/* Instructions Text */}
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                Pour recharger votre carte, envoyez le montant souhaité sur votre numéro de recharge indiqué ci-dessous. Une fois le rechargement confirmé, vous pourrez utiliser votre carte selon les conditions de Market-Cash.
              </p>

              {/* Number Highlight Box */}
              <div className="bg-gradient-to-br from-blue-950 to-slate-900 rounded-2xl p-5 text-white shadow-md border border-blue-800/40 relative overflow-hidden">
                <div className="text-[10px] text-amber-400 uppercase tracking-widest font-black">
                  NUMÉRO DE RECHARGE
                </div>
                <div className="text-2xl sm:text-3xl font-mono font-black text-white tracking-widest my-2 select-all">
                  {cardForRecharge.rechargeNumber || '0860570375'}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
                  <span className="text-slate-300 font-medium">
                    Titulaire : <strong className="text-white">{cardForRecharge.cardHolder || user?.displayName || 'Client'}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(cardForRecharge.rechargeNumber || '0860570375');
                      setCopiedRecharge(true);
                      toast.success('Numéro de recharge copié dans le presse-papier !');
                      setTimeout(() => setCopiedRecharge(false), 2500);
                    }}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-blue-950 font-black rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm text-xs active:scale-95"
                  >
                    {copiedRecharge ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedRecharge ? 'Copié !' : 'Copier le numéro'}</span>
                  </button>
                </div>
              </div>

              {/* Important Legal & Transaction Notice */}
              <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200/80 space-y-2">
                <div className="flex items-start gap-2.5 text-amber-900">
                  <Info size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1.5">
                    <p className="font-bold leading-snug">
                      Important : prévoyez au moins 1 USD supplémentaire lors de votre recharge afin de couvrir les éventuels frais de transaction applicables.
                    </p>
                    <p className="text-[11px] text-amber-800/90 italic">
                      Les frais applicables peuvent varier selon le moyen de paiement utilisé.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCardForRecharge(null);
                    setCopiedRecharge(false);
                  }}
                  className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black rounded-2xl transition-colors text-sm cursor-pointer"
                >
                  Retour
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
