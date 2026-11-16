# Program Capacity & Invoice Reservation

> Running it and walking the flow by hand: **[GETTING_STARTED.md](GETTING_STARTED.md)**.

A service that keeps one number honest: how much of a financing program's credit limit is still
available.

Treasury owns the limit and sends it over Kafka. Clients reserve capacity for an invoice over HTTP
and release it when the invoice is repaid. Treasury periodically sends a full statement of a
program, and the service reconciles its own ledger against it.

```
treasury ──Kafka──▶  credit limit        ┌──────────────────┐
         ──Kafka──▶  program statement   │ program capacity │ ◀──HTTP──  clients
                                         └──────────────────┘            reserve / release
```

- **Node 22**, NestJS 12, TypeScript 6 (ESM)
- **PostgreSQL 17** with Drizzle ORM; money is `numeric`, never a float
- **Kafka** (Redpanda locally), kafkajs
- **zod** for every boundary: HTTP requests, Kafka messages, environment

---

## Run it locally

```bash
cp .env.example .env     # the defaults match docker-compose
docker compose up -d     # Postgres + Redpanda
npm ci
npm run db:migrate       # schema + the currency reference data
npm start                # http://localhost:3000, docs at /docs
```

One more step before the API answers anything: a program exists only because treasury described
one, so a fresh database needs a credit limit message first.

**[GETTING_STARTED.md](GETTING_STARTED.md)** has that step and the whole flow by hand — reserve,
retry, release, reconcile against a statement, park a bad message and read it back from the dead
letter topic — with the real responses, plus what to check when something does not work.

---

## HTTP API

Interactive documentation: **`/docs`** (OpenAPI JSON at `/docs-json`), generated from the same zod
schemas that validate the requests, so it cannot drift from the code. The schemas reach validation
through Nest's `StandardSchemaValidationPipe`, declared on the parameter itself
(`@Body({ schema })`), and the parsed value is what the handler receives — which is where branded
identifiers are minted.

| Method   | Path                                                       | What it does                                                                                                                                                        |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/programs/{programCode}/reservations`                     | Holds capacity for an invoice. Same invoice again returns the first reservation; different terms, an already released invoice, or one treasury reserved is a `409`. |
| `DELETE` | `/programs/{programCode}/reservations/{invoiceExternalId}` | Releases exactly the amount that was held. Releasing twice changes nothing.                                                                                         |
| `GET`    | `/programs/{programCode}/capacity`                         | Limit, reserved, available, and how fresh the last treasury statement is.                                                                                           |

Amounts travel as **strings** in both directions (`"25000.00"`), because a JSON number cannot carry
`9007199254740993.00` without losing a digit.

Every failure answers `{ errorCode, details? }`: a code a client can branch on, and whatever the
refusal knows — the same shape a dead letter carries. That includes failures raised before our code
runs: an unknown route is `ROUTE_NOT_FOUND`, a body that is not JSON is `INVALID_REQUEST`. Every 5xx
answers `INTERNAL_ERROR` alone; what broke is logged, not sent.
A validation refusal lists every field in `details.issues`. The HTTP status says how to react, the code says
what happened, and the OpenAPI document lists exactly which codes each response can carry:

```json
{
  "errorCode": "INSUFFICIENT_PROGRAM_CAPACITY",
  "details": { "requestedAmount": "25000.00", "programCode": "PRG-001" }
}
```

Authentication is HTTP Basic on every endpoint except the documentation — see
[Authentication](#authentication).

---

## Kafka

| Topic                              | Group                           | Message                                          |
| ---------------------------------- | ------------------------------- | ------------------------------------------------ |
| `treasury.program-credit-limit.v1` | `program-capacity.credit-limit` | A program's limit, absolute, with a version      |
| `treasury.program-statement.v1`    | `program-capacity.statement`    | A program's whole position as of a timestamp     |
| `*.dlq`                            | —                               | Where a message that can never succeed is parked |

```bash
docker compose exec -T redpanda rpk topic produce treasury.program-statement.v1 --key PRG-001 <<'JSON'
{"type":"PROGRAM_STATEMENT","programCode":"PRG-001","currency":"USD","creditLimit":"900000.00","reservations":[{"invoiceId":"INV-100","amount":"27300.00"}],"appliedThroughOperationNumber":1,"version":2,"asOf":"2026-11-16T12:00:00Z"}
JSON
```

```json
{
  "type": "PROGRAM_STATEMENT",
  "programCode": "PRG-001",
  "currency": "USD",
  "creditLimit": "1000000.00",
  "reservations": [{ "invoiceId": "INV-100", "amount": "27250.00" }],
  "appliedThroughOperationNumber": 128,
  "version": 50,
  "asOf": "2026-11-16T12:00:00Z"
}
```

**The HTTP status code is the retry decision.** A consumer has nobody to answer, so the class of the
failure decides what happens to the message:

| Failure       | Meaning                                                    | What happens                                               |
| ------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| 4xx           | The message is wrong and will be wrong on every redelivery | Dead letter topic, offset committed, consumption continues |
| anything else | We are broken (database down, bug)                         | Rethrown, offset not committed, the broker redelivers      |

A dead letter carries the error code, the failure details, the topic, partition, offset, and the
**payload verbatim** — what made a message unreadable is often exactly what a schema could not read.

Consumers read `fromBeginning: true` on purpose: every message carries absolute state and a
monotonic version, so replaying a topic cannot double-apply anything.

---

## How it stays correct

**The limit cannot be exceeded.** Checking capacity and taking it is one statement, so two
concurrent requests cannot both pass the check:

```sql
UPDATE programs
SET reserved_amount = reserved_amount + $amount,
    last_client_operation_number = last_client_operation_number + 1
