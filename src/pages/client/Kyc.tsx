import React, { useEffect, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  ArrowLeft,
  Camera,
  Check,
  Crop as CropIcon,
  FileImage,
  Images,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { auth, db, storage } from '../../firebase/config';
import { useAuthStore } from '../../store/authStore';

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type PhotoType = 'document' | 'portrait';
type CropDraft = { file: File; url: string; type: PhotoType };
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

      // La mise à jour de l'avatar ne doit jamais annuler un KYC déjà enregistré.
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

      toast.success('Dossier KYC envoyé pour vérification.');
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
          Statut : {status === 'approved' ? 'Vérifié' : status === 'rejected' ? 'À corriger' : 'En attente / non complété'}
        </div>

        {status !== 'approved' && (
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
              text="Photographiez ou importez une image claire et lisible."
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
              Vous pourrez rogner la photo avant de la confirmer.
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
  const imgRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [working, setWorking] = useState(false);
  const aspect = draft.type === 'portrait' ? 1 : 1.586;

  const start = (event: React.PointerEvent) => {
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      ox: offset.x,
      oy: offset.y,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const move = (event: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + event.clientX - drag.current.x,
      y: drag.current.oy + event.clientY - drag.current.y,
    });
  };

  const finish = () => {
    drag.current = null;
  };

  const confirm = async () => {
    const image = imgRef.current;
    const frame = frameRef.current;
    if (!image || !frame || !image.naturalWidth || !image.naturalHeight) return;

    setWorking(true);
    try {
      const frameWidth = frame.clientWidth;
      const frameHeight = frame.clientHeight;
      const baseScale = Math.max(
        frameWidth / image.naturalWidth,
        frameHeight / image.naturalHeight,
      );
      const scale = baseScale * zoom;
      const drawnWidth = image.naturalWidth * scale;
      const drawnHeight = image.naturalHeight * scale;
      const drawnX = (frameWidth - drawnWidth) / 2 + offset.x;
      const drawnY = (frameHeight - drawnHeight) / 2 + offset.y;

      const sourceX = Math.max(0, -drawnX / scale);
      const sourceY = Math.max(0, -drawnY / scale);
      const sourceWidth = Math.min(frameWidth / scale, image.naturalWidth - sourceX);
      const sourceHeight = Math.min(frameHeight / scale, image.naturalHeight - sourceY);

      const outputWidth = draft.type === 'portrait' ? 1000 : 1400;
      const outputHeight = Math.round(outputWidth / aspect);
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
          0.86,
        );
      });

      const file = new File([blob], `${draft.type}-${Date.now()}.jpg`, {
        type: 'image/jpeg',
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
    <div className="fixed inset-0 z-[60] flex items-end bg-black/70">
      <div className="w-full rounded-t-3xl bg-white p-4 pb-7">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black">Recadrer la photo</h3>
            <p className="text-xs text-slate-500">Glissez l'image puis utilisez le zoom.</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-full bg-slate-100 p-2">
            <X />
          </button>
        </div>

        <div
          ref={frameRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          className="relative mx-auto mt-4 w-full max-w-md touch-none overflow-hidden rounded-2xl bg-black"
          style={{ aspectRatio: String(aspect) }}
        >
          <img
            ref={imgRef}
            src={draft.url}
            alt="Recadrage"
            draggable={false}
            className="absolute inset-0 h-full w-full select-none object-cover"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              transformOrigin: 'center',
            }}
          />
          <div className="pointer-events-none absolute inset-3 rounded-xl border-2 border-white/80" />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <CropIcon size={20} />
          <input
            className="w-full"
            type="range"
            min="1"
            max="2.5"
            step="0.05"
            value={zoom}
            onChange={event => setZoom(Number(event.target.value))}
          />
          <span className="w-12 text-right text-sm font-bold">{Math.round(zoom * 100)}%</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl bg-slate-100 py-3 font-bold text-slate-700"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={working}
            onClick={confirm}
            className="flex items-center justify-center gap-2 rounded-2xl bg-blue-950 py-3 font-black text-white disabled:opacity-50"
          >
            <Check size={18} />
            {working ? 'Traitement...' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}
