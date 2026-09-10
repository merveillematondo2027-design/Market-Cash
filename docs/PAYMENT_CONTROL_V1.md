# Market-Cash Payment Control V1

## Objectif

Market-Cash devient le centre de contrôle des paiements Mobile Money. Une preuve envoyée par un client ne valide jamais un paiement à elle seule. La validation repose sur un rapprochement avec un SMS réellement reçu sur le téléphone administratif qui contient les SIM marchandes Market-Cash.

## Architecture

1. Le téléphone administratif Market-Cash reçoit le SMS opérateur.
2. La couche Android native interne `android-admin` reçoit le SMS et le transmet au callable `paymentBridgeIngestSms`.
3. Le backend normalise le fournisseur, le montant, la devise, le numéro client et la référence transaction.
4. Le document est conservé dans `payment_sms_events` avec une empreinte SHA-256 anti-doublon.
5. L'administrateur ouvre **Admin > Contrôle paiements**.
6. `adminVerifyPaymentEvidence` compare les informations fournies par le client avec les événements réellement reçus.
7. Une transaction validée doit être marquée `consumed` via `adminConsumePaymentEvent` au moment où le crédit ou la commande est effectivement exécuté.

## Fournisseurs reconnus V1

- M-Pesa
- Airtel Money
- Orange Money
- Afrimoney

Les parseurs sont volontairement tolérants mais une transaction incomplète passe en `review` au lieu d'être automatiquement considérée comme valide.

## Collections

### `payment_sms_events/{fingerprint}`

Champs principaux :

- `source`: `android_sms_bridge`
- `deviceId`
- `senderAddress`
- `rawBody`
- `rawBodyHash`
- `simSlot`
- `subscriptionId`
- `receivedAt`
- `provider`
- `amount`
- `currency`
- `customerPhone`
- `transactionId`
- `parseStatus`: `ready | review`
- `status`: `received | review | consumed`
- `consumed`
- `matchedOrderId`
- `matchedUserId`

Le frontend admin dispose uniquement du droit de lecture. Les écritures passent par les Cloud Functions afin qu'un navigateur ou un client ne puisse pas fabriquer de faux SMS reçus.

## Fonctions Cloud

### `paymentBridgeIngestSms`

Ingestion d'un SMS reçu sur le téléphone Market-Cash. La V1 est protégée par le rôle `admin_general` et la couche Android conserve localement les événements qui n'ont pas pu être synchronisés. Une V2 ajoutera l'enrôlement cryptographique de l'appareil et la signature de chaque événement.

### `adminVerifyPaymentEvidence`

Recherche une correspondance et produit un score basé sur :

- référence transaction ;
- montant ;
- devise ;
- téléphone client ;
- fournisseur ;
- transaction non déjà consommée ;
- fraîcheur de l'événement.

### `adminConsumePaymentEvent`

Marque atomiquement une transaction comme utilisée. Toute deuxième tentative échoue, ce qui empêche la réutilisation d'une preuve réelle sur plusieurs commandes.

## Couche Android interne intégrée

Le dossier `android-admin` appartient au même dépôt Market-Cash. Il ne s'agit pas d'un second produit indépendant : c'est la variante Android administrateur de Market-Cash destinée au téléphone de contrôle des paiements.

Fonctions déjà intégrées :

- demande du rôle application SMS par défaut ;
- permissions `RECEIVE_SMS` et `READ_SMS` ;
- réception automatique via `SMS_DELIVER` / `SMS_RECEIVED` ;
- récupération de l'expéditeur, du corps, de l'heure, du slot SIM et de la subscription ;
- identifiant persistant du téléphone Market-Cash ;
- transmission vers `paymentBridgeIngestSms` ;
- file locale `PendingSmsStore` lorsque Firebase ou Internet n'est pas disponible ;
- reprise de synchronisation à la prochaine ouverture de l'application.

Le fichier Firebase Android `google-services.json` doit être fourni uniquement dans l'environnement de build et ne doit pas être versionné publiquement.

## Règles de sécurité

- Le SMS original n'est visible que par l'administrateur général.
- Aucun utilisateur client ne peut écrire dans `payment_sms_events`.
- Une capture d'écran n'est jamais une source d'autorité.
- Une transaction consommée ne peut pas être réutilisée.
- Les SMS non synchronisés restent dans la file locale jusqu'à reprise de connexion.
- L'étape suivante de sécurité est l'enrôlement de l'appareil et la signature cryptographique des événements.

## Principe de crédit

Cette V1 ne crédite volontairement aucun wallet directement. Le rapprochement et l'exécution financière restent séparés. Lors du raccordement à la recharge Market-Cash, le flux devra être atomique : vérifier l'événement, exécuter le crédit via le moteur financier existant, puis consommer l'événement avec l'identifiant de commande correspondant.
