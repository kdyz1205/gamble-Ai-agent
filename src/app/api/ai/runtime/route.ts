import {getAuthUser,unauthorized} from "@/lib/auth";
import {aiRuntimeCapabilities} from "@/lib/ai/runtime-capabilities";

export const dynamic="force-dynamic";
/** Live provider policy facts, never keys, cookies or subscription identity. */
export async function GET(){
  if(!await getAuthUser())return unauthorized();
  return Response.json({capabilities:aiRuntimeCapabilities()},{
    headers:{"Cache-Control":"private, no-store"},
  });
}
