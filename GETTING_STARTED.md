# Getting started

How to run the service locally and walk the whole flow by hand. Every command here was run against
a clean checkout; the responses are the real ones.

You need **Node 22** and **Docker**.

---

## Start it

```bash
cp .env.example .env     # the defaults match docker-compose
docker compose up -d     # Postgres on 5432, Redpanda on 9092
npm ci
npm run db:migrate       # schema + the currency reference data (USD, EUR, JPY, KWD)
```

The API needs a client, and the server keeps only a hash of its secret, so make the pair once:

```bash
SECRET=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))")
HASH=$(node -e "console.log(require('node:crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "$SECRET")

echo "API_CLIENTS=demo:$HASH"   # put this line in .env
echo "$SECRET"                  # the client's secret — it is stored nowhere else
```

```bash
npm start
```

Three things to check: the log ends with `Nest application successfully started`, two consumers are
subscribed, and <http://localhost:3000/docs> opens.

Keep the secret in your shell for the calls below:

```bash
SECRET=<the secret printed above>
```

---

## Walk the flow

### 1. Give the program a limit

Programs are not created over HTTP — treasury owns them. A fresh database has none, so the first
step is a credit limit message:

```bash
docker compose exec -T redpanda rpk topic produce treasury.program-credit-limit.v1 --key PRG-001 <<'JSON'
{"type":"PROGRAM_CREDIT_LIMIT_UPDATED","programCode":"PRG-001","currency":"USD","creditLimit":"777000.00","version":1,"occurredAt":"2026-11-16T10:00:00Z"}
JSON
```

The service logs what it did with it:

```
[TreasuryCreditLimitConsumer] treasury credit limit CREATED { outcome: 'CREATED', programCode: 'PRG-001', creditLimit: '777000', treasuryVersion: '1' }
```

```bash
curl -u demo:$SECRET http://localhost:3000/programs/PRG-001/capacity
```

```json
{
  "programCode": "PRG-001",
  "currencyCode": "USD",
  "creditLimit": "777000",
  "reservedAmount": "0",
  "availableAmount": "777000",
  "lastTreasuryReconciledAt": null
}
```

### 2. Reserve capacity for an invoice

The invoice is in EUR, the program in USD, so the amount is converted and the rate is kept:

```bash
curl -u demo:$SECRET -X POST http://localhost:3000/programs/PRG-001/reservations \
  -H 'content-type: application/json' \
  -d '{"invoiceExternalId":"INV-1","amount":"25000.00","currencyCode":"EUR"}'
```

```json
{
  "invoiceExternalId": "INV-1",
  "reservationId": "4af4ab73-…",
  "status": "ACTIVE",
  "reservedAmount": "27175",
  "exchangeRate": "1.087",
  "reserveOperationNumber": "1",
  "releaseOperationNumber": null
}
```

### 3. Send the same request again

A retry is not a second reservation — the same `reservationId` and the same operation number come
back, and the program's reserved amount does not move:

```json
{"invoiceExternalId":"INV-1","reservationId":"4af4ab73-…","reserveOperationNumber":"1", …}
```

### 4. Try the same invoice with different terms

```bash
curl -u demo:$SECRET -X POST http://localhost:3000/programs/PRG-001/reservations \
  -H 'content-type: application/json' \
  -d '{"invoiceExternalId":"INV-1","amount":"30000.00","currencyCode":"EUR"}'
```

`409` — the same key would then stand for two different things:

```json
{
  "errorCode": "INVOICE_RESERVED_WITH_DIFFERENT_TERMS",
  "details": {
    "invoiceExternalId": "INV-1",
    "reservedAmount": "25000",
    "reservedCurrencyCode": "EUR"
  }
}
```

### 5. Ask for more than the program has

```bash
curl -u demo:$SECRET -X POST http://localhost:3000/programs/PRG-001/reservations \
  -H 'content-type: application/json' \
  -d '{"invoiceExternalId":"INV-2","amount":"800000.00","currencyCode":"USD"}'
```

```json
{
  "errorCode": "INSUFFICIENT_PROGRAM_CAPACITY",
  "details": { "requestedAmount": "800000", "programCode": "PRG-001" }
}
```

### 6. Release it, twice

```bash
curl -u demo:$SECRET -X DELETE http://localhost:3000/programs/PRG-001/reservations/INV-1
```

```json
{
  "invoiceExternalId": "INV-1",
  "status": "RELEASED",
  "reservedAmount": "27175",
  "reserveOperationNumber": "1",
  "releaseOperationNumber": "2"
}
```

Running it a second time answers exactly the same: the release already happened, so there is no
second operation and the capacity is not returned twice.

Reserving the same invoice again is refused — a released invoice holds nothing to hand back:

```json
{ "errorCode": "INVOICE_ALREADY_RELEASED" }
```

### 7. Reconcile against a treasury statement

A statement is treasury's whole picture of the program: its limit, every reservation it holds, and
how far it has read our operations. Reserve something first (step 2), then:

