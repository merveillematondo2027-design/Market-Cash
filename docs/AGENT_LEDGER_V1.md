# Market-Cash Agent Ledger v1

## Priorité MVP

Le premier flux financier réellement branché est le réseau interne **Agent ↔ Client**, sans M-Pesa, banque ni MHT APIs.

## Comptes

Chaque utilisateur possède deux wallets distincts : USD et CDF.

Un agent Market-Cash est un utilisateur existant auquel l'administration attribue une capacité `agent_profiles/{uid}`. Son rôle applicatif principal n'est pas modifié. L'agent possède lui aussi deux wallets servant de **float électronique**.

## Numéro de recharge

Chaque utilisateur reçoit un numéro de recharge Market-Cash stable, généré côté serveur et associé à son UID. Le client le communique à l'agent. L'agent saisit le numéro et voit le nom, le téléphone et les soldes du client avant de confirmer.

## Dépôt client (cash-in)

1. L'agent remet préalablement du cash réel à la direction Market-Cash.
2. L'admin active l'agent et crédite son float CDF ou USD via une opération auditée.
3. Le client remet du cash à l'agent et communique son numéro de recharge.
4. Le terminal retrouve le client.
5. L'agent choisit la devise et le montant.
6. L'agent confirme avec son PIN Market-Cash.
7. Une Cloud Function exécute atomiquement :
   - débit du float agent ;
   - crédit du wallet client ;
   - création de la transaction ;
   - deux entrées de ledger ;
   - audit.
8. Le terminal affiche une référence Market-Cash.

Aucun partenaire externe n'intervient.

## Retrait client (cash-out)

1. Le client communique son numéro de recharge.
2. L'agent vérifie l'identité affichée.
3. L'agent choisit devise et montant.
4. L'agent confirme avec son PIN.
5. Le serveur exécute atomiquement :
   - débit du wallet client ;
   - crédit du float agent ;
   - transaction + ledger + audit.
6. L'agent remet ensuite le cash au client.

## Sécurité

Le navigateur ne modifie jamais `wallet_accounts`. Les mouvements de soldes sont réalisés par Firebase Admin dans des transactions Firestore. Le PIN n'est jamais journalisé. Une clé d'idempotence est utilisée pour réduire le risque de double opération.

Avant production réelle, ajouter impérativement : App Check, plafonds journaliers, limitation des tentatives PIN, procédures de réconciliation, gestion des annulations/corrections contrôlées, contrôle réglementaire/KYC et supervision anti-fraude.

## Collections serveur

- `wallet_accounts`
- `wallet_recharge_numbers`
- `wallet_transactions`
- `ledger_entries`
- `agent_profiles`
- `audit_events`

## Cartes

Le wallet reste séparé des cartes.

- **Visa** : virtuelle, partenaire issuer futur.
- **Carte physique Market-Cash** : réseau fermé Market-Cash, devise USD ou CDF, titulaire, numéro 16 chiffres, Card ID Market-Cash, code de sécurité 3 chiffres, QR/NFC, sans expiration au lancement.

Les données secrètes de carte physique devront être générées et protégées côté backend lors de leur implémentation, jamais créées dans React ni placées dans les logs.
