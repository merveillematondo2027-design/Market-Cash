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
  
  // 4-Step Purchase Flow State
  const [purchaseStep, setPurchaseStep] = useState<1 | 2 | 3 | 4 | null>(null);
  const [physicalOption, setPhysicalOption] = useState<'none'|'normal'|'urgent'>('none');
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedPhysicalPrice = physicalOption === 'urgent'
    ? pricing.urgentPhysicalCardPrice
    : physicalOption === 'normal'
      ? pricing.physicalCardPrice
      : 0;
  const actualPrice = pricing.virtualCardPrice !== null && selectedPhysicalPrice !== null
    ? pricing.virtualCardPrice + selectedPhysicalPrice
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
  const [gpsLocation, setGpsLocation] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [isGettingGps, setIsGettingGps] = useState(false);
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

  // Clean up object preview URL
  useEffect(() => {
    return () => {
      if (proofPreviewUrl) {
        URL.revokeObjectURL(proofPreviewUrl);
      }
    };
  }, [proofPreviewUrl]);

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
      setPricingUnavailable(p.virtualCardPrice === null && p.physicalCardPrice === null);
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

  // Capture GPS Location
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("La géolocalisation n'est pas supportée par votre navigateur.");
      return;
    }

    if (
      typeof window !== 'undefined' &&
      window.location.protocol !== 'https:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      toast.error("La géolocalisation nécessite une connexion sécurisée (HTTPS).");
      return;
    }

    setIsGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        setIsGettingGps(false);
        toast.success(`Position GPS enregistrée avec succès (Précision: ~${Math.round(position.coords.accuracy)}m)`);
      },
      (error) => {
        const errDetails = {
          code: error.code,
          codeName: error.code === 1 
            ? 'PERMISSION_DENIED' 
            : error.code === 2 
              ? 'POSITION_UNAVAILABLE' 
              : error.code === 3 
                ? 'TIMEOUT' 
                : 'UNKNOWN',
          message: error.message || ''
        };
        console.error('[GEOLOCATION_ERROR]', errDetails);
        setIsGettingGps(false);

        if (error.code === 1) {
          toast.error("Accès GPS refusé. Veuillez autoriser la localisation dans les paramètres de votre navigateur/appareil.");
        } else if (error.code === 2) {
          toast.error("Position GPS indisponible. Vérifiez que la localisation GPS est activée sur votre appareil.");
        } else if (error.code === 3) {
          toast.error("Délai d'attente de localisation dépassé. Veuillez vous déplacer dans une zone dégagée et réessayer.");
        } else {
          toast.error(error.message || "Impossible d'obtenir la position GPS. Vérifiez les autorisations de votre appareil.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
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

    if (
      !gpsLocation || 
      typeof gpsLocation.latitude !== 'number' || 
      typeof gpsLocation.longitude !== 'number' ||
      isNaN(gpsLocation.latitude) ||
      isNaN(gpsLocation.longitude)
    ) {
      toast.error('Veuillez enregistrer votre position GPS exacte pour faciliter la livraison.');
      return;
    }

    console.log('[DELIVERY_REQUEST_START]');
    console.log({
      cardId,
      cardIdentifier,
      userId: user.uid,
      deliveryDate,
      whatsappNumber: deliveryPhone.trim(),
      deliveryAddress: deliveryAddress.trim(),
      latitude: gpsLocation.latitude,
      longitude: gpsLocation.longitude
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
        location: {
          lat: gpsLocation.latitude,
          lng: gpsLocation.longitude,
          accuracy: gpsLocation.accuracy || 0,
          address: deliveryAddress.trim()
        }
      });

      toast.success('Demande de livraison envoyée avec succès ! Nos livreurs et administrateurs ont été notifiés.');
      setCardForDelivery(null);
      setDeliveryDate('');
      setDeliveryAddress('');
      setDeliveryPhone('');
      setGpsLocation(null);
    } catch (error: any) {
      console.error('[DELIVERY_REQUEST_ERROR]', error);
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

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !auth.currentUser) {
      toast.error('Session expirée ou utilisateur non authentifié. Veuillez vous reconnecter.');
      return;
    }

    if (!physicalOption) {
      toast.error('Veuillez sélectionner un type de carte.');
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

    

    

    if (!proofFile) {
      toast.error('La preuve de paiement (capture d\'écran) est obligatoire.');
      return;
    }

    setIsSubmitting(true);
    let uploadedDownloadUrl: string | null = null;
    const currentUid = auth.currentUser.uid;
    const timestamp = Date.now();
    const cleanFileName = proofFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `payment-proofs/${currentUid}/${timestamp}_${cleanFileName}`;

    try {
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
      const cardTitle = 'Carte Virtuelle Market-Cash' + (physicalOption === 'urgent' ? ' + Impression Urgente' : (physicalOption === 'normal' ? ' + Impression Normale' : ''));
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
        physicalOption: physicalOption,
        hasNote: Boolean(cleanNote),
        hasAgencyId: Boolean(user.agencyId),
        hasCardIdentifier: false
      });

      const requestPayload = removeUndefined(rawRequestPayload);

      await setDoc(doc(db, 'card_purchase_requests', requestId), requestPayload);

      toast.success('Demande enregistrée avec succès !');
      setPurchaseStep(4);
      setProofFile(null);
      if (proofPreviewUrl) {
        URL.revokeObjectURL(proofPreviewUrl);
        setProofPreviewUrl(null);
      }
      setPurchaseForm(prev => ({ ...prev, reference: '', note: '' }));

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
                  setPhysicalOption('none');
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
                setPhysicalOption('none');
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
                      onClick={() => setCardForDelivery(card)}
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                  <Truck size={20} />
                </div>
                <div>
                  <h3 className="font-black text-xl text-slate-900 tracking-tight">Commander la carte physique</h3>
                  <p className="text-xs text-slate-500 font-medium">Livraison directement à votre adresse</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setCardForDelivery(null);
                  setDeliveryDate('');
                  setDeliveryAddress('');
                }} 
                className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handlePhysicalDeliverySubmit} className="p-6 overflow-y-auto space-y-4">
              {/* Card preview badge */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
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
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none transition-all font-semibold text-slate-800 text-sm"
                  required
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !deliveryAddress || !deliveryDate}
                  className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-blue-950 font-black rounded-2xl transition-all shadow-lg shadow-amber-500/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Traitement...' : 'Confirmer la demande de livraison'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PURCHASE MODAL */}
      {purchaseStep !== null && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner">
                  <CreditCard size={24} />
                </div>
                <div>
                  <h3 className="font-black text-xl text-slate-900 tracking-tight">Commander une carte</h3>
                  <p className="text-xs text-slate-500 font-medium">Processus d'achat sécurisé</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setPurchaseStep(null);
                  setPhysicalOption('none');
                  if (proofPreviewUrl) {
                    URL.revokeObjectURL(proofPreviewUrl);
                    setProofPreviewUrl(null);
                  }
                  setProofFile(null);
                }} 
                className="p-2.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 rounded-full transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* 4-Step Progress Bar */}
            <div className="grid grid-cols-4 gap-2 px-6 pt-6 pb-2">
              {[
                { num: 1, label: '1. Choix' },
                { num: 2, label: '2. Paiement' },
                { num: 3, label: '3. Preuve' },
                { num: 4, label: '4. Validation' }
              ].map(step => (
                <div key={step.num} className="flex flex-col gap-2">
                  <div className={`h-1.5 rounded-full transition-all ${
                    purchaseStep >= step.num ? 'bg-blue-600' : 'bg-slate-200'
                  }`} />
                  <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-wider ${
                    purchaseStep >= step.num ? 'text-blue-600' : 'text-slate-400'
                  }`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto">
              
              
              {/* STEP 1: CHOICE */}
              {purchaseStep === 1 && (
                <div className="space-y-4">
                  <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 mb-4">
                    <h4 className="font-black text-blue-900 text-sm mb-1 flex items-center gap-2">
                       <Smartphone size={16} />
                       Carte Virtuelle Incluse
                    </h4>
                    <p className="text-xs text-blue-800/80 font-medium">
                      Votre carte virtuelle sera disponible instantanément après validation de votre paiement.
                      Prix de base : <strong>{pricing.virtualCardPrice} {pricing.currency}</strong>
                    </p>
                  </div>
                  
                  <h3 className="font-black text-lg text-slate-800">Souhaitez-vous également une carte physique ?</h3>
                  
                  <div className="grid gap-3">
                    {/* Option None */}
                    <div 
                      onClick={() => setPhysicalOption('none')}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col gap-2 ${
                        physicalOption === 'none' 
                          ? 'border-blue-500 bg-blue-50/50 shadow-md ring-4 ring-blue-500/10' 
                          : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            physicalOption === 'none' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
                          }`}>
                            {physicalOption === 'none' && <Check size={14} />}
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm">Non, carte virtuelle uniquement</h4>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Option Normal */}
                    <div 
                      onClick={() => setPhysicalOption('normal')}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col gap-2 ${
                        physicalOption === 'normal' 
                          ? 'border-amber-500 bg-amber-50/50 shadow-md ring-4 ring-amber-500/10' 
                          : 'border-slate-200 hover:border-amber-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            physicalOption === 'normal' ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-600'
                          }`}>
                            {physicalOption === 'normal' && <Check size={14} />}
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm">Oui, commande physique normale</h4>
                            <p className="text-[10px] text-slate-500 mt-0.5">Impression à partir de 24 heures.</p>
                          </div>
                        </div>
                        <div className="font-black text-amber-600">
                          +{pricing.physicalCardPrice} {pricing.currency}
                        </div>
                      </div>
                    </div>

                    {/* Option Urgent */}
                    <div 
                      onClick={() => setPhysicalOption('urgent')}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col gap-2 ${
                        physicalOption === 'urgent' 
                          ? 'border-red-500 bg-red-50/50 shadow-md ring-4 ring-red-500/10' 
                          : 'border-slate-200 hover:border-red-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            physicalOption === 'urgent' ? 'bg-red-500 text-white' : 'bg-red-100 text-red-600'
                          }`}>
                            {physicalOption === 'urgent' && <Check size={14} />}
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm">Oui, impression urgente <span className="bg-red-100 text-red-600 text-[9px] px-1.5 py-0.5 rounded-full ml-1 uppercase">Prioritaire</span></h4>
                            <p className="text-[10px] text-slate-500 mt-0.5">Préparation immédiate après validation.</p>
                          </div>
                        </div>
                        <div className="font-black text-red-600">
                          +{pricing.urgentPhysicalCardPrice || 0} {pricing.currency}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      type="button"
                      onClick={() => setPurchaseStep(2)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-sm tracking-wide transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Continuer vers le paiement</span>
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: PAYMENT METHODS DISPLAY */}
              {purchaseStep === 2 && (
                <div className="space-y-5">
                  <h3 className="font-black text-xl text-blue-950">Comment effectuer votre paiement ?</h3>
                  
                  {/* Amount Summary */}
                  <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-5 rounded-2xl flex justify-between items-center shadow-md">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-blue-200 block">
                        Montant total à régler
                      </span>
                      <span className="text-sm font-semibold text-blue-100">
                        {'Carte Virtuelle Market-Cash' + (physicalOption === 'urgent' ? ' + Impression Urgente' : (physicalOption === 'normal' ? ' + Impression Normale' : ''))}
                      </span>
                    </div>
                    <span className="text-2xl sm:text-3xl font-black text-emerald-400">
                      {`${actualPrice ?? 0} ${pricing.currency}`}
                    </span>
                  </div>

                  {/* Payment Accounts List */}
                  <div className="space-y-4">
                    <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                       <h4 className="font-black text-blue-900 text-sm mb-2 flex items-center gap-2">
                         <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                         Envoyer le paiement
                       </h4>
                       <p className="text-xs text-blue-800/80 mb-3 font-medium">
                         Veuillez envoyer le montant au numéro indiqué ci-dessous.
                       </p>
                       
                      {paymentMethods.length === 0 ? (
                        <div className="p-4 bg-white border border-slate-200 rounded-xl text-center text-xs text-slate-500 font-medium">
                          Aucun numéro de paiement n'est configuré.
                        </div>
                      ) : (
                        <div className="grid gap-3">
                          {paymentMethods.map((pm) => (
                            <div 
                              key={pm.id}
                              className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col justify-between gap-1 shadow-sm"
                            >
                              <div className="text-xs font-bold text-slate-500">{pm.network}</div>
                              <div className="text-lg font-black text-blue-950 tracking-wider">{pm.number}</div>
                              <div className="text-xs font-bold text-slate-700">Bénéficiaire : {pm.beneficiary}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100">
                       <h4 className="font-black text-amber-900 text-sm mb-2 flex items-center gap-2">
                         <span className="bg-amber-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                         Préparez votre preuve
                       </h4>
                       <p className="text-xs text-amber-800/80 font-medium">
                         Après avoir effectué le paiement, préparez une capture d'écran claire comme preuve de paiement pour la prochaine étape.
                       </p>
                    </div>
                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setPurchaseStep(1)}
                      className="px-5 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition cursor-pointer"
                    >
                      Retour
                    </button>
                    <button
                      type="button"
                      onClick={() => setPurchaseStep(3)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-2xl font-black text-sm tracking-wide transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>J'ai effectué le paiement</span>
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: CONFIRMATION & PROOF UPLOAD */}
              {purchaseStep === 3 && (
                <form onSubmit={handlePurchaseSubmit} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                        Nom de la personne ayant effectué le paiement <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={purchaseForm.name}
                        onChange={e => setPurchaseForm({...purchaseForm, name: e.target.value})}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none transition-all font-semibold text-slate-800 text-sm"
                        placeholder="Ex: Jean Dupont"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                        Numéro ayant effectué le paiement <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={purchaseForm.phone}
                        onChange={e => setPurchaseForm({...purchaseForm, phone: e.target.value})}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none transition-all font-semibold text-slate-800 text-sm"
                        placeholder="Ex: 081 000 0000"
                        required
                      />
                    </div>
                  </div>

                  
                  <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 flex items-start gap-3">
                    <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                    <div>
                      <h4 className="font-bold text-amber-900 text-sm mb-1">Capture de paiement requise</h4>
                      <p className="text-xs text-amber-800/80">
                        ⚠️ Veuillez obligatoirement joindre une capture claire de votre paiement pour que l'administrateur puisse le valider.
                      </p>
                    </div>
                  </div>


                  {/* UPLOAD PROOF (Super Visible) */}
                  <div className="mt-4 bg-indigo-50/40 p-4 sm:p-5 rounded-3xl border-2 border-indigo-100 border-dashed">
                    <label className="block text-center mb-3">
                      <span className="text-sm sm:text-base font-black text-indigo-900 flex items-center justify-center gap-2">
                        📸 AJOUTEZ VOTRE PREUVE DE PAIEMENT <span className="text-red-500">*</span>
                      </span>
                      <span className="text-xs text-indigo-700 font-medium block mt-1">
                        Formats acceptés : JPG, PNG (Max 5Mo)
                      </span>
                    </label>

                    {proofPreviewUrl ? (
                      <div className="relative w-full aspect-[4/3] bg-black/5 rounded-2xl overflow-hidden group">
                        <img 
                          src={proofPreviewUrl} 
                          alt="Preuve" 
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                          <button
                            type="button"
                            onClick={() => {
                              URL.revokeObjectURL(proofPreviewUrl);
                              setProofPreviewUrl(null);
                              setProofFile(null);
                            }}
                            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer shadow-lg transform hover:scale-105 transition"
                          >
                            <Trash2 size={16} /> Supprimer l'image
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div 
                        onClick={() => document.getElementById('proof-upload')?.click()}
                        className="w-full aspect-[21/9] sm:aspect-[4/1] bg-white border-2 border-indigo-200 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition group shadow-sm"
                      >
                        <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                          <UploadCloud size={24} />
                        </div>
                        <span className="text-sm font-bold text-indigo-900">Cliquez pour importer la capture</span>
                      </div>
                    )}
                    <input 
                      id="proof-upload"
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleFileChange}
                    />
                  </div>

                  <div className="pt-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                      Note supplémentaire (Optionnel)
                    </label>
                    <textarea
                      value={purchaseForm.note}
                      onChange={e => setPurchaseForm({...purchaseForm, note: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none transition-all font-semibold text-slate-800 text-sm resize-none"
                      placeholder="Une remarque à l'attention de l'administrateur ?"
                      rows={2}
                    />
                  </div>

                  {/* Form Action Buttons */}
                  <div className="flex gap-3 pt-3">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setPurchaseStep(2)}
                      className="px-5 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition cursor-pointer disabled:opacity-50"
                    >
                      Retour
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !proofFile}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-sm tracking-wide transition shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? 'Envoi en cours...' : 'CONFIRMER ET ENVOYER MA DEMANDE'}
                    </button>
                  </div>
                </form>
              )}

{purchaseStep === 4 && (
                <div className="text-center py-6 px-4 space-y-5 animate-in zoom-in-95 duration-200">
                  <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner border-2 border-emerald-100">
                    <CheckCircle2 size={42} className="stroke-[2.5]" />
                  </div>

                  <div className="space-y-2 max-w-md mx-auto">
                    <h4 className="text-2xl font-black text-slate-900 tracking-tight">
                      Demande enregistrée avec succès !
                    </h4>
                    <p className="text-slate-600 text-sm font-medium leading-relaxed">
                      Votre demande pour une <strong className="text-slate-800">{physicalOption === 'none' ? 'Carte Virtuelle' : 'Carte Physique'} Market-Cash</strong> est actuellement en cours de traitement et de vérification par un Administrateur Général.
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl max-w-md mx-auto text-left space-y-2 text-xs text-slate-600">
                    <div className="flex items-center gap-2 font-bold text-slate-800">
                      <Clock size={15} className="text-blue-600" />
                      <span>Prochaines étapes :</span>
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-slate-500 pl-1">
                      <li>Validation du paiement par l'administration</li>
                      <li>Attribution et activation automatique de votre carte</li>
                      <li>Notification en direct dans votre espace Market-Cash</li>
                    </ul>
                  </div>

                  <div className="pt-4 max-w-sm mx-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setPurchaseStep(null);
                        setPhysicalOption('none');
                      }}
                      className="w-full bg-blue-950 hover:bg-blue-900 text-white font-black py-4 rounded-2xl text-sm transition shadow-md cursor-pointer"
                    >
                      Fermer et consulter mes demandes
                    </button>
                  </div>
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
