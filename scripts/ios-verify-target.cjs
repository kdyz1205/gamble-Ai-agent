/**
 * Strict beta target validator: prevents a signed iOS bundle from silently
 * pointing to an attacker or an unreviewed domain.
 * APP_STORE_TEST_TARGET can be 'preview' or 'production'.
 */
function validate(mode, raw) {
  if(mode !== "preview" && mode !== "production")throw Error("Unknown iOS release target");
  if(typeof raw !== "string" || !raw.trim())throw Error("Missing target URL");
  const url = new URL(raw);
  if(url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash)
    throw Error("iOS target must be an HTTPS URL without credentials, port or query");
  if(url.pathname.replace(/\/$/,"") !== "/app")throw Error("iOS target must point to /app");
  if(mode === "production"){
    if(url.hostname !== "summoner.world")throw Error("Production iOS target must use summoner.world");
  }else{
    if(!/^stubborn-git-[a-z0-9-]+-kdyz1205s-projects\.vercel\.app$/.test(url.hostname))
      throw Error("Preview target must be an authorized SUM Vercel branch deployment");
  }
  return {mode,url:url.toString().replace(/\/$/,""),hostname:url.hostname};
}

if(require.main===module){
  try{
    const result=validate(process.env.SUM_IOS_TARGET,process.env.SUM_IOS_APP_URL);
    console.log("IOS_APP_TARGET_VALIDATED",result.mode,result.hostname);
  }catch(error){
    console.error("IOS_APP_TARGET_REJECTED:",error.message);
    process.exitCode=1;
  }
}
module.exports={validate};
