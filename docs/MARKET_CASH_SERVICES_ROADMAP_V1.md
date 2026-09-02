# Market-Cash Services Roadmap v1

## Product principle

Market-Cash is built around one financial identity and a principal USD/CDF wallet. Services are activated progressively according to KYC, limits, partner availability and operational readiness.

The client must never directly mutate a monetary balance. Money movements are executed by trusted backend code and represented through controlled read models.

External rails (Mobile Money, banks, future card issuer, eSIM and bill providers) are orchestrated through MHT APIs when integrations become available. MHT APIs is not the source of truth for Market-Cash balances.

## V1 — core services

1. **Wallet** — available/held/ledger balance, USD/CDF, Market-Cash ID and QR.
2. **Deposit / top-up** — Mobile Money or bank payment intent; manual proof flow may remain as an operational fallback until partner APIs are live.
3. **Withdrawal** — request from wallet to an approved external rail; KYC, balance, fee and limit checks are mandatory.
4. **Market-Cash transfer** — send to another Market-Cash identity; backend resolves recipient before execution.
5. **Cards** — Market-Cash local closed-loop card and separately a future virtual Visa partner instrument.
6. **Unified history** — deposits, withdrawals, transfers, card funding, payments, fees and reversals.
7. **Account / KYC / security** — identity, verification status, limits, PIN/security, trusted devices and account controls.
8. **Support** — help and transaction-linked assistance.

## V2 — commerce and savings

- **Market-Cash Pay:** payment link, QR request, fixed-amount request and invoice.
- **Merchant profile:** merchant settlement/read model and transaction history.
- **Personal savings:** goal-based reserved savings using backend ledger accounts, never a client-side balance field.
- **Likelemba:** create/join group by code or QR, contribution schedule, members, beneficiary order, audit trail and group rules. Money execution remains server-side.

## V3 — partner services

- eSIM catalog and purchases through an approved provider.
- gift-card catalog through an approved provider.
- bill payment through approved providers.
- credit/advance only after legal/partner framework and a dedicated eligibility/risk system are ready.

Crypto is not part of the current Market-Cash roadmap.

## Unified transaction statuses

`created -> pending -> processing -> settled`

Terminal/exception states: `failed | cancelled | expired | reversed | refunded`.

Every monetary operation requires a unique Market-Cash reference, idempotency key, timestamps, actor/source, currency, gross amount, fees, net amount and audit metadata.

## Eligibility and limits

The UI may show a user's current limits and eligibility, but it must not promise credit. A future Market-Cash eligibility engine can use only approved, lawful signals and partner rules. Until lending is operational, borrowing limit remains unavailable/zero and the UI describes the feature as not yet active.

## Client navigation target

Primary navigation stays compact: **Accueil · Historique · Compte**.

Accueil exposes the wallet and high-frequency actions. Secondary services are shown as service tiles/cards rather than adding many bottom-navigation entries.

Suggested home actions:

- Envoyer
- Déposer
- Retirer
- Recevoir
- Payer
- Cartes
- Épargne
- Collecter

Partner-dependent future services remain clearly marked as unavailable/coming soon until their backend is real.

## Implementation order

1. Preserve and stabilize the existing wallet shell, KYC gate and card flow.
2. Complete trusted ledger/state-machine backend before enabling real withdrawals or arbitrary money transfers.
3. Add unified transaction history and account limits/security views.
4. Add Market-Cash Pay request/QR models.
5. Add savings/Likelemba models after ledger controls are stable.
6. Connect external providers through MHT APIs.
7. Add partner products only after contracts, compliance and reconciliation are ready.
