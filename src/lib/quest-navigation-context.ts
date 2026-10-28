/** Presentation-only return context. Never use these values for authorization. */
export const discoveryCategories=['all','move','create','grow'] as const;
export type DiscoveryCategory=typeof discoveryCategories[number];
export function discoverySelection(params:{get:(name:string)=>string|null}):{category:DiscoveryCategory;query:string}{
  const category=params.get('category');
  return {category:discoveryCategories.includes(category as DiscoveryCategory)?category as DiscoveryCategory:'all',
    query:(params.get('q')??'').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,160)};
}
export function discoveryHref(category:string,query:string):string {
  const selected=discoverySelection(new URLSearchParams({category,q:query}));
  const params=new URLSearchParams();
  if(selected.category!=='all')params.set('category',selected.category);
  if(selected.query)params.set('q',selected.query);
  return '/app/discover'+(params.size?'?'+params.toString():'');
}
const listDestinations=new Set(['/app/today','/app/discover','/app/community','/app/evidence','/app/profile','/quests']);
/** Normalize only known list destinations. Drop nested callbacks and arbitrary query keys. */
export function questReturnTo(value:unknown):string|null {
  if(typeof value!=='string'||value.length>1400||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(value))return null;
  try{
    const url=new URL(value,'https://sum.invalid');
    if(url.origin!=='https://sum.invalid'||!listDestinations.has(url.pathname))return null;
    let destination=url.pathname;
    if(destination==='/app/discover'){const state=discoverySelection(url.searchParams);destination=discoveryHref(state.category,state.query);}
    else if(destination==='/quests'){
      const view=url.searchParams.get('view');if(view==='proof'||view==='results')destination+='?view='+view;
    }
    if(/^#quest-[a-zA-Z0-9_-]{1,128}$/.test(url.hash))destination+=url.hash;
    return destination;
  }catch{return null;}
}
export function questRoute(view:'quest'|'join'|'evidence-add'|'quest-complete',id:string,returnTo?:unknown):string {
  const params=new URLSearchParams({id});const safe=questReturnTo(returnTo);
  if(safe)params.set('returnTo',safe);
  return '/app/'+view+'?'+params.toString();
}
