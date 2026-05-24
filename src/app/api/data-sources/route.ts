import { dataSourceAdapterCatalog } from "@/lib/data-source-adapters";
import { summarizeDataSourceCoverage } from "@/lib/data-source-registry";

export async function GET() {
  return Response.json({
    coverage: summarizeDataSourceCoverage(),
    sources: dataSourceAdapterCatalog(),
  });
}
