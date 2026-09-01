# Market-Cash Wallet Architecture v1

## Product boundary

Market-Cash is the fintech product. GMH APIs is a separate general API platform and is only the orchestration/courier layer whenever Market-Cash must talk to an external partner.

Market-Cash owns the customer experience, wallet account, ledger, KYC state, limits, local payment credentials, transaction history and product rules. GMH APIs must never become the source of truth for a customer's Market-Cash balance.

## Payment instruments

### Market-Cash physical card — local closed loop

The physical Market-Cash card is **not Visa**. It represents the customer's Market-Cash wallet and is intended for local payments on Market-Cash-compatible terminals.

Supported credential model:

- Market-Cash local payment identifier (`MCW-...`)
- QR payload pointing to the wallet credential
- NFC closed-loop credential for Market-Cash terminals
- no PAN/CVV/Visa branding required for the local physical card

The terminal must send a payment authorization request to the trusted Market-Cash backend. The terminal itself must never be allowed to change a wallet balance.

### Market-Cash Visa — virtual only

Visa remains a **virtual card inside the Market-Cash application**. The future issuer/bank/processor integration is a partner rail and therefore goes through the trusted Market-Cash backend and, where chosen, GMH APIs as orchestration layer.

The virtual Visa is an instrument linked to the Market-Cash wallet; it is not the wallet itself.

## Money model

Never treat `users.balance` as money. Market-Cash requires an immutable double-entry ledger.

Recommended accounts:

- customer wallet liability
- partner settlement account: M-Pesa
- partner settlement account: bank
- agent float
- merchant settlement
- authorization holds
- fees/revenue
- reconciliation suspense

Displayed balance:

- ledger balance
- held amount
- available balance = ledger balance - active holds

Only a trusted backend may create ledger postings or alter balances.

## Partner orchestration through GMH APIs

GMH APIs is reserved for all external API actions, for example:

- M-Pesa collect / payout
- bank transfer
- Visa issuer processor / banking partner
- identity/KYC provider when applicable
- SMS/email provider when applicable

Pattern:

`Market-Cash app -> Market-Cash backend -> GMH APIs -> Partner -> webhook -> GMH APIs -> Market-Cash backend -> ledger -> client`

The mobile/web client must never receive provider secrets and must never credit itself from a provider response supplied by the browser.

## Mobile Money top-up

1. Customer enters a mobile-money number and amount.
2. Market-Cash backend creates an immutable payment intent.
3. GMH APIs sends the provider request.
4. Provider asks the customer to confirm using the provider's own authentication/PIN flow.
5. Provider webhook is verified by GMH APIs.
6. Market-Cash backend independently verifies the final state and idempotency key.
7. Ledger posts only after settlement/confirmed success.
8. Customer wallet view updates in real time.

Statuses:

`created -> pending_provider -> awaiting_customer -> processing -> settled`

Terminal states:

`failed | expired | reversed`

## Agent / terminal cash-in

Agents operate with a float account. Cash-in must not create money.

Example: agent float 500 USD, customer gives agent 20 USD cash. After authorization the ledger debits agent float 20 and credits customer wallet liability 20. Agent float becomes 480 USD.

Cash-out is the reverse operation and must enforce float, limits and reconciliation controls.

## Local merchant payment

1. Customer presents Market-Cash physical card / QR / NFC credential.
2. Terminal creates a signed payment request.
3. Backend resolves the wallet credential.
4. Risk/limits/status checks run.
5. Customer authentication is requested when policy requires it.
6. Ledger atomically transfers value from customer wallet to merchant settlement.
7. Terminal receives approved/declined and a Market-Cash reference.

No terminal may submit a final balance value.

## Virtual Visa payment

The Visa rail follows authorization, hold, capture/clearing and reversal semantics.

- authorization reserves wallet funds
- capture/settlement turns the hold into a ledger debit
- reversal releases the hold
- refund creates a separate credit transaction

The issuer/banking partner remains authoritative for Visa network messages while Market-Cash remains authoritative for its internal wallet ledger.

## Security invariants

- no provider secret in React/browser
- no balance mutation by client applications
- no CVV/PAN in application logs
- idempotency key on every external money operation
- verified partner webhooks
- signed terminal requests
- strong admin audit trail
- KYC/limits before regulated actions
- reconciliation of wallet liabilities against safeguarded/settlement funds

## Collections / future backend model

Frontend read models prepared in this repository:

- `wallets/{walletId}` — wallet read model
- `wallet_transactions/{transactionId}` — transaction history/read model
- `wallet_requests/{requestId}` — orchestration requests awaiting trusted execution

These collections are not the accounting ledger. The production ledger should live behind trusted server-side code and expose only controlled read models to Firestore/client applications.

## Implementation phases

### Phase 1 — Wallet shell

- wallet client home
- zero/default balance view
- local payment identifier + QR
- physical Market-Cash card clearly separated from Visa
- Visa clearly marked virtual
- transaction history read model
- GMH APIs integration boundary reserved

### Phase 2 — Market-Cash backend ledger

- double-entry ledger
- holds
- idempotency
- transaction state machine
- admin reconciliation
- wallet limits

### Phase 3 — local terminals / agents

- terminal registration
- agent float
- QR authorization
- NFC closed-loop credential
- merchant settlement
- cash-in / cash-out

### Phase 4 — GMH partner connectors

After Market-Cash wallet/backoffice is stable, implement GMH APIs separately and connect M-Pesa, banks and issuer partners.

### Phase 5 — virtual Visa

- issuer/BIN sponsor/processor integration
- virtual credential issuance
- authorization holds
- settlement/reversal/refund synchronization
