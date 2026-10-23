"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { IosIcon } from "./IOSAppUI";

type BlockedAccount={id:string;username:string;image:string|null;createdAt:string};

export default function IOSBlockedUsersPanel() {
  const {data:session,status}=useSession();
  const [blocked,setBlocked]=useState<BlockedAccount[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [pending,setPending]=useState<string|null>(null);
  useEffect(()=>{
    let active=true;
    if(status!=="authenticated" || !session?.user?.id){
      setBlocked([]);setLoading(false);return ()=>{active=false;};
    }
    setLoading(true);setError("");
    fetch("/api/users/blocks",{cache:"no-store"})
      .then(async r=>{
        const body=await r.json() as {blockedUsers?:BlockedAccount[];error?:string};
        if(!r.ok)throw Error(body.error||"Unable to load blocked users");
        return body.blockedUsers||[];
      })
      .then(rows=>{if(active){setBlocked(rows);setLoading(false);}})
      .catch(e=>{if(active){setLoading(false);setError(e instanceof Error?e.message:"Unable to load blocked users");}});
    return ()=>{active=false;};
  },[status,session?.user?.id]);
  async function unblock(targetUserId:string) {
    if(pending)return;
    setPending(targetUserId);setError("");
    try {
      const response=await fetch("/api/users/blocks",{
        method:"DELETE",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({targetUserId}),
      });
      const result=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!result.ok)throw Error(result.error||"Unblock failed");
      setBlocked(current=>current.filter(u=>u.id!==targetUserId));
    }catch(e){setError(e instanceof Error?e.message:"Unblock failed");}
    finally{setPending(null);}
  }
  return <section className="ios-settings-group ios-blocked-users" aria-label="Blocked users">
    <h2><IosIcon name="shield" size={18}/> Blocked users</h2>
    {status!=="authenticated"?<p className="ios-helper">Sign in to block or unblock people.</p>:
    loading?<p role="status" className="ios-helper">Loading your blocked accounts…</p>:
    !blocked.length?<p className="ios-helper">No blocked users. Block from Community or Support &amp; Safety.</p>:
      blocked.map(person=><div key={person.id} className="ios-blocked-users__row">
        <strong>@{person.username}</strong>
        <button type="button" disabled={!!pending} onClick={()=>void unblock(person.id)}>
          {pending===person.id?"Unblocking…":"Unblock"}
        </button>
      </div>)}
    {error&&<p role="alert" className="ios-message ios-message--error">{error}</p>}
  </section>;
}
