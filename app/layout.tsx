import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata={title:'RL-Pompes · L’équipe',description:'Nos matchs, nos victoires, nos pompes.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="fr"><body>{children}</body></html>;}
