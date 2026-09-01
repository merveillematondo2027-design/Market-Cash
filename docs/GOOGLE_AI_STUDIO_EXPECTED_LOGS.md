# Logs attendus après synchronisation

Après connexion d'un client et validation PIN :

```text
[AUTH_FLOW_COMPLETE] ... role: client
[RBAC_ROUTE] role=client route=/client/home
[PIN_VERIFIED]
```

La présence répétée de `CARD_UI_RENDER` reste normale lorsqu'on ouvre la page Cartes historique. Elle ne doit plus être le premier écran client après authentification.
