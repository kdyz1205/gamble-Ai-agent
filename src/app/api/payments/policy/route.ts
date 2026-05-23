import { NextRequest } from "next/server";
import { paymentJurisdictionFromRequest, paymentPolicyStatus } from "@/lib/payment-policy";

export async function GET(req: NextRequest) {
  const jurisdiction = paymentJurisdictionFromRequest(req);
  return Response.json(paymentPolicyStatus(jurisdiction));
}
