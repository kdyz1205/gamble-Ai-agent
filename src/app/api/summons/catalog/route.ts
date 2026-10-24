import {readSummonCatalog} from "@/lib/summons/starter-entitlement";

/** Read-only catalog metadata, no account state or item grants. */
export async function GET(){
  return Response.json(readSummonCatalog(),{
    headers:{"Cache-Control":"public, max-age=300"},
  });
}