```bash
docker compose exec -T redpanda rpk topic produce treasury.program-statement.v1 --key PRG-001 <<'JSON'
{"type":"PROGRAM_STATEMENT","programCode":"PRG-001","currency":"USD","creditLimit":"900000.00","reservations":[{"invoiceId":"INV-1","amount":"27300.00"},{"invoiceId":"INV-9","amount":"5000.00"}],"appliedThroughOperationNumber":1,"version":2,"asOf":"2026-11-16T12:00:00Z"}
JSON
```

Three things happen at once, and the log says so: `INV-1` is corrected to treasury's amount, `INV-9`
is created as a reservation treasury knows and we did not, and the program's total is recomputed:

```
[TreasuryStatementConsumer] treasury reconciliation APPLIED { outcome: 'APPLIED', programCode: 'PRG-001', creditLimit: '900000', reservedAmount: '32300', reservedAmountDifference: '5125', createdReservations: 1, releasedReservations: 0, correctedReservations: 1, breaks: 0, treasuryVersion: '2' }
```

It is logged as a **warning**, not as info: the statement moved our numbers, which is exactly what a
human should see. `lastTreasuryReconciledAt` now carries the statement's `asOf`.

### 8. Send a message that can never work

The program is in USD; this says EUR:

```bash
docker compose exec -T redpanda rpk topic produce treasury.program-credit-limit.v1 --key PRG-001 <<'JSON'
{"type":"PROGRAM_CREDIT_LIMIT_UPDATED","programCode":"PRG-001","currency":"EUR","creditLimit":"777000.00","version":3,"occurredAt":"2026-11-16T10:00:00Z"}
JSON
```

It is refused, parked, and consumption continues. Read the dead letter topic:

```bash
docker compose exec -T redpanda rpk topic consume treasury.program-credit-limit.v1.dlq --num 1 --offset start
```

```json
{
  "errorCode": "PROGRAM_CURRENCY_CHANGED",
  "details": { "programCode": "PRG-001", "currencyCode": "USD", "messageCurrencyCode": "EUR" },
  "failedAt": "2026-11-16T17:01:11.206Z",
  "topic": "treasury.program-credit-limit.v1",
  "partition": 0,
  "offset": "3",
  "payload": "{\"type\":\"PROGRAM_CREDIT_LIMIT_UPDATED\",…}"
}
```

The payload is kept verbatim, so the parked message explains itself without the original producer.

### 9. Raise the limit

A valid update keeps the program's currency and carries a higher version than the last one applied
(the statement's `2`; the parked EUR message never counted):

```bash
docker compose exec -T redpanda rpk topic produce treasury.program-credit-limit.v1 --key PRG-001 <<'JSON'
{"type":"PROGRAM_CREDIT_LIMIT_UPDATED","programCode":"PRG-001","currency":"USD","creditLimit":"1000000.00","version":3,"occurredAt":"2026-11-16T13:00:00Z"}
JSON
```

The log reads `treasury credit limit APPLIED` with `previousCreditLimit: '900000'` and
`creditLimit: '1000000'`, and the capacity call shows `availableAmount` up by `100000`. Send the same
message again and it is `IGNORED`: its version is no longer newer.

---

## Looking around

```bash
# what is in the database
docker compose exec postgres psql -U fintech -d fintech -c 'TABLE programs'
docker compose exec postgres psql -U fintech -d fintech -c 'SELECT status, count(*) FROM reservations GROUP BY status'

# what is on the broker
docker compose exec redpanda rpk topic list
docker compose exec redpanda rpk group describe program-capacity.statement   # lag per partition
```

The OpenAPI document is at <http://localhost:3000/docs> and needs no credentials — it describes the
contract and carries no program data.

---

## When something does not work

| What you see                           | Why                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `PROGRAM_NOT_FOUND` on every call      | No treasury message yet — do step 1; programs are never created over HTTP                 |
| `401` with the right secret            | `API_CLIENTS` holds `clientId:sha256hex`, not the secret itself; regenerate the pair      |
| `CURRENCY_NOT_FOUND`                   | The currency is not in the reference data — `npm run db:migrate` loads USD, EUR, JPY, KWD |
| The app exits right after start        | `KAFKA_BROKERS` or `DATABASE_URL` is wrong: both are checked on boot, on purpose          |
| The app exits while the broker is down | The producer connects on boot, so an unreachable broker is reported at start, not later   |
| Messages produced but nothing happens  | Check the group lag with `rpk group describe`, and the log for a kafkajs `Crash` record   |

Start over from an empty state:

```bash
docker compose down -v && docker compose up -d && npm run db:migrate
```

---

## Tests

```bash
npm test          # unit — no containers, runs in milliseconds
npm run test:e2e  # integration and HTTP — starts Postgres and Redpanda via Testcontainers
npm run lint
npm run build
```

`npm run test:e2e` needs Docker and takes about a minute: it boots the app against throwaway
containers, publishes real messages, and reads the dead letter topic back.
