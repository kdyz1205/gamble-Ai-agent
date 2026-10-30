import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import FreeSummonDrawPanel from '../src/components/ios/FreeSummonDrawPanel';
import FamiliarEvolutionAction from '../src/components/ios/FamiliarEvolutionAction';
function App(){const [owner,setOwner]=useState('A');const [refresh,setRefresh]=useState(0);
const tickets={source:'audited-free-profession-tickets-v1' as const,coverage:'recorded-verification-events-only' as const,available:1,spent:0,issued:1,awaitingIssuance:0,byProfession:[{professionId:'athletics' as const,verifiedXp:200,eligibleMilestones:1,issued:1,available:1,spent:0,awaitingIssuance:0}]};
const item={id:'synthetic_item_123',speciesId:'athletics-badminton-common-base',rarity:'common',form:'base',professionId:'athletics',occupationId:'badminton',createdAt:'2026-10-30T00:00:00Z'};
return <><button id="switch" onClick={()=>setOwner(v=>v==='A'?'B':'A')}>Switch owner</button><span id="owner">{owner}</span><span id="refresh">{refresh}</span><div key={owner}><FreeSummonDrawPanel tickets={tickets} enabled onDrawComplete={()=>setRefresh(x=>x+1)}/><FamiliarEvolutionAction item={item} verifiedXp={10000} onEvolutionComplete={()=>setRefresh(x=>x+1)}/></div></>}
createRoot(document.getElementById('root')!).render(<App/>);
