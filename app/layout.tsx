import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata={title:'Les Trois Mousrockets · Le club',description:'Les Trois Mousrockets : nos matchs Rocket League, nos classements 2v2 et nos défis sportifs.',icons:{icon:{url:'/club-photo.jpg',type:'image/jpeg'},apple:'/club-photo.jpg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="fr"><body>{children}</body></html>;}
