# Wallet Foundation v1

Cette version transforme l'espace client en base Fintech sans supprimer les flux historiques.

## Livré
- accueil client fintech ;
- navigation Accueil / Cartes / e-SIM / Crypto / Profil ;
- notifications et menu en haut ;
- wallet local avec routes Envoyer, Recevoir, Recharger, Transactions ;
- QR local et réservation NFC ;
- Visa virtuelle explicitement séparée de la carte physique Market-Cash et marquée Coming soon ;
- e-SIM et Crypto réservés comme futurs services ;
- frontière d'intégration GMH APIs documentée ;
- workflow CI `lint + build`.

## Non simulé
Aucun crédit/débit réel, émission Visa, opération Mobile Money, e-SIM ou Crypto n'est simulé depuis le frontend. Ces opérations devront être exécutées côté backend et, lorsqu'un partenaire externe est nécessaire, orchestrées via GMH APIs.
