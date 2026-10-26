type IconName = 'check' | 'arrow' | 'undo' | 'pin' | 'close' | 'branch';
const paths: Record<IconName,string> = {
  check: 'm5 12 4 4L19 6', arrow: 'M4 12h16m-6-6 6 6-6 6', undo: 'M9 5 4 10l5 5M4 10h9a6 6 0 0 1 0 12',
  pin: 'm8 3 8 0-1 6 3 3H6l3-3-1-6m4 9v9', close: 'm6 6 12 12M18 6 6 18', branch: 'M6 4v9a5 5 0 0 0 5 5h7M6 9h7a5 5 0 0 0 5-5M15 1l3 3 3-3m-6 14 3 3-3 3',
};
export function Icon({name,size=18}:{name:IconName;size?:number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
