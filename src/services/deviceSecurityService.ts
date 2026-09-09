const key=(uid:string)=>`marketcash_biometric_credential_${uid}`;
const bytes=(size=32)=>crypto.getRandomValues(new Uint8Array(size));
const toBase64Url=(buffer:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const fromBase64Url=(value:string)=>{const base=value.replace(/-/g,'+').replace(/_/g,'/');const padded=base+'='.repeat((4-base.length%4)%4);const binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0))};

export const deviceSecurityService={
  supported(){return typeof window!=='undefined'&&'PublicKeyCredential'in window&&!!navigator.credentials},
  async platformAvailable(){if(!this.supported())return false;try{return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()}catch{return false}},
  enrolled(uid:string){try{return Boolean(localStorage.getItem(key(uid)))}catch{return false}},
  async enroll(uid:string,label='Utilisateur Market-Cash'){
    if(!(await this.platformAvailable()))throw new Error('Aucune biométrie compatible n’est disponible sur cet appareil.');
    const credential=await navigator.credentials.create({publicKey:{
      challenge:bytes(),rp:{name:'Market-Cash'},
      user:{id:new TextEncoder().encode(uid).slice(0,64),name:uid,displayName:label},
      pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
      authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'},
      timeout:60000,attestation:'none',
    }}) as PublicKeyCredential|null;
    if(!credential)throw new Error('Activation biométrique annulée.');
    localStorage.setItem(key(uid),toBase64Url(credential.rawId));
    return true;
  },
  async verify(uid:string){
    if(!(await this.platformAvailable()))throw new Error('Biométrie indisponible sur cet appareil.');
    const stored=localStorage.getItem(key(uid));
    if(!stored)throw new Error('Biométrie non configurée sur cet appareil.');
    const assertion=await navigator.credentials.get({publicKey:{challenge:bytes(),allowCredentials:[{id:fromBase64Url(stored),type:'public-key'}],userVerification:'required',timeout:60000}}) as PublicKeyCredential|null;
    if(!assertion)throw new Error('Vérification biométrique annulée.');
    sessionStorage.setItem('marketcash_biometric_verified_at',String(Date.now()));
    return true;
  },
  remove(uid:string){try{localStorage.removeItem(key(uid))}catch{}},
};
