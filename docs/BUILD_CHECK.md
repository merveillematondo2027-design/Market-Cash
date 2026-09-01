# Vérification avant fusion

La CI GitHub exécute automatiquement :

```bash
npm ci
npm run lint
npm run build
```

La fusion dans `main` doit être considérée prête à synchroniser dans Google AI Studio uniquement lorsque le workflow `Market-Cash Build` est vert.
