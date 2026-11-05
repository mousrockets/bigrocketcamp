import type { Metadata, Viewport } from 'next';
import './globals.css';
export const viewport: Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#060b1d'};
export const metadata: Metadata={title:'Les Trois Mousrockets · Le club',description:'Les Trois Mousrockets : nos matchs Rocket League, nos classements 2v2 et nos défis sportifs.',icons:{icon:{url:'/club-photo.jpg',type:'image/jpeg'},apple:'/icons/apple-touch-icon.png'},appleWebApp:{capable:true,title:'Mousrockets',statusBarStyle:'default'}};
// Applies the saved theme before first paint, and keeps the install prompt that browsers fire very early.
const headScript="try{var t=localStorage.getItem('rl-theme');if(t==='auto')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__rlInstall=e;dispatchEvent(new Event('rl-install-ready'))});";
// The site is private: the manifest request must carry the session cookie.
export default function Layout({children}:{children:React.ReactNode}){return <html lang="fr" suppressHydrationWarning><head><link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials"/><script dangerouslySetInnerHTML={{__html:headScript}}/></head><body>{children}</body></html>;}
