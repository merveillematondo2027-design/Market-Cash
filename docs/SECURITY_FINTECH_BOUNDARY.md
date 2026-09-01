# Frontière de sécurité Fintech

1. Le navigateur ne détient aucune clé M-Pesa, banque, issuer Visa, e-SIM, exchange ou GMH APIs privilégiée.
2. Le navigateur ne peut jamais écrire directement un nouveau solde disponible, solde comptable, hold ou règlement.
3. Le backend Market-Cash authentifie l'utilisateur, crée l'intention métier et conserve l'idempotency key.
4. GMH APIs intervient uniquement lorsque l'opération nécessite un fournisseur/partenaire externe.
5. Les webhooks partenaires doivent être vérifiés côté serveur avant toute écriture ledger.
6. Un débit/crédit wallet est enregistré comme écriture comptable immuable ; le solde est une conséquence du ledger, pas une valeur librement modifiable par le client.
7. Les opérations sensibles exigent confirmation utilisateur et journal d'audit.
