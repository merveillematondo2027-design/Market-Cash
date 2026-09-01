# Google AI Studio — point de synchronisation

Branche de travail prête à fusionner : `chatgpt/wallet-foundation-v1`.

Après fusion dans `main`, resynchroniser/importer la branche `main` dans Google AI Studio. Le comportement attendu après connexion client est : `RBAC_ROUTE role=client route=/client/home`.

La barre client doit afficher exactement : Accueil, Cartes, e-SIM, Crypto, Profil. L'en-tête conserve Notifications et Menu. Le menu donne notamment accès au Wallet et à l'aide.

Si Google AI Studio affiche encore `route=/client/wallet` ou la navigation `Cartes / Aides / Profil`, il exécute une révision antérieure et doit être resynchronisé sur le dernier `main`.
