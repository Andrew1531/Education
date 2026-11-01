# School outreach delivery updates

After merging and deploying the API, configure a Resend webhook pointing to the
API's public `/api/webhooks/resend` endpoint (not the static frontend). Subscribe
to `email.delivered`, `email.bounced`, `email.complained`, `email.failed` and
`email.delivery_delayed`. Save that webhook's signing secret as the server secret
`RESEND_WEBHOOK_SECRET`, then restart the API. The sending API credential is not
the webhook signing secret. Never put either secret in frontend configuration.

The endpoint fails closed with 503 when the signing secret is missing. It uses
Svix to verify the original request bytes and the signed timestamp with its
default five-minute tolerance. Invalid signatures receive 400; database failures
receive 503 so Resend can retry the event. This never resends the email.

Startup creates the delivery-event table and index idempotently. Events are
deduplicated by their signed event ID; only provider message ID, delivery state
and timestamps are stored, not message bodies or recipient details. Early events
can arrive before send results are saved. Authenticated history joins only on
provider IDs already stored for the requesting user, including legacy history.
Original acceptance/rejection/unknown/not-attempted outcomes are not rewritten.

Complaints take precedence over bounces/failures, then delivery, then delays.
Within each priority the most recent provider timestamp wins, with event ID as a
stable tie-breaker. This intentionally prevents late or out-of-order delivery
events from hiding adverse outcomes. Delivery means acceptance by the recipient's
mail server, not that anyone read the message, replied, or granted admission.
The UI refreshes history every 30 seconds while visible and supports EN/ES.
No webhook handles incoming school replies or starts automatic resends.
