# Market-Cash — Fondation Fintech

## Navigation client
Accueil · Cartes · e-SIM · Crypto · Profil. Notifications et menu restent accessibles dans l'en-tête.

## Wallet local
Le wallet Market-Cash est le compte de valeur local. Les soldes doivent être produits par un ledger backend, jamais calculés ou crédités directement par React/Firestore client.

Routes réservées : `/client/wallet`, `/client/wallet/send`, `/client/wallet/receive`, `/client/wallet/transactions`, `/client/wallet/top-up`.

## Carte physique Market-Cash
La carte physique Market-Cash n'est pas une Visa. Elle représente le wallet local et est destinée aux paiements locaux sur le réseau Market-Cash, notamment QR et NFC lorsque le terminal compatible sera disponible.

## Visa virtuelle
La Visa reste exclusivement virtuelle dans l'application. L'émission, le funding et les paiements internationaux nécessitant un partenaire bancaire/issuer doivent être intégrés côté serveur.

## GMH APIs
Toute opération qui dépend d'une API partenaire doit réserver GMH APIs comme moteur commissionnaire/orchestrateur : Market-Cash -> backend Market-Cash -> GMH APIs -> fournisseur/partenaire -> GMH APIs -> backend Market-Cash -> ledger et interface client.

Aucune clé partenaire ne doit être exposée dans le frontend.

## e-SIM et Crypto
Les espaces produit sont présents dans la navigation mais restent `Bientôt disponible` jusqu'à activation des partenaires, de la conformité et des services backend correspondants.
