import { HomeClient } from "@/components/HomeClient";
import { listSamples } from "@/lib/samples";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const samples = await listSamples();
  return <HomeClient samples={samples} />;
}
