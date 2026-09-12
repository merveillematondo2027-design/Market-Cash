from pathlib import Path

p=Path('functions/src/security.ts')
s=p.read_text()
s=s.replace("if (!/^\\d{4,6}$/.test(pin)) throw new HttpsError('invalid-argument', 'Le code secret de l’application doit contenir 4 à 6 chiffres.');","if (!/^\\d{4,10}$/.test(pin)) throw new HttpsError('invalid-argument', 'Le code secret de l’application doit contenir 4 à 10 chiffres.');")
old="""export const getClientSecurityOverview = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const user = await activeClient(uid);
  const security = await securityRefForUid(uid).get();
  return { hasApplicationPin: Boolean(user.data()?.pinHash), hasLocalCvv: /^\\d{3}$/.test(String(security.data()?.localTransactionCvv || '')), cvvVersion: Number(security.data()?.cvvVersion || 0), cvvUpdatedAt: Number(security.data()?.cvvUpdatedAt || 0) };
});"""
new="""export const getClientSecurityOverview = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const user = await activeClient(uid);
  const requestedAutoLock = request.data?.securityAutoLockMinutes;
  let securityAutoLockMinutes = Number(user.data()?.securityAutoLockMinutes || 5);
  let updatedAt = Number(user.data()?.updatedAt || Date.now());
  if (requestedAutoLock !== undefined) {
    const minutes = Number(requestedAutoLock);
    if (![1, 5, 15, 30, 60].includes(minutes)) throw new HttpsError('invalid-argument', 'Durée de verrouillage invalide.');
    updatedAt = Date.now();
    securityAutoLockMinutes = minutes;
    await db.doc(`users/${uid}`).set({ securityAutoLockMinutes: minutes, updatedAt }, { merge: true });
    await db.collection('audit_events').add({ actorId: uid, action: 'SECURITY_AUTO_LOCK_UPDATED', result: 'success', securityAutoLockMinutes: minutes, createdAt: updatedAt });
  }
  const security = await securityRefForUid(uid).get();
  return { hasApplicationPin: Boolean(user.data()?.pinHash), hasLocalCvv: /^\\d{3}$/.test(String(security.data()?.localTransactionCvv || '')), cvvVersion: Number(security.data()?.cvvVersion || 0), cvvUpdatedAt: Number(security.data()?.cvvUpdatedAt || 0), securityAutoLockMinutes, updatedAt };
});"""
if old not in s: raise SystemExit('security overview block not found')
s=s.replace(old,new,1)
p.write_text(s)

p=Path('src/services/deviceSecurityService.ts')
s=p.read_text()
s=s.replace("const updatePreferences=httpsCallable(functions,'updateSecurityPreferences');","const updatePreferences=httpsCallable(functions,'getClientSecurityOverview');")
p.write_text(s)
print('reused existing callable')
