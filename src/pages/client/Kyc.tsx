import React, { useEffect, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  ArrowLeft,
  Camera,
  Check,
  FileImage,
  Images,
  RotateCcw,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { auth, db, storage } from '../../firebase/config';
import { useAuthStore } from '../../store/authStore';

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type PhotoType = 'document' | 'portrait';
type CropDraft = { file: File; url: string; type: PhotoType };
type CropRect = { x: number; y: number; width: number; height: number };
type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
type KycForm = {
  fullName: string;
  phone: string;
  country: string;
  city: string;
  address: string;
  documentType: string;
  documentNumber: string;
};

function firebaseCode(error: unknown) {
  return String((error as { code?: string } | null)?.code || '');
}

function isPermissionError(error: unknown) {
  const code = firebaseCode(error);
  const message = String((error as { message?: string } | null)?.message || '');
  return (
    code === 'storage/unauthorized' ||
    code === 'permission-denied' ||
    code === 'firestore/permission-denied' ||
    message.includes('permission') ||
    message.includes('unauthorized')
  );
}

async function optimizeImage(file: File, maxSide = 1800, quality = 0.86): Promise<File> {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error('FORMAT');
  if (file.size > MAX_FILE_SIZE) throw new Error('SIZE');

  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS');

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        value => (value ? resolve(value) : reject(new Error('BLOB'))),
        'image/jpeg',
        quality,
      );
    });

    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn('[KYC_IMAGE_OPTIMIZE_FALLBACK]', error);
    return file;
  }
}

