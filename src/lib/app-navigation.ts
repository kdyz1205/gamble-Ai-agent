/** One canonical destination set; legacy business URLs remain readable. */
export const appDestinations = [
  {href:'/app/today',label:'Home',zh:'首页',icon:'home'},
  {href:'/app/discover',label:'Discover',zh:'发现',icon:'discover'},
  {href:'/app/create',label:'Create',zh:'创建',icon:'create'},
  {href:'/app/picos',label:'Familiars',zh:'召唤兽',icon:'pico'},
  {href:'/app/profile',label:'Profile',zh:'我的',icon:'user'},
] as const;
export function activeAppDestination(value:string):string {
  const path=value.split('?')[0];
  if(path==='/app'||path==='/quests'||path.startsWith('/challenge/')||path.startsWith('/market/')||path.startsWith('/join/')||path.startsWith('/app/quest')||path==='/app/evidence-add')return '/app/today';
  if(path==='/summons')return '/app/create';
  if(path==='/markets'||path==='/app/community')return '/app/discover';
  if(path==='/rituals')return '/app/picos';
  if(['/me','/profile','/app/evidence','/app/stats','/app/achievements','/app/settings'].includes(path))return '/app/profile';
  return path;
}
export function hasInformationalNavigation(value:string):boolean {
  const path=value.split('?')[0];
  return ['/','/enter','/privacy','/terms','/support','/calculator','/rituals','/contracts/bind','/duel/demo','/judgment/demo'].includes(path)||path==='/auth'||path.startsWith('/auth/');
}
export function legacySceneOwnsNavigation(value:string):boolean {
  return ['/summons','/quests','/me'].includes(value.split('?')[0]);
}