WHERE id = $id AND credit_limit - reserved_amount >= $amount
RETURNING last_client_operation_number
```

Zero rows updated means there was no room — a `409`, not a retry.

**Money never touches a float.** Amounts are `numeric(19,4)`, rates `numeric(24,12)`, and in code
both are `ExactDecimal` (a `decimal.js` clone that never prints exponential notation). A value that
would not fit a column without rounding is rejected on write _and_ on read: rounding is a business
decision, not a side effect of a column type.

**Repeating a request is safe.** Reserving the same invoice returns the reservation it already has,
keyed by the invoice's external id within the program — a natural key that cannot drift from the
state, because it _is_ the state. Releasing an already released reservation changes nothing.

**Repeating a message is safe.** Every treasury message carries a monotonic `version`, compared
against the program's `last_treasury_version` inside the same transaction that writes the change.
That gate rejects more than duplicates: it also rejects stale and out-of-order messages, which a
message id could not tell apart.

**Reconciliation speaks the language of the domain.** A treasury **statement** is matched against our
**ledger** by invoice id, and each outcome has a name a reconciliation analyst would use:

| Case                                                                   | Action                                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Both sides agree                                                       | Nothing                                                                           |
| Amounts differ                                                         | Treasury's amount wins                                                            |
| Only treasury holds it                                                 | Create the reservation (`createdBy = TREASURY`)                                   |
| Only we hold it, and treasury has applied that operation               | Release it                                                                        |
| Only we hold it, and treasury has not read it yet                      | **In transit** — keep it; the next statement will carry it                        |
| We released it, treasury has applied the release, yet still reports it | A **break**: the capacity is not taken again, and the log calls for investigation |

The whole match is decided before anything is written (`planReconciliation`), which is why the table
above is covered by unit tests that need neither a database nor a broker.

---

## Authentication

`Authorization: Basic base64(clientId:secret)` — plain Basic, so `curl -u` works without a wrapper.

**What the server holds.** `API_CLIENTS` carries `clientId:sha256hex` pairs, comma separated. The
secret itself is given to the client once and stored nowhere; the server cannot recover it. A lost
secret is replaced, not recovered.

**Why one unsalted SHA-256 is enough here.** The secret is _generated_ (32 random bytes), not chosen
by a human. A single SHA-256 over a low-entropy password is brute-forced offline; over 32 random
bytes it is not. That is a condition of the scheme, not advice.

**The check** decodes base64, splits on the _first_ colon (a secret may contain one), hashes the
secret, and compares with `timingSafeEqual`. An unknown `clientId` is compared against a fixed
zero buffer, so an unknown client and a wrong secret take the same time — otherwise response time
would tell an attacker which clients exist.

**Rotation** is why the variable is a list: add the new pair next to the old one, move the client,
then remove the old entry. Without an overlap, rotation would mean downtime.

**Deliberately missing:** provisioning (pairs are made by hand — production wants an admin endpoint
or a `clients` table), expiry and scopes, and rate limiting. The documentation at `/docs` is open on
purpose: it describes the contract and carries no program data.

---

## Tests

```bash
npm test          # unit — no containers, milliseconds
npm run test:e2e  # integration + HTTP — Postgres and Redpanda via Testcontainers
npm run lint      # oxlint, type-aware
npm run build
```

| Layer              | What it proves                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| unit               | Decisions that are pure: the reconciliation match, message parsing, amount and limit rules, the 4xx/5xx rule, the dead letter envelope |
| integration        | What only a database can prove: concurrency, locking, `numeric` behaviour, transaction boundaries                                      |
| through the broker | A real Redpanda: a published message creates a program, a bad message lands in the dead letter topic, consumption continues            |
| HTTP               | The whole app through the pipe, including authentication and the open documentation route                                              |

Tests are checked with mutation testing rather than coverage: a boundary is only proven when
flipping it (`<=` → `<`, a removed guard, `.strict()` → `.loose()`) makes exactly one test fail.

---

## Assumptions

The task left these open; each one is a decision, not an oversight.

1. **Treasury owns programs and limits.** A program appears because treasury described one, never
   because a client asked. Its messages carry absolute values and a monotonic version per program.
2. **One statement is one program.** "Bulk" is read as a batch of messages, each holding one
   program's full position. Supporting an envelope with many programs is a parsing change.
3. **Repayment is whole.** The task describes release as "when repaid, the amount is released back",
   so a release returns the full amount. Partial repayment would need its own table of releases; the
   current schema does not block that.
4. **The invoice's external id is unique within a program**, across all submitters — the same invoice
   must not be reserved twice by two of them. If two suppliers number invoices independently and
   collide, we would treat them as one invoice. Worth confirming with the business.
5. **The converted amount is rounded to the program currency's minor units, half-up.** Treasury sends
   reservation amounts already converted, so storing an exact product would differ from it by a
   fraction on every row and make reconciliation noisy. The rounding mode must match treasury's —
   it is one constant.
6. **A statement-created reservation records what treasury reported**: the invoice is written in the
   program currency with rate 1, because treasury does not report the original document. If a client
   later submits that invoice with its real currency, the terms conflict (`409`) — on purpose, a
   human should look.
7. **Treasury may lower a limit below what is already reserved.** Available capacity then goes
   negative: new reservations are refused, existing ones are not cancelled.
8. **Currencies are reference data**, loaded by a migration. A program in an unknown currency is
   refused rather than invented.
9. **One program's throughput is bound to its row.** The atomic update serialises reservations of the
   same program; different programs never block each other. That is the price of a limit that cannot
   be exceeded. Every writer — reserve, release, reconciliation — takes the program row before any
   reservation row, so two of them cannot deadlock.
10. **Treasury applies our operations in number order, without gaps.** A statement's
    `appliedThroughOperationNumber` is read as a high-water mark: every operation up to it is assumed
    applied. If treasury could apply `N+1` before `N`, a statement would release `N` as "seen and no
    longer held". That makes ordered delivery a requirement on our side too, so the outbox that
    replaces the publishing stub must send operations in operation-number order.

---

## Known gaps

What a production version needs, and where the seam already is. Each one is marked `TODO` at the
place it lives.

**Exchange rates are fixed in code** — `src/modules/exchange-rate/providers/mocked-exchange-rate.provider.ts`
A real provider refreshes on a schedule, caches, and has an answer for an unreachable source.
Callers depend on the `ExchangeRateProvider` port, and a missing rate already has a path (`422`), so
only that class changes.

**Our operations are logged, not published** — `src/modules/treasury/publishers/logged-treasury-operation.publisher.ts`
The task describes Kafka as inbound only. The stub loses an operation if the process dies between the
commit and the publish; production needs delivery that cannot diverge from the state — a
transactional outbox (`@nestjs/outbox` does exactly this), or a relay reading `reservations` by
operation number, which is already a complete journal. The interface stays as it is: only the
provider behind `TREASURY_OPERATION_PUBLISHER` changes.

**A 5xx is retried forever** — `src/kafka/services/kafka-consumer.service.ts`
Right for a database that is down, wrong for a bug that will never succeed. Production needs an
attempt limit per message: after N redeliveries it goes to the dead letter topic whatever the class
of the failure.

**A consumer that stops for good goes unnoticed** — `src/kafka/services/kafka-consumer.service.ts`
kafkajs logs the crash and the process keeps serving HTTP while the group's lag grows. Production
needs a health probe over group membership (`@nestjs/terminus`) so the platform restarts the pod,
which also catches a consumer that restarts in a loop without making progress.

**A break does not resolve itself.** A reservation released with an operation treasury has
applied, yet still held in its statements, stays released and is reported as a break on every
statement until a person decides. There is deliberately no automatic re-activation: taking capacity
again on treasury's word would hide the disagreement it is supposed to surface.

**No audit trail of capacity changes.** History lives in `reservations` (`createdBy`, `releasedBy`,
timestamps, status) and in structured logs; treasury-driven changes are not recorded as rows.

---

## Project layout

```
src/
  config/        app composition: env schema, Swagger, Kafka start-up
  database/      Drizzle schema, migrations, transaction service, money columns
  kafka/         client, compression codecs, producer, consumer runner, dead letter handling
  modules/
    program/     limits and capacity
    reservation/ reserve, release, reconcile, and the statement consumer
    invoice/     invoices submitted for financing
    currency/    the currency reference data
    exchange-rate/
    treasury/    the treasury contract: topics, message schemas, parsers, outbound stub
    auth/        the API client guard
  shared/        exceptions, zod schemas, ExactDecimal, OpenAPI helpers
test/            harness: containers, builders, fixtures, helpers
GETTING_STARTED.md  how to run it and walk the flow by hand
```
