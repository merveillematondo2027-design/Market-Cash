# Market-Cash Payment Control V1

## Objectif

Market-Cash devient le centre de contrôle des paiements Mobile Money. Une preuve envoyée par un client ne valide jamais un paiement à elle seule. La validation repose sur un rapprochement avec un SMS réellement reçu sur le téléphone administratif qui contient les SIM marchandes Market-Cash.

## Architecture

1. Le téléphone administratif Market-Cash reçoit le SMS opérateur.
2. La future couche Android native Market-Cash transmet le SMS au callable `paymentBridgeIngestSms`.
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

Ingestion d'un SMS reçu sur le téléphone Market-Cash. V1 est protégée par le rôle `admin_general`. Avant utilisation en production sur un téléphone dédié, la V2 remplacera cette authentification interactive par l'enrôlement de l'appareil et une signature cryptographique de chaque événement.

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

## Règles de sécurité

- Le SMS original n'est visible que par l'administrateur général.
- Aucun utilisateur client ne peut écrire dans `payment_sms_events`.
- Une capture d'écran n'est jamais une source d'autorité.
- Une transaction consommée ne peut pas être réutilisée.
- La future couche Android doit enregistrer le téléphone, signer les événements et fonctionner en file d'attente hors ligne.

## Prochaine couche Android

Market-Cash reste un seul produit. La PWA actuelle demeure l'interface principale, tandis qu'une couche Android native interne sera ajoutée au même dépôt pour le téléphone administratif. Elle devra :

- pouvoir être choisie comme application SMS par défaut sur le téléphone dédié ;
- recevoir les SMS entrants ;
- identifier la SIM / subscription ;
- conserver une copie locale sécurisée ;
- synchroniser les événements vers Market-Cash ;
- reprendre automatiquement la synchronisation après une coupure Internet ;
- ne transmettre au cloud que les SMS reconnus comme liés aux paiements.

## Principe de crédit

Cette V1 ne crédite volontairement aucun wallet directement. Le rapprochement et l'exécution financière restent séparés. Lors du raccordement à la recharge Market-Cash, le flux devra être atomique : vérifier l'événement, exécuter le crédit via le moteur financier existant, puis consommer l'événement avec l'identifiant de commande correspondant.
