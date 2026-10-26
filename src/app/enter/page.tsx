import {permanentRedirect} from "next/navigation";

/** Backward-compatible URL for the public landing site, not another app. */
export default function LegacyLanding(){
  permanentRedirect("/");
}
