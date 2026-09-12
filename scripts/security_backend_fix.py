from pathlib import Path

# passkeys.ts: issue short biometric grant + preference callable
p=Path('functions/src/passkeys.ts'); s=p.read_text()
old="const verification=await verifyAuthenticationResponse({response,expectedChallenge:challenge.challenge,expectedOrigin:ORIGINS,expectedRPID:RP_ID,credential:{id:saved.credentialId,publicKey:bytes(saved.publicKey),counter:Number(saved.counter||0),transports:saved.transports||[]},requireUserVerification:true});if(!verification.verified)throw new HttpsError('permission-denied','Vérification biométrique refusée.');await ref.set({counter:verification.authenticationInfo.newCounter,lastUsedAt:Date.now()},{merge:true});await db.doc(`passkey_challenges/${uid}`).delete();return{verified:true,verifiedAt:Date.now()};"
new="const verification=await verifyAuthenticationResponse({response,expectedChallenge:challenge.challenge,expectedOrigin:ORIGINS,expectedRPID:RP_ID,credential:{id:saved.credentialId,publicKey:bytes(saved.publicKey),counter:Number(saved.counter||0),transports:saved.transports||[]},requireUserVerification:true});if(!verification.verified)throw new HttpsError('permission-denied','Vérification biométrique refusée.');const now=Date.now();await ref.set({counter:verification.authenticationInfo.newCounter,lastUsedAt:now},{merge:true});await db.doc(`biometric_grants/${uid}`).set({userId:uid,verifiedAt:now,expiresAt:now+90_000,updatedAt:now},{merge:true});await db.doc(`passkey_challenges/${uid}`).delete();return{verified:true,verifiedAt:now,expiresAt:now+90_000};"
if old not in s: raise SystemExit('passkey auth block not found')
s=s.replace(old,new,1)
s += "\nexport const updateSecurityPreferences=onCall({region:REGION},async request=>{const uid=requireUid(request);const minutes=Number(request.data?.securityAutoLockMinutes);if(![1,5,15,30,60].includes(minutes))throw new HttpsError('invalid-argument','Durée de verrouillage invalide.');const now=Date.now();await db.doc(`users/${uid}`).set({securityAutoLockMinutes:minutes,updatedAt:now},{merge:true});return{ok:true,securityAutoLockMinutes:minutes,updatedAt:now};});\n"
p.write_text(s)

# localCardPairOperations: PIN 4-10 + biometric grant
p=Path('functions/src/localCardPairOperations.ts'); s=p.read_text()
s=s.replace("if (!/^\\d{4,6}$/.test(pin))", "if (!/^\\d{4,10}$/.test(pin))")
insert="""
async function verifyBiometricGrant(uid:string){
  const ref=db.doc(`biometric_grants/${uid}`);const snap=await ref.get();const data=snap.data();
  if(!snap.exists||Number(data?.expiresAt||0)<Date.now())throw new HttpsError('permission-denied','Vérification biométrique expirée.');
  await ref.delete();
}
"""
needle="async function ensureSharedCvv(uid: string) {"
if insert.strip() not in s: s=s.replace(needle,insert+"\n"+needle,1)
old="export const revealLocalCardV3 = onCall({ region: REGION }, async request => {\n  const uid = requireAuth(request); await verifyPin(uid, request.data?.pin);"
new="export const revealLocalCardV3 = onCall({ region: REGION }, async request => {\n  const uid = requireAuth(request); if(request.data?.biometric===true)await verifyBiometricGrant(uid);else await verifyPin(uid, request.data?.pin);"
if old not in s: raise SystemExit('reveal function start not found')
s=s.replace(old,new,1); p.write_text(s)
print('backend patched')
