import type { Roster } from './domain';
export const time = (n:number) => `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export const person = (roster:Roster,id:string|null) => roster.volunteers.find(v=>v.id===id)?.name ?? 'Open slot';
