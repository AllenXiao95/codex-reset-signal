# Generic webhook contract v1

For each configured HTTPS endpoint, the monitor sends JSON containing:

- `schema_version`: `1`
- `delivery_id`: deterministic SHA-256 of the post identity and content version
- `timezone`: configured IANA output timezone
- `post`: `id`, optional `canonicalId`, `text`, `createdAt`, `url`, `media`
- `events`: array of `{type, status, evidence, time}`
- `text`: ready-to-send Chinese notification with the original post

`type` is `reset`, `bank_credit`, `bank_expiry`, or `mention`.
`status` is `scheduled`, `completed`, `announced`, or `uncertain`.
`time` contains `kind`, UTC ISO `start` / `end` or null, verbatim `evidence`, and optional `note`.
Time kinds are `exact`, `window`, `date`, `unknown`, and `observed`. A `date` range ends at the next local midnight, exclusively. An `observed` timestamp is the publication time, not a verified account reset time.

The same `delivery_id` is also sent as the `Idempotency-Key` header. Persist this key before or transactionally with enqueueing your own work. Return a 2xx only after accepting the payload durably. Repeated requests must not result in repeated bot messages. Content corrections have a different key.

With `WEBHOOK_SECRET`, `X-Reset-Signature` equals `sha256=<hex HMAC-SHA256(secret, raw request bytes)>`. Verify against the exact bytes, using constant-time comparison, before JSON processing. Deduplicate delivery IDs to prevent replay; this version does not supply a timestamp-based replay window. Keep the endpoint HTTPS and protect it with a strong secret.

No redirect is followed. Non-2xx, timeout, or transport failure leaves this target pending for the next poll. Never place credentials in log output. Rotate the HMAC secret independently of the endpoint URL.

A bridge to NoneBot, Feishu, WeCom or Apprise API should verify and deduplicate this payload, then map `text` to that platform's notification contract. Those platforms are not native adapters in v1. A configured URL is an operator-trusted outbound destination; this CLI is not a public service accepting arbitrary URLs from users.
