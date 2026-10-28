"use client";

import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {useSession} from 'next-auth/react';
import {createComposerInputMemory,type ComposerInputMemory} from '@/lib/composer-input-memory';

const InputMemoryContext=createContext<ComposerInputMemory|null>(null);

/** Lives with the root layout so account changes clear old input even when the
 * editor route is absent. Reloading/closing the document naturally discards it. */
export function ComposerInputMemoryProvider({children}:{children:ReactNode}) {
  const [memory]=useState(createComposerInputMemory);
  const {data:session,status}=useSession();
  const accountId=status==='loading'?undefined:session?.user?.id??null;
  useEffect(()=>{memory.observe(accountId);},[memory,accountId]);
  return <InputMemoryContext.Provider value={memory}>{children}</InputMemoryContext.Provider>;
}
export function useComposerInputMemory(){return useContext(InputMemoryContext);}