export default function ClientKyc() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const [status, setStatus] = useState('not_started');
  const [busy, setBusy] = useState(false);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [documentPreview, setDocumentPreview] = useState('');
  const [portraitPreview, setPortraitPreview] = useState('');
  const [cropDraft, setCropDraft] = useState<CropDraft | null>(null);
  const [form, setForm] = useState<KycForm>({
    fullName: user?.displayName || '',
    phone: user?.phone || '',
    country: 'RDC',
    city: '',
    address: '',
    documentType: 'national_id',
    documentNumber: '',
  });

  useEffect(() => {
    if (!user?.uid) return;

    let active = true;
    getDoc(doc(db, 'kyc_requests', user.uid))
      .then(snapshot => {
        if (!active || !snapshot.exists()) return;
        const data = snapshot.data();
        setStatus(data.status || 'pending');
        setForm(current => ({
          ...current,
          fullName: data.fullName || current.fullName,
          phone: data.phone || current.phone,
          country: data.country || current.country,
          city: data.city || '',
          address: data.address || '',
          documentType: data.documentType || 'national_id',
          documentNumber: data.documentNumber || '',
        }));
        setDocumentPreview(data.documentFrontUrl || '');
        setPortraitPreview(data.selfieUrl || '');
      })
      .catch(error => console.error('[KYC_LOAD_ERROR]', error));

    return () => {
      active = false;
    };
  }, [user?.uid]);

  const prepareFile = async (file: File | undefined, type: PhotoType) => {
    if (!file) return;

    try {
      toast.loading('Préparation de la photo...', { id: 'kyc-image' });
      const optimized = await optimizeImage(file);
      const url = URL.createObjectURL(optimized);
      setCropDraft({ file: optimized, url, type });
      toast.dismiss('kyc-image');
    } catch (error) {
      toast.dismiss('kyc-image');
      const message = String((error as Error)?.message || '');
      toast.error(
        message === 'SIZE'
          ? 'Image trop lourde. Maximum 12 Mo.'
          : 'Format non accepté. Utilisez JPG, PNG ou WEBP.',
      );
    }
  };

  const acceptCrop = (file: File, url: string, type: PhotoType) => {
    if (type === 'document') {
      if (documentPreview.startsWith('blob:')) URL.revokeObjectURL(documentPreview);
      setDocumentFile(file);
      setDocumentPreview(url);
    } else {
      if (portraitPreview.startsWith('blob:')) URL.revokeObjectURL(portraitPreview);
      setPortraitFile(file);
      setPortraitPreview(url);
    }
    setCropDraft(null);
  };

  const upload = async (file: File, path: string) => {
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file, { contentType: file.type || 'image/jpeg' });
    return getDownloadURL(fileRef);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.uid) return;

    if (!documentFile && !documentPreview) {
      toast.error("Ajoutez une photo de votre pièce d'identité.");
      return;
    }
    if (!portraitFile && !portraitPreview) {
      toast.error('Ajoutez votre photo portrait.');
      return;
    }

    setBusy(true);
    let stage = 'auth';

    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser || firebaseUser.uid !== user.uid) {
        throw new Error('AUTH_SESSION_MISSING');
      }

      await firebaseUser.getIdToken(true);

      const now = Date.now();
      let documentFrontUrl = documentPreview;
      let selfieUrl = portraitPreview;

      stage = 'document-upload';
      if (documentFile) {
        documentFrontUrl = await upload(
          documentFile,
          `kyc/${user.uid}/document-${now}.jpg`,
        );
      }

      stage = 'portrait-upload';
      if (portraitFile) {
        selfieUrl = await upload(
          portraitFile,
          `avatars/${user.uid}/profile-${now}.jpg`,
        );
      }

      stage = 'kyc-write';
      const requestRef = doc(db, 'kyc_requests', user.uid);
      const existing = await getDoc(requestRef);
      await setDoc(
        requestRef,
        {
          userId: user.uid,
          ...form,
          documentFrontUrl,
          selfieUrl,
          status: 'pending',
          updatedAt: now,
          ...(!existing.exists() ? { createdAt: now } : {}),
        },
        { merge: true },
      );

      setStatus('pending');

      // La synchronisation de l'avatar reste secondaire : un échec ici ne doit pas annuler le KYC.
      if (selfieUrl && selfieUrl !== user.avatar) {
        stage = 'avatar-sync';
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnapshot = await getDoc(userRef);

          if (userSnapshot.exists()) {
            await setDoc(userRef, { avatar: selfieUrl, updatedAt: now }, { merge: true });
          } else {
            await setDoc(userRef, {
              uid: user.uid,
              email: user.email || firebaseUser.email || '',
              displayName: user.displayName || firebaseUser.displayName || 'Client Market-Cash',
              phone: user.phone || firebaseUser.phoneNumber || '',
              avatar: selfieUrl,
              role: 'client',
              pinHash: user.pinHash || '',
              kycStatus: user.kycStatus || 'not_started',
              createdAt: user.createdAt || now,
              updatedAt: now,
            });
          }

          setUser({ ...user, avatar: selfieUrl, updatedAt: now });
        } catch (avatarError) {
          console.warn('[KYC_AVATAR_SYNC_DEFERRED]', {
            code: firebaseCode(avatarError),
            error: avatarError,
          });
        }
      }

      toast.success('Dossier KYC envoyé. Vérification en cours.');
      navigate('/client/profile', { replace: true });
    } catch (error) {
      console.error('[KYC_SUBMIT_ERROR]', {
        stage,
        code: firebaseCode(error),
        error,
      });

      if (String((error as Error)?.message || '') === 'AUTH_SESSION_MISSING') {
        toast.error('Votre session Firebase a expiré. Reconnectez-vous puis réessayez.');
      } else if (isPermissionError(error)) {
        const label =
          stage === 'document-upload' || stage === 'portrait-upload'
            ? 'stockage des images'
            : 'enregistrement du dossier';
        toast.error(`Accès Firebase refusé pendant le ${label}.`);
      } else {
        toast.error("Impossible d'envoyer le dossier KYC. Réessayez.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  const canEdit = status === 'not_started' || status === 'rejected';

  return (
    <div className="mx-auto max-w-xl p-4 pb-28 md:p-8">
      <Link
        to="/client/profile"
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"
      >
        <ArrowLeft size={16} /> Retour au profil
      </Link>

      <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-950">
          <ShieldCheck />
        </div>
        <h1 className="mt-4 text-2xl font-black">Vérification d'identité KYC</h1>
        <p className="mt-2 text-sm text-slate-500">
          Vérifiez votre identité une seule fois pour sécuriser votre compte et débloquer les services sensibles.
        </p>

        <div
          className={`mt-4 rounded-2xl p-3 text-sm font-bold ${
            status === 'approved'
              ? 'bg-emerald-50 text-emerald-700'
              : status === 'rejected'
                ? 'bg-red-50 text-red-700'
                : 'bg-amber-50 text-amber-700'
          }`}
        >
          Statut : {status === 'approved' ? 'Vérifié' : status === 'rejected' ? 'À corriger' : status === 'pending' ? 'En cours de vérification' : 'Non complété'}
        </div>

        {status === 'pending' && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <b>Dossier déjà envoyé.</b>
            <p className="mt-1 leading-5">La page de saisie est fermée pendant la vérification. Vous recevrez le résultat dans votre compte.</p>
            <Link to="/client/profile" className="mt-4 inline-flex rounded-xl bg-blue-950 px-4 py-3 font-black text-white">
              Retour à mon profil
            </Link>
          </div>
        )}

        {status === 'approved' && (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
            <b>Identité vérifiée.</b>
            <p className="mt-1">Votre dossier KYC est clôturé.</p>
          </div>
        )}

        {canEdit && (
          <form onSubmit={submit} className="mt-5 space-y-3">
            <input
              required
              value={form.fullName}
              onChange={event => setForm({ ...form, fullName: event.target.value })}
              placeholder="Nom complet"
              className="w-full rounded-2xl border p-4"
            />
            <input
              required
              value={form.phone}
              onChange={event => setForm({ ...form, phone: event.target.value })}
              placeholder="Téléphone"
              className="w-full rounded-2xl border p-4"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                value={form.country}
                onChange={event => setForm({ ...form, country: event.target.value })}
                placeholder="Pays"
                className="w-full rounded-2xl border p-4"
              />
              <input
                required
                value={form.city}
                onChange={event => setForm({ ...form, city: event.target.value })}
                placeholder="Ville"
                className="w-full rounded-2xl border p-4"
              />
            </div>
            <input
              required
              value={form.address}
              onChange={event => setForm({ ...form, address: event.target.value })}
              placeholder="Adresse"
              className="w-full rounded-2xl border p-4"
            />
            <select
              value={form.documentType}
              onChange={event => setForm({ ...form, documentType: event.target.value })}
              className="w-full rounded-2xl border p-4"
            >
              <option value="national_id">Carte d'identité</option>
              <option value="passport">Passeport</option>
              <option value="driving_licence">Permis de conduire</option>
              <option value="other">Autre document officiel</option>
            </select>
            <input
              required
              value={form.documentNumber}
              onChange={event => setForm({ ...form, documentNumber: event.target.value })}
              placeholder="Numéro du document"
              className="w-full rounded-2xl border p-4"
            />

            <UploadBox
              title="Pièce d'identité"
              text="Photographiez ou importez une image claire et lisible. Vous pourrez ensuite ajuster uniquement le cadre de rognage."
              icon={<FileImage size={22} />}
              preview={documentPreview}
              type="document"
              onFile={file => prepareFile(file, 'document')}
            />

            <UploadBox
              title="Portrait photographique"
              text="Photo nette du visage. Elle deviendra aussi votre photo de profil Market-Cash."
              icon={<UserRound size={22} />}
              preview={portraitPreview}
              type="portrait"
              onFile={file => prepareFile(file, 'portrait')}
            />

            <div className="rounded-2xl bg-blue-50 p-4 text-xs leading-5 text-blue-950">
              <b>Protection mémoire :</b> Market-Cash réduit automatiquement les photos haute résolution avant affichage et envoi.
            </div>

            <button
              disabled={busy}
              className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-50"
            >
              {busy ? 'Envoi sécurisé...' : 'Envoyer mon dossier KYC'}
            </button>
          </form>
        )}
      </div>

      {cropDraft && (
        <CropModal
          draft={cropDraft}
          onCancel={() => {
            URL.revokeObjectURL(cropDraft.url);
            setCropDraft(null);
          }}
          onConfirm={acceptCrop}
        />
      )}
    </div>
  );
}

function UploadBox({
  title,
  text,
  icon,
  preview,
  type,
  onFile,
}: {
  title: string;
  text: string;
  icon: React.ReactNode;
  preview: string;
  type: PhotoType;
  onFile: (file: File | undefined) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [chooser, setChooser] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-blue-950 shadow-sm">
          {icon}
        </div>
        <div>
          <div className="font-black text-slate-900">{title}</div>
          <div className="text-xs leading-5 text-slate-500">{text}</div>
        </div>
      </div>

      {preview && (
        <img
          src={preview}
          alt={title}
          className={`mt-3 w-full rounded-2xl border bg-white ${
            type === 'portrait' ? 'h-52 object-contain' : 'h-40 object-contain'
          }`}
        />
      )}

      <button
        type="button"
        onClick={() => setChooser(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-black text-blue-950"
      >
        <Camera size={18} /> Ajouter / remplacer la photo
      </button>

      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture={type === 'portrait' ? 'user' : 'environment'}
        className="hidden"
        onChange={event => {
          setChooser(false);
          onFile(event.target.files?.[0]);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={event => {
          setChooser(false);
          onFile(event.target.files?.[0]);
          event.currentTarget.value = '';
        }}
      />

      {chooser && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50"
          onClick={() => setChooser(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-white p-5 pb-8"
            onClick={event => event.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-slate-200" />
            <h3 className="text-lg font-black">Choisir la source</h3>
            <p className="mt-1 text-sm text-slate-500">
              Après sélection, ajustez le cadre de rognage sans déplacer ni zoomer l'image.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="rounded-2xl border p-5 font-bold"
              >
                <Camera className="mx-auto mb-2" />
                Prendre une photo
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="rounded-2xl border p-5 font-bold"
              >
                <Images className="mx-auto mb-2" />
                Téléverser
              </button>
            </div>
            <button
              type="button"
              onClick={() => setChooser(false)}
              className="mt-3 w-full rounded-2xl bg-slate-100 py-3 font-bold"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CropModal({
  draft,
  onCancel,
  onConfirm,
}: {
  draft: CropDraft;
  onCancel: () => void;
  onConfirm: (file: File, url: string, type: PhotoType) => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const imageBoxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    handle: CropHandle;
    pointerId: number;
    clientX: number;
    clientY: number;
    rect: CropRect;
  } | null>(null);
  const [crop, setCrop] = useState<CropRect>({ x: 0.05, y: 0.08, width: 0.9, height: 0.84 });
  const [working, setWorking] = useState(false);

  const resetCrop = () => {
    setCrop(draft.type === 'document'
      ? { x: 0.05, y: 0.08, width: 0.9, height: 0.84 }
      : { x: 0.08, y: 0.05, width: 0.84, height: 0.9 });
  };

  useEffect(() => {
    resetCrop();
  }, [draft.url, draft.type]);

  const startResize = (handle: CropHandle, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      handle,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      rect: { ...crop },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const box = imageBoxRef.current;
    if (!drag || !box || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    const bounds = box.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    const dx = (event.clientX - drag.clientX) / bounds.width;
    const dy = (event.clientY - drag.clientY) / bounds.height;
    const minWidth = Math.min(0.16, 90 / bounds.width);
    const minHeight = Math.min(0.16, 70 / bounds.height);
    const start = drag.rect;
    let x = start.x;
    let y = start.y;
    let width = start.width;
    let height = start.height;

    if (drag.handle.includes('w')) {
      const nextX = Math.max(0, Math.min(start.x + start.width - minWidth, start.x + dx));
      x = nextX;
      width = start.width + (start.x - nextX);
    }
    if (drag.handle.includes('e')) {
      width = Math.max(minWidth, Math.min(1 - start.x, start.width + dx));
    }
    if (drag.handle.includes('n')) {
      const nextY = Math.max(0, Math.min(start.y + start.height - minHeight, start.y + dy));
      y = nextY;
      height = start.height + (start.y - nextY);
    }
    if (drag.handle.includes('s')) {
      height = Math.max(minHeight, Math.min(1 - start.y, start.height + dy));
    }

    setCrop({ x, y, width, height });
  };

  const finishResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const confirm = async () => {
    const image = imageRef.current;
    if (!image || !image.naturalWidth || !image.naturalHeight) return;

    setWorking(true);
    try {
      const sourceX = Math.round(image.naturalWidth * crop.x);
      const sourceY = Math.round(image.naturalHeight * crop.y);
      const sourceWidth = Math.max(1, Math.round(image.naturalWidth * crop.width));
      const sourceHeight = Math.max(1, Math.round(image.naturalHeight * crop.height));
      const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
      const outputWidth = Math.max(1, Math.round(sourceWidth * scale));
      const outputHeight = Math.max(1, Math.round(sourceHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('CANVAS');

      ctx.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outputWidth,
        outputHeight,
      );

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          value => (value ? resolve(value) : reject(new Error('BLOB'))),
          'image/jpeg',
          0.9,
        );
      });

      const file = new File([blob], `${draft.type}-${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      const url = URL.createObjectURL(file);
      URL.revokeObjectURL(draft.url);
      onConfirm(file, url, draft.type);
    } catch (error) {
      console.error('[KYC_CROP_ERROR]', error);
      toast.error('Impossible de rogner cette image.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950 text-white">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10"
          aria-label="Annuler le rognage"
        >
          <X size={21} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h3 className="truncate font-black">Rogner {draft.type === 'document' ? "la pièce d'identité" : 'le portrait'}</h3>
          <p className="text-[11px] text-slate-300">L'image reste fixe · ajustez uniquement le cadre</p>
        </div>
        <button
          type="button"
          onClick={resetCrop}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10"
          aria-label="Réinitialiser le cadre"
        >
          <RotateCcw size={19} />
        </button>
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3">
        <div
          ref={imageBoxRef}
          className="relative inline-block max-h-full max-w-full overflow-hidden bg-black touch-none"
        >
          <img
            ref={imageRef}
            src={draft.url}
            alt="Image à rogner"
            draggable={false}
            className="block max-h-[68vh] max-w-[96vw] select-none object-contain"
          />

          <div
            className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(2,6,23,0.70)]"
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.width * 100}%`,
              height: `${crop.height * 100}%`,
            }}
          >
            <div className="pointer-events-none absolute left-1/3 top-0 h-full w-px bg-white/35" />
            <div className="pointer-events-none absolute left-2/3 top-0 h-full w-px bg-white/35" />
            <div className="pointer-events-none absolute left-0 top-1/3 h-px w-full bg-white/35" />
            <div className="pointer-events-none absolute left-0 top-2/3 h-px w-full bg-white/35" />

            <CropHandleButton handle="nw" onStart={startResize} onMove={resize} onEnd={finishResize} />
            <CropHandleButton handle="n" onStart={startResize} onMove={resize} onEnd={finishResize} />
            <CropHandleButton handle="ne" onStart={startResize} onMove={resize} onEnd={finishResize} />
            <CropHandleButton handle="e" onStart={startResize} onMove={resize} onEnd={finishResize} />
            <CropHandleButton handle="se" onStart={startResize} onMove={resize} onEnd={finishResize} />
            <CropHandleButton handle="s" onStart={startResize} onMove={resize} onEnd={finishResize} />
            <CropHandleButton handle="sw" onStart={startResize} onMove={resize} onEnd={finishResize} />
            <CropHandleButton handle="w" onStart={startResize} onMove={resize} onEnd={finishResize} />
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 bg-slate-950 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto max-w-md">
          <p className="mb-3 text-center text-xs leading-5 text-slate-300">
            Touchez une <b className="text-white">ligne blanche</b> ou un <b className="text-white">coin</b> du cadre, puis glissez pour choisir exactement la partie à conserver. L'image elle-même ne bouge pas et ne zoome pas.
          </p>
          <button
            type="button"
            disabled={working}
            onClick={confirm}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 font-black text-slate-950 disabled:opacity-50"
          >
            <Check size={19} />
            {working ? 'Traitement...' : 'Conserver cette zone'}
          </button>
        </div>
      </footer>
    </div>
  );
}

function CropHandleButton({
  handle,
  onStart,
  onMove,
  onEnd,
}: {
  handle: CropHandle;
  onStart: (handle: CropHandle, event: React.PointerEvent<HTMLButtonElement>) => void;
  onMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onEnd: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const position: Record<CropHandle, string> = {
    nw: '-left-3 -top-3 h-8 w-8 cursor-nwse-resize',
    n: 'left-1/4 -top-3 h-7 w-1/2 cursor-ns-resize',
    ne: '-right-3 -top-3 h-8 w-8 cursor-nesw-resize',
    e: '-right-3 top-1/4 h-1/2 w-7 cursor-ew-resize',
    se: '-bottom-3 -right-3 h-8 w-8 cursor-nwse-resize',
    s: '-bottom-3 left-1/4 h-7 w-1/2 cursor-ns-resize',
    sw: '-bottom-3 -left-3 h-8 w-8 cursor-nesw-resize',
    w: '-left-3 top-1/4 h-1/2 w-7 cursor-ew-resize',
  };

  const marker: Record<CropHandle, string> = {
    nw: 'left-3 top-3 border-l-[3px] border-t-[3px]',
    n: 'left-1/2 top-3 h-[3px] w-12 -translate-x-1/2 bg-white',
    ne: 'right-3 top-3 border-r-[3px] border-t-[3px]',
    e: 'right-3 top-1/2 h-12 w-[3px] -translate-y-1/2 bg-white',
    se: 'bottom-3 right-3 border-b-[3px] border-r-[3px]',
    s: 'bottom-3 left-1/2 h-[3px] w-12 -translate-x-1/2 bg-white',
    sw: 'bottom-3 left-3 border-b-[3px] border-l-[3px]',
    w: 'left-3 top-1/2 h-12 w-[3px] -translate-y-1/2 bg-white',
  };

  return (
    <button
      type="button"
      aria-label={`Ajuster le bord ${handle}`}
      onPointerDown={event => onStart(handle, event)}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      className={`absolute z-20 touch-none ${position[handle]}`}
    >
      <span className={`pointer-events-none absolute h-5 w-5 border-white ${marker[handle]}`} />
    </button>
  );
}
