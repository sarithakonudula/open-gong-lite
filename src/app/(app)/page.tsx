import { UploadClient } from "@/components/upload/UploadClient";
import { listSamples } from "@/lib/samples";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const samples = await listSamples();
  return <UploadClient samples={samples} />;
}
