// Fixture notifications — events whose real producers (weekly digest cron,
// template publishing) aren't wired to an in-app store yet. Clearly labeled
// sample data; dates are fixed so rendering is deterministic.

import type { AppNotification } from "@/lib/notifications";

export const FIXTURE_NOTIFICATIONS: AppNotification[] = [
  {
    id: "fixture:digest-weekly",
    kind: "digest",
    title: "Weekly coaching digest is ready",
    detail:
      "Trait trends and drills refreshed for every rep with scored calls this week.",
    at: "2026-08-11T09:00:00.000Z",
    href: "/reps",
    sample: true,
  },
  {
    id: "fixture:template-published",
    kind: "template",
    title: "New template published",
    detail:
      '"Pricing follow-up" is live in the template library and routing on pricing calls.',
    at: "2026-08-10T15:30:00.000Z",
    href: "/templates",
    sample: true,
  },
];
