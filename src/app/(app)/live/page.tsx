import { LiveCallClient } from "@/components/LiveCallClient";
import { listSamples } from "@/lib/samples";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const samples = await listSamples();
  const defaultSlug =
    samples.find((s) => s.slug === "basecamp-fireflies")?.slug ||
    samples[0]?.slug ||
    "acme-pricing-pushback";

  return <LiveCallClient samples={samples} defaultSlug={defaultSlug} />;
}
