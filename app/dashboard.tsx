'use client';
import {useEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import {roster,parisDay,summarize,dailyRecap,lastPlaceRule,validateExercise,pushupCredit,exerciseEffect,exerciseDescription,formatNumber} from '../lib/domain.mjs';

type ExerciseType='pushups'|'plank'|'crunches';
type Declaration={id:string;player:string;type:ExerciseType;count:number;day:string};
type Exercise=Declaration&{created:string;mine?:boolean};
type Result={match_guid:string;player_id:string;name:string;day:string;kind:string;team:number;winner:number;score:number;review_required?:boolean;verification?:string;selected_source?:string};
type PlayerStats={name:string;played:number;wins:number;losses:number;due:number;done:number;pushups:number;plankSeconds:number;crunches:number;remaining:number};
type DoublesRank={player:string;mmr:number|null;label:string;status:string;fetchedAt:string|null};
type Reaction={exercise_id:string;emoji:string;count:number;mine:number};
type State={
  results:Result[];
  exercises:Exercise[];
  collectors:{last_seen:string}[];
  matchRosters?:{match_guid:string;expected_players:number}[];
  reliability?:{confirmed:number;single:number;corrected:number;review:number};
  doublesRanks?:DoublesRank[];
  reactions?:Reaction[];
  me?:string|null;
  epic?:{slot:string;status:string;last_sync:string|null;last_attempt:string|null}[];
  epicPaused?:boolean;
  epicRetired?:boolean;
};
type CheerKind='cheer'|'finish'|'badge'|'loss';
type Cheer={id:number;text:string;kind:CheerKind;pieces:CSSProperties[]};
type Theme='dark'|'light'|'auto';
type InstallMode='installed'|'prompt'|'ios'|'manual';
type Streak={current:number;best:number};
type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
type InstallWindow=Window&{__rlInstall?:InstallPrompt|null};

const players:Record<string,{initials:string;platform:string}>={
  'chat-pris-tea':{initials:'CT',platform:'PC'},
  nokouki:{initials:'NK',platform:'PC'},
  'kevin-74000':{initials:'K7',platform:'PS5'},
};
const cheers=['Vas-y champion !','Allez, encore une ! Comme en prolongation !','Boost à 100 % !','What a save… de pompes !','Calculated.','Les bras en béton armé !','Même le ballon est impressionné.','Tu pousses plus fort qu’un kickoff !','Mousrocket un jour, Mousrocket toujours !','Respect. Le coach est fier.','Ça c’est du Grand Champion !','Et le muscle, il se lève tout seul ?'];
const finishers=['Dette réglée ! Free-play mérité.','Zéro pompe due. Champion du monde !','Ardoise effacée ! Tu peux re-perdre tranquille.'];
const taunts=['+5 pour {n}… courage, champion.','{n} prend 5 pompes. Le ballon ne pardonne pas.','Défaite pour {n} : direction le tapis !','{n} : +5. On appelle ça de l’entraînement.'];
const confettiColors=['#2e9bff','#ff8a1f','#ffd23f','#ffffff'];
const themes:[Theme,string][]=[['dark','Sombre'],['light','Clair'],['auto','Auto']];
const reactionEmojis=['💪','🔥','😂'];
const UNDO_DELAY_MS=10_000;
const UNDO_WINDOW_MS=24*60*60*1000;
const badgeRules:{id:string;emoji:string;label:string;earned:(p:PlayerStats,s:Streak)=>boolean}[]=[
  {id:'first',emoji:'🎯',label:'Premier effort',earned:p=>p.done>0},
  {id:'p100',emoji:'💯',label:'100 équiv. pompes',earned:p=>p.done>=100},
  {id:'p1000',emoji:'🏆',label:'1 000 équiv. pompes',earned:p=>p.done>=1000},
  {id:'plank10',emoji:'🧱',label:'10 min de gainage',earned:p=>p.plankSeconds>=600},
  {id:'abs200',emoji:'🍫',label:'200 abdos',earned:p=>p.crunches>=200},
  {id:'streak7',emoji:'🔥',label:'7 jours d’affilée',earned:(_,s)=>s.best>=7},
];

const pick=<T,>(list:T[])=>list[Math.floor(Math.random()*list.length)];
const isLoss=(r:Result)=>r.kind==='match'&&!r.review_required&&r.team!==r.winner&&roster.includes(r.name);
function shiftDay(day:string,delta:number){
  const date=new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate()+delta);
  return date.toISOString().slice(0,10);
}
function weekStart(today:string){
  const weekday=(new Date(`${today}T12:00:00Z`).getUTCDay()+6)%7;
  return shiftDay(today,-weekday);
}
function streakOf(days:Set<string>,today:string):Streak{
  let current=0;
  for(let day=days.has(today)?today:shiftDay(today,-1);days.has(day);day=shiftDay(day,-1))current++;
  let best=0,run=0,previous='';
  for(const day of Array.from(days).sort()){
    run=previous&&shiftDay(previous,1)===day?run+1:1;
    best=Math.max(best,run);
    previous=day;
  }
  return {current,best};
}
function readStorage(key:string){try{return localStorage.getItem(key);}catch{return null;}}
function writeStorage(key:string,value:string){try{localStorage.setItem(key,value);}catch{}}

// Generated in the browser: no audio files to host or license.
function playJingle(kind:CheerKind){
  if(typeof window==='undefined')return;
  try{
    const Ctx=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
    if(!Ctx)return;
    const ctx=new Ctx();
    const notes=kind==='loss'?[392,349.23,311.13,261.63]:kind==='cheer'?[659.25,783.99,1046.5]:[523.25,659.25,783.99,1046.5,1318.5];
    const gap=kind==='loss'?0.18:0.09;
    notes.forEach((frequency,i)=>{
      const oscillator=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime+i*gap;
      oscillator.type='triangle';
      oscillator.frequency.value=frequency;
      gain.gain.setValueAtTime(0.0001,t);
      gain.gain.exponentialRampToValueAtTime(0.25,t+0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001,t+gap*3);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(t);
      oscillator.stop(t+gap*3+0.02);
    });
    setTimeout(()=>ctx.close(),2000);
  }catch{}
}
function speak(text:string){
  if(typeof speechSynthesis==='undefined')return;
  try{
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.lang='fr-FR';
    utterance.rate=1.05;
    utterance.pitch=0.9+Math.random()*0.5;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }catch{}
}

function DoublesRankPanel({player,rank}:{player:string;rank?:DoublesRank}){
  return <div className="rank-panel" aria-label={`Classement 2v2 de ${player}`}>
    <span className="rank-mode">2V2 CLASSÉ · DERNIER RELEVÉ</span>
    <p className="rank-name">{rank?.label||'Classement non reçu'}</p>
    {rank?.mmr!=null?<strong className="rank-mmr">{formatNumber(rank.mmr)} <span>MMR</span></strong>:<p className="small muted">MMR non reçu</p>}
    {rank?.fetchedAt&&<p className="rank-meta">{rank.status!=='ready'?'Dernière valeur connue · ':''}{new Date(rank.fetchedAt).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</p>}
    {rank?.status==='unavailable'&&<p className="rank-meta">Actualisation du classement indisponible.</p>}
    {rank?.status==='frozen'&&<p className="rank-meta">Dernier MMR conservé · connexion Epic retirée.</p>}
  </div>;
}

function Odometer({value}:{value:string}){
  const chars=value.split('');
  // Keyed from the right so units stay units and roll instead of remounting.
  return <>{chars.map((c,i)=>{
    const key=chars.length-i;
    return /\d/.test(c)
      ?<span key={`d${key}`} className="odo" style={{'--d':c} as CSSProperties}><span className="odo-digit">{c}</span></span>
      :<span key={`s${key}`}>{c}</span>;
  })}</>;
}

function Ball(){
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#f4f6fb" stroke="#1a2440" strokeWidth="1.2"/><path d="M12 7l4.3 3.1-1.6 5H9.3l-1.6-5z" fill="#1a2440"/><path d="M12 1.5V7M16.3 10.1l5-1.6M14.7 15.1l3.2 4.3M9.3 15.1l-3.2 4.3M7.7 10.1l-5-1.6" stroke="#1a2440" strokeWidth="1.2"/></svg>;
}

function KickoffScene(){
  const [run,setRun]=useState(0);
  return <button type="button" className="kickoff" aria-label="Rejouer l’animation du but" title="Rejouer" onClick={()=>setRun(r=>r+1)}>
    <span className="kickoff-scene" key={run}>
      <span className="pitch-line"/>
      <span className="goal"><span className="net"/></span>
      <span className="goal-ring orange"/><span className="goal-ring blue"/>
      <span className="goal-text">BUT !</span>
      <span className="ball-x"><span className="ball-y"><span className="ball"><Ball/></span></span></span>
    </span>
  </button>;
}

function Car(){
  return <svg className="car" viewBox="0 0 160 60" aria-hidden="true">
    <path d="M3 21h20v3L8 27z" fill="#1a2440"/>
    <path d="M6 44 10 30q2-4 8-5l38-4L78 9q4-2 10-2l26 1q6 1 10 6l12 10 14 3q6 2 6 8v9z" fill="var(--green)" stroke="#0b1430" strokeWidth="2"/>
    <path d="M62 21 80 11h32l14 11z" fill="#0b1430"/>
    <path d="M12 34h140v4H10z" fill="var(--orange)"/>
    {[38,128].map(cx=><g key={cx} className="wheel"><circle cx={cx} cy="45" r="12" fill="#111827" stroke="#3b4c6b" strokeWidth="2"/><circle cx={cx} cy="45" r="5" fill="#9aa7c2"/><path d={`M${cx-9} 45h18M${cx} 36v18`} stroke="#9aa7c2" strokeWidth="2"/></g>)}
  </svg>;
}

function SkeletonCards(){
  return <>
    <p className="sr-only">Chargement de l’équipe…</p>
    {roster.map(name=><article className="card skeleton" key={name} aria-hidden="true"><i className="sk sk-avatar"/><i className="sk sk-title"/><i className="sk sk-block"/><i className="sk sk-big"/><i className="sk sk-line"/><i className="sk sk-line short"/></article>)}
  </>;
}

export default function Dashboard(){
  const [data,setData]=useState<State|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [day,setDay]=useState(parisDay()),[player,setPlayer]=useState(roster[0]),[type,setType]=useState<ExerciseType>('pushups'),[count,setCount]=useState(5);
  const [recapDay,setRecapDay]=useState(parisDay());
  const [busy,setBusy]=useState(false),[test,setTest]=useState(false),[pending,setPending]=useState<Declaration|null>(null);
  const [sound,setSound]=useState(true),[cheer,setCheer]=useState<Cheer|null>(null);
  const [theme,setTheme]=useState<Theme|null>(null),[menuOpen,setMenuOpen]=useState(false);
  const [chosenMe,setChosenMe]=useState<string|null>(null);
  const [undoable,setUndoable]=useState<Declaration|null>(null);
  const [installMode,setInstallMode]=useState<InstallMode|null>(null),[installHelp,setInstallHelp]=useState(false),[touchDevice,setTouchDevice]=useState(false);
  const menuRef=useRef<HTMLDivElement>(null);
  const cardsRef=useRef<HTMLDivElement>(null);
  const [activeCard,setActiveCard]=useState(0);
  const [podiumMode,setPodiumMode]=useState<'effort'|'mmr'>('effort');
  const cardsCentered=useRef(false);
  const refreshRequest=useRef(0);
  const refreshInFlight=useRef(0);
  const submissionInFlight=useRef(false);
  const playerTouched=useRef(false);
  const seenLosses=useRef<Set<string>|null>(null);
  const soundRef=useRef(sound);
  soundRef.current=sound;

  async function refresh(){
    refreshInFlight.current++;
    const request=++refreshRequest.current;
    try{
      const r=await fetch('/api/state');
      if(!r.ok)throw Error('Impossible de charger les résultats. Vérifie ta connexion.');
      const state=await r.json() as State;
      if(request!==refreshRequest.current)return null;
      setData(state);setError('');
      return state;
    }catch(e){
      if(request===refreshRequest.current)setError((e as Error).message);
      return null;
    }finally{refreshInFlight.current--;}
  }
  async function refreshIfIdle(){if(refreshInFlight.current)return null;return refresh();}

  useEffect(()=>{
    refresh();
    // Skip polling while the tab is hidden; catch up as soon as it is visible again.
    const t=setInterval(()=>{if(typeof document==='undefined'||!document.hidden)refreshIfIdle();},3000);
    let hiddenAt=0;
    const onVisible=()=>{
      if(document.hidden){hiddenAt=Date.now();return;}
      // An installed app can stay open for days: reload after a long pause to run the latest published version.
      const installed=typeof window!=='undefined'&&(matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true);
      if(installed&&hiddenAt&&Date.now()-hiddenAt>300000&&!submissionInFlight.current){location.reload();return;}
      refreshIfIdle();
    };
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',onVisible);
    if(readStorage('rl-sound')==='off')setSound(false);
    const savedTheme=readStorage('rl-theme');
    setTheme(savedTheme==='light'||savedTheme==='auto'?savedTheme:'dark');
    const savedMe=readStorage('rl-me');
    if(savedMe&&roster.includes(savedMe))setChosenMe(savedMe);
    if(readStorage('rl-podium')==='mmr')setPodiumMode('mmr');
    try{
      const stored=readStorage('rl-pending');
      if(stored){
        const p=validateExercise(JSON.parse(stored)) as Declaration;
        setPending(p);setPlayer(p.player);setType(p.type);setCount(p.type==='plank'?p.count/60:p.count);
        playerTouched.current=true;
      }
    }catch{}
    return()=>{
      clearInterval(t);
      refreshRequest.current++;
      if(typeof document!=='undefined')document.removeEventListener('visibilitychange',onVisible);
    };
  },[]);

  useEffect(()=>{
    if(!theme||typeof document==='undefined')return;
    const media=matchMedia('(prefers-color-scheme: light)');
    const apply=()=>{document.documentElement.dataset.theme=theme==='auto'?(media.matches?'light':'dark'):theme;};
    apply();
    media.addEventListener('change',apply);
    return()=>media.removeEventListener('change',apply);
  },[theme]);

  useEffect(()=>{
    if(!menuOpen||typeof document==='undefined')return;
    const close=(e:Event)=>{
      if(e instanceof KeyboardEvent?e.key==='Escape':!menuRef.current?.contains(e.target as Node))setMenuOpen(false);
    };
    document.addEventListener('pointerdown',close);
    document.addEventListener('keydown',close);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',close);};
  },[menuOpen]);

  useEffect(()=>{
    if(typeof window==='undefined')return;
    const w=window as InstallWindow;
    const standalone=matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
    const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    setTouchDevice(matchMedia('(pointer: coarse)').matches);
    setInstallMode(standalone?'installed':w.__rlInstall?'prompt':ios?'ios':'manual');
    const ready=()=>setInstallMode(mode=>mode==='installed'?mode:'prompt');
    const installed=()=>{w.__rlInstall=null;setInstallMode('installed');};
    window.addEventListener('rl-install-ready',ready);
    window.addEventListener('appinstalled',installed);
    return()=>{window.removeEventListener('rl-install-ready',ready);window.removeEventListener('appinstalled',installed);};
  },[]);

  const recognized=chosenMe||data?.me||null;
  useEffect(()=>{
    if(recognized&&!playerTouched.current&&!pending)setPlayer(recognized);
  },[recognized,pending]);

  function scrollToCard(index:number,smooth=true){
    const track=cardsRef.current,card=track?.querySelectorAll('article')[index];
    if(!track||!card)return;
    track.scrollTo({left:card.offsetLeft-(track.clientWidth-card.clientWidth)/2,behavior:smooth?'smooth':'auto'});
  }
  function onCardsScroll(){
    const track=cardsRef.current;
    if(!track)return;
    const center=track.scrollLeft+track.clientWidth/2;
    const cards=Array.from(track.querySelectorAll('article'));
    const nearest=cards.reduce((best,card,i)=>Math.abs(card.offsetLeft+card.clientWidth/2-center)<Math.abs(cards[best].offsetLeft+cards[best].clientWidth/2-center)?i:best,0);
    setActiveCard(nearest);
  }
  // On phones, open the carousel on the recognised player's card once.
  useEffect(()=>{
    const track=cardsRef.current;
    if(!data||!recognized||cardsCentered.current||!track||track.scrollWidth<=track.clientWidth)return;
    cardsCentered.current=true;
    scrollToCard(roster.indexOf(recognized),false);
  },[data,recognized]);

  const today=parisDay();
  const allStats=data?summarize(data.results,data.exercises,'',data.matchRosters||[]) as PlayerStats[]:[];
  const streaks:Record<string,Streak>=Object.fromEntries(roster.map(name=>[name,streakOf(new Set((data?.exercises||[]).filter(e=>e.player===name).map(e=>e.day)),today)]));
  const badgesOf=(p:PlayerStats)=>badgeRules.filter(rule=>rule.earned(p,streaks[p.name]));

  useEffect(()=>{
    if(!data)return;
    const losses=data.results.filter(isLoss);
    const keys=losses.map(r=>`${r.match_guid}:${r.player_id}`);
    if(seenLosses.current){
      const fresh=losses.filter((_,i)=>!seenLosses.current!.has(keys[i]));
      const names=Array.from(new Set(fresh.map(r=>r.name)));
      if(names.length)celebrate('loss',pick(taunts).replace('{n}',names.join(' et ')));
    }
    seenLosses.current=new Set(keys);

    const earned=allStats.flatMap(p=>badgesOf(p).map(b=>({key:`${p.name}:${b.id}`,player:p.name,badge:b})));
    const stored=readStorage('rl-badges');
    if(stored!==null){
      const known=new Set<string>(JSON.parse(stored));
      const unlocked=earned.find(e=>!known.has(e.key));
      if(unlocked)celebrate('badge',`Badge débloqué : ${unlocked.badge.emoji} ${unlocked.badge.label} pour ${unlocked.player} !`);
    }
    writeStorage('rl-badges',JSON.stringify(earned.map(e=>e.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[data]);

  function toggleSound(){const next=!sound;setSound(next);writeStorage('rl-sound',next?'on':'off');}
  function choosePodium(next:'effort'|'mmr'){setPodiumMode(next);writeStorage('rl-podium',next);}
  function chooseTheme(next:Theme){setTheme(next);writeStorage('rl-theme',next);}
  function chooseMe(next:string|null){
    setChosenMe(next);
    try{if(next)localStorage.setItem('rl-me',next);else localStorage.removeItem('rl-me');}catch{}
    const target=next||data?.me;
    if(target&&!pending&&!busy){setPlayer(target);playerTouched.current=false;}
  }
  async function installApp(){
    const w=window as InstallWindow;
    const prompt=w.__rlInstall;
    if(installMode==='prompt'&&prompt){
      await prompt.prompt();
      const choice=await prompt.userChoice;
      w.__rlInstall=null;
      setInstallMode(choice.outcome==='accepted'?'installed':'manual');
      return;
    }
    setInstallHelp(h=>!h);
  }

  function celebrate(kind:CheerKind,custom?:string){
    const id=Date.now()+Math.random();
    const text=custom||(kind==='finish'?pick(finishers):pick(cheers));
    const amount=kind==='loss'?0:kind==='cheer'?30:60;
    const pieces=Array.from({length:amount},(_,i)=>({'--x':`${Math.random()*100}%`,'--d':`${Math.random()*0.4}s`,'--r':`${Math.random()*720-360}deg`,'--c':confettiColors[i%confettiColors.length]}) as CSSProperties);
    setCheer({id,text,kind,pieces});
    if(soundRef.current){playJingle(kind);setTimeout(()=>speak(text),kind==='cheer'?350:550);}
    try{navigator.vibrate?.(kind==='loss'?[30,60,30]:kind==='cheer'?50:[60,40,120]);}catch{}
    setTimeout(()=>setCheer(c=>c?.id===id?null:c),2600);
  }

  async function submit(){
    if(submissionInFlight.current)return;
    submissionInFlight.current=true;
    setBusy(true);setNotice('');setError('');setUndoable(null);
    try{
      const payload=pending||{id:crypto.randomUUID(),player,type,count:type==='plank'?count*60:count,day:parisDay()};
      setPending(payload);
      // A storage restriction must not prevent saving the exercise on the server.
      writeStorage('rl-pending',JSON.stringify(payload));
      const r=await fetch('/api/exercise',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const j=await r.json() as {error?:string};
      if(!r.ok)throw Error(j.error||'Impossible d’enregistrer cet exercice.');
      setPending(null);
      try{localStorage.removeItem('rl-pending');}catch{}
      setNotice(`Exercice enregistré pour ${payload.player} : ${exerciseDescription(payload)}.`);
      setUndoable(payload);
      setTimeout(()=>setUndoable(u=>u?.id===payload.id?null:u),UNDO_DELAY_MS);
      const state=await refresh();
      if(state){
        const updated=(summarize(state.results,state.exercises,'',state.matchRosters||[]) as PlayerStats[]).find(p=>p.name===payload.player)!;
        setNotice(`Exercice enregistré pour ${payload.player} : ${exerciseDescription(payload)}. Solde restant : ${formatNumber(updated.remaining)} pompes.`);
        celebrate(updated.remaining===0?'finish':'cheer');
      }else celebrate('cheer');
    }catch(e){setError((e as Error).message);}
    finally{submissionInFlight.current=false;setBusy(false);}
  }

  async function undo(exercise:Declaration,ask:boolean){
    if(ask&&!confirm(`Annuler la série « ${exerciseDescription(exercise)} » de ${exercise.player} ?`))return;
    setError('');
    try{
      const r=await fetch('/api/exercise',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:exercise.id})});
      const j=await r.json() as {error?:string};
      if(!r.ok)throw Error(j.error||'Impossible d’annuler cette série.');
      setUndoable(null);
      setNotice(`Série annulée : ${exerciseDescription(exercise)} pour ${exercise.player}.`);
      await refresh();
    }catch(e){setError((e as Error).message);}
  }

  async function react(exerciseId:string,emoji:string){
    try{
      const r=await fetch('/api/reaction',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({exerciseId,emoji})});
      if(!r.ok)throw Error(((await r.json()) as {error?:string}).error||'Réaction impossible.');
      try{navigator.vibrate?.(15);}catch{}
      await refresh();
    }catch(e){setError((e as Error).message);}
  }

  const stats=data?summarize(data.results,data.exercises,day,data.matchRosters||[]) as PlayerStats[]:[];
  const rows=data?.results.filter(r=>(!day||r.day===day)&&(test||r.kind==='match'))||[];
  const exercises=data?.exercises.filter(e=>!day||e.day===day)||[];
  const draft=pending||{type,count:type==='plank'?count*60:count};
  const selected=stats.find(p=>p.name===(pending?.player||player));
  const effect=selected&&Number.isFinite(draft.count)&&draft.count>0?exerciseEffect(selected.remaining,draft):null;
  const limit=type==='plank'?1000:10000,steps=type==='plank'?[0.25,0.5,1]:[5,10,20],unit=type==='plank'?' min':'';
  const owed=selected?.remaining??0;
  const payoff=Math.min(limit,type==='plank'?Math.ceil(owed/15*4)/4:Math.ceil(type==='crunches'?owed*2:owed));
  function addCount(n:number){setCount(c=>Math.min(limit,(Number.isFinite(c)?c:0)+n));}
  const recap=data?dailyRecap(data.results,recapDay,data.matchRosters||[]):null;
  const recapLabel=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${recapDay}T12:00:00Z`));
  function yesterday(){setRecapDay(shiftDay(parisDay(),-1));}

  const monday=weekStart(today);
  const weekDays=Array.from({length:(Date.parse(`${today}T12:00:00Z`)-Date.parse(`${monday}T12:00:00Z`))/86400000+1},(_,i)=>shiftDay(monday,i));
  const weekRecaps=data?weekDays.map(d=>dailyRecap(data.results,d,data.matchRosters||[])):[];
  const weekly=roster.map(name=>({
    name,
    effort:(data?.exercises||[]).filter(e=>e.player===name&&e.day>=monday&&e.day<=today).reduce((sum,e)=>sum+pushupCredit(e),0),
    generated:weekRecaps.reduce((sum,r)=>sum+(r.players.find(p=>p.name===name)?.generated||0),0),
  }));
  const podium=[...weekly].sort((a,b)=>b.effort-a.effort);
  const debtor=[...weekly].sort((a,b)=>b.generated-a.generated)[0];
  const mmrPodium=roster.map(name=>{const r=data?.doublesRanks?.find(x=>x.player===name);return {name,mmr:r?.mmr??null,label:r?.label||''};}).sort((a,b)=>(b.mmr??-1)-(a.mmr??-1));
  const podiumRows=podiumMode==='mmr'
    ?mmrPodium.map(p=>({name:p.name,title:p.label,value:p.mmr!=null?<>{formatNumber(p.mmr)} <small>MMR</small></>:<small>MMR non reçu</small>}))
    :podium.map(p=>({name:p.name,title:'',value:<>{formatNumber(p.effort)} <small>équiv.</small></>}));
  const reactionsFor=(id:string)=>reactionEmojis.map(emoji=>{const r=data?.reactions?.find(x=>x.exercise_id===id&&x.emoji===emoji);return {emoji,count:r?.count||0,mine:!!r?.mine};});
  const installLabel=touchDevice?'Ajouter à l’écran d’accueil':'Installer sur le bureau';

  return <main>
    <header>
      <a className="brand" href="/" aria-label="Les Trois Mousrockets, accueil"><img className="club-logo" src="/club-photo.jpg" alt="" width={64} height={64}/><span className="brand-name"><span>Les Trois</span><strong>Mousrockets</strong></span></a>
      <div className="header-actions" ref={menuRef}>
        <span className="pill">UN POUR TOUS, TOUS POUR LE BUT</span>
        <button type="button" className="burger" aria-label="Menu" aria-expanded={menuOpen} aria-controls="main-menu" onClick={()=>setMenuOpen(o=>!o)}><span/><span/><span/></button>
        {menuOpen&&<div id="main-menu" className="menu">
          <p>QUI ES-TU ?</p>
          <div className="segmented players" role="group" aria-label="Mon joueur">
            {roster.map(name=><button type="button" key={name} aria-pressed={recognized===name} onClick={()=>chooseMe(name)}>{name}</button>)}
          </div>
          <small className="menu-hint">{chosenMe?<>Choisi sur cet appareil · <button type="button" className="link" onClick={()=>chooseMe(null)}>reconnaissance auto</button></>:data?.me?`Reconnu grâce à tes déclarations : ${data.me}`:'Pas encore reconnu : choisis ton joueur.'}</small>
          <p>THÈME</p>
          <div className="segmented" role="group" aria-label="Thème">{themes.map(([value,label])=><button type="button" key={value} aria-pressed={theme===value} onClick={()=>chooseTheme(value)}>{label}</button>)}</div>
          <p>SON</p>
          <button type="button" className="menu-wide" aria-pressed={sound} onClick={toggleSound}>{sound?'♪ Son et voix activés':'Son coupé'}</button>
          {installMode&&installMode!=='installed'&&<>
            <p>RACCOURCI</p>
            <button type="button" className="menu-wide install" onClick={installApp}>⬇ {installLabel}</button>
            {installHelp&&<small className="menu-hint">{installMode==='ios'?'Sur iPhone/iPad : touche Partager (carré avec une flèche) puis « Sur l’écran d’accueil ».':'Ouvre le menu du navigateur (⋮ ou …) puis « Installer l’application » ou « Ajouter à l’écran d’accueil ». Sur ordinateur, Chrome et Edge le proposent.'}</small>}
          </>}
          <nav onClick={()=>setMenuOpen(false)}>
            <a href="#team">Le tableau de l’équipe</a>
            <a href="#exercise">Déclarer un exercice</a>
            <a href="#recap-title">Récap du jour</a>
            <a href="#week">La semaine</a>
            <a href="#history">Derniers matchs</a>
            <a href="/connexions">Identités des joueurs</a>
            <a href="/direct">Direct depuis le PC · à tester</a>
            <a href="/signout-with-chatgpt?return_to=%2F" target="_top">Se déconnecter</a>
          </nav>
        </div>}
      </div>
    </header>

    <section className="intro">
      <div><p className="eyebrow">LES TROIS MOUSROCKETS · ROCKET LEAGUE</p><h1>On perd ensemble.<br/><em>On pousse ensemble.</em></h1><p className="muted">Une défaite, 5 pompes. Pompes, gainage ou abdos : chaque effort compte.</p><KickoffScene/></div>
      <div className="rule"><strong>5</strong><span>POMPES / DÉFAITE</span><small>{lastPlaceRule.enabled?'Dernier aux points du match : +5 si défaite':'Bonus dernier aux points désactivé'}</small></div>
    </section>
    {error&&<p className="alert" role="alert">{error} <button onClick={refresh}>Actualiser</button></p>}
    {data?.epicRetired&&<aside className="alert" aria-label="Connexion Epic retirée">Connexion communautaire Epic retirée. L’application ne se connecte plus à Rocket League à votre place. <a href="/direct">Utiliser le Direct PC</a>.</aside>}

    <section id="team">
      <div className="section-title"><h2>Le tableau de l’équipe</h2><div className="filters"><label>Date <input type="date" value={day} onChange={e=>setDay(e.target.value)}/></label><button onClick={()=>setDay('')}>Tout</button><button onClick={()=>setDay(parisDay())}>Aujourd’hui</button></div></div>
      <p className="live-status"><span aria-hidden="true"/>Actualisation toutes les 3 secondes · scores reçus par le Direct PC</p>
      <p className="muted small">Les compteurs indiquent les parties reçues. Les anciennes données Epic restent disponibles ; leur collecte est retirée. Le MMR affiche la dernière valeur reçue.</p>
      <p className="small"><a href="/direct">Configurer le direct depuis un PC ↗</a> · Un onglet sur le PC qui joue ; premier essai à valider.</p>
      <p className="muted small">Matchs et historique sur la date choisie · Dette et totaux d’exercices cumulés depuis le début.</p>
      <div className="cards" ref={cardsRef} onScroll={onCardsScroll}>{!data?<SkeletonCards/>:stats.map(p=>{
        const streak=streaks[p.name];
        const all=allStats.find(a=>a.name===p.name)||p;
        const connection=data.epic?.find(c=>c.slot===p.name);
        const historyPending=p.played===0&&!connection?.last_sync;
        const collectionLabel=data.epicRetired?(connection?'Identité de jeu conservée · accès Epic retiré.':'En attente du Direct PC.'):connection?.status==='reconnect'?'Autorisation Epic à renouveler.':connection?.status==='error'?'Lecture Epic indisponible.':connection?.status==='waiting_offline'?'Historique en attente : joueur en ligne ou présence inconnue.':!connection?'Compte Epic à connecter.':!connection.last_sync?'Historique pas encore récupéré.':connection.status==='partial'?'Historique reçu partiellement.':'Fenêtre récente Epic reçue.';
        return <article className={p.name===recognized?'card me':'card'} key={p.name}>
          <div className="card-top"><span className="avatar">{players[p.name]?.initials??p.name.slice(0,2).toUpperCase()}</span>{p.name===recognized&&<span className="you">TOI</span>}{streak.current>0&&<span className="streak" title={`${streak.current} jour(s) d’affilée avec un exercice`}>🔥 {streak.current} j</span>}<span className="platform">{players[p.name]?.platform??'PC'}</span></div>
          <h3>{p.name}</h3>
          <DoublesRankPanel player={p.name} rank={data.doublesRanks?.find(r=>r.player===p.name)}/>
          <div className="results"><span><b>{historyPending?'—':p.played}</b> parties reçues</span><span className="win"><b>{historyPending?'—':p.wins}</b> victoires</span><span><b>{historyPending?'—':p.losses}</b> défaites</span></div>
          <p className="small muted" aria-label={`Collecte de ${p.name}`}>{collectionLabel}{connection?.last_sync&&<> Dernière lecture : {new Date(connection.last_sync).toLocaleString('fr-FR',{timeZone:'Europe/Paris'})}.</>}</p>
          <div className="debt"><strong><Odometer value={formatNumber(p.remaining)}/></strong><span>pompes restantes</span></div>
          <div className="progress"><i style={{width:`${p.due?Math.min(100,p.done/p.due*100):100}%`}}/></div>
          <p className="small muted">{formatNumber(p.done)} équiv. pompes réalisés · {p.due} dues au total</p>
          <dl className="exercise-totals"><div><dt>Pompes</dt><dd>{formatNumber(p.pushups)}</dd></div><div><dt>Gainage (min)</dt><dd>{formatNumber(p.plankSeconds/60)}</dd></div><div><dt>Abdos</dt><dd>{formatNumber(p.crunches)}</dd></div></dl>
          <ul className="badges" aria-label={`Badges de ${p.name}`}>{badgeRules.map(b=>{const has=b.earned(all,streak);return <li key={b.id} className={has?'earned':''} title={b.label}><span aria-hidden="true">{b.emoji}</span><span className="sr-only">{b.label}{has?' : obtenu':' : à débloquer'}</span></li>;})}</ul>
          <button onClick={()=>{if(!pending&&!busy){playerTouched.current=true;setPlayer(p.name);}document.getElementById('exercise')?.scrollIntoView({behavior:'smooth'});}}>Déclarer un exercice ↗</button>
        </article>;
      })}</div>
      {data&&<div className="card-dots" role="group" aria-label="Choisir un joueur">{stats.map((p,i)=><button type="button" key={p.name} className={i===activeCard?'dot active':'dot'} aria-label={`Voir la carte de ${p.name}`} aria-current={i===activeCard} onClick={()=>scrollToCard(i)}/>)}</div>}
    </section>

    <section id="exercise" className="exercise">
      <p className="eyebrow">À TOI DE JOUER</p><h2>Déclarer un exercice</h2><p className="muted">Choisis ton effort pour réduire ta dette.</p>
      <div className="equivalences"><p>1 min de gainage = <b>15 pompes</b></p><p>20 abdos = <b>10 pompes</b></p></div>
      <form onSubmit={e=>{e.preventDefault();submit();}}>
        <label>Joueur<select value={player} disabled={!!pending||busy} onChange={e=>{playerTouched.current=true;setPlayer(e.target.value);}}>{roster.map(p=><option key={p} value={p}>{p}{p===recognized?' (toi)':''}</option>)}</select></label>
        <label>Exercice<select value={type} disabled={!!pending||busy} onChange={e=>{const next=e.target.value as ExerciseType;setType(next);setCount(next==='plank'?1:next==='crunches'?20:5);}}><option value="pushups">Pompes</option><option value="plank">Gainage</option><option value="crunches">Abdos</option></select></label>
        <label>{type==='plank'?'Durée de gainage (minutes)':type==='crunches'?'Nombre d’abdos':'Nombre de pompes'}<input type="number" inputMode="decimal" min={type==='plank'?0.25:1} step={type==='plank'?0.25:1} max={limit} required value={Number.isNaN(count)?'':count} disabled={!!pending||busy} onChange={e=>setCount(e.target.valueAsNumber)} aria-describedby="exercise-credit"/></label>
        <div className="quick-counts" role="group" aria-label="Quantités rapides">
          {steps.map(n=><button type="button" key={n} disabled={!!pending||busy} onClick={()=>addCount(n)}>+{formatNumber(n)}{unit}</button>)}
          <button type="button" disabled={!!pending||busy||!payoff} onClick={()=>setCount(payoff)}>Tout rembourser{payoff?` (${formatNumber(payoff)}${unit})`:''}</button>
        </div>
        {type==='plank'&&<p className="small muted">Par tranches de 15 secondes : 0,25 min = 15 s ; 0,5 min = 30 s.</p>}
        <div id="exercise-credit" className="credit" aria-live="polite">{effect?<>
          <p>Équivalent : {formatNumber(effect.equivalent)} pompes.</p>
          <p>Dette actuelle : {formatNumber(selected?.remaining??0)} pompes · Réduction : {formatNumber(effect.reduction)} · Restant : {formatNumber(effect.remaining)}.</p>
          {effect.excess>0&&<p className="small muted">Cette série dépasse la dette actuelle de {formatNumber(effect.excess)} équiv. pompes. Le solde restera à zéro et toute la série sera conservée dans l’historique et les totaux.</p>}
        </>:<p>{Number.isFinite(draft.count)&&draft.count>0?'Chargement du solde…':'Saisis une quantité pour voir l’équivalence.'}</p>}</div>
        <button className="primary" disabled={busy}>{busy?'Enregistrement…':pending?'Réessayer la déclaration':'Valider mon exercice →'}</button>
        {pending&&<p className="small">Déclaration en attente : {exerciseDescription(pending)} pour {pending.player}. Réessayer ne la comptera pas deux fois.</p>}
      </form>
      {notice&&<p role="status" className="win">{notice}</p>}
      {undoable&&<button type="button" className="undo" onClick={()=>undo(undoable,false)}>↶ Annuler cette série</button>}
      <p className="small muted">Déclaration pour aujourd’hui. Le solde reste à zéro minimum ; tous les efforts sont comptabilisés et conservés.</p>
    </section>
    <a className="fab" href="#exercise">+ Exercice</a>
    {cheer&&<div className={`cheer ${cheer.kind}`} key={cheer.id} aria-hidden="true">
      {cheer.pieces.map((style,i)=><i key={i} style={style}/>)}
      {cheer.kind!=='loss'&&<div className={cheer.kind==='finish'?'car-run demo':'car-run'}><span className="boost"/><Car/></div>}
      {cheer.kind==='finish'&&<div className="boom"><b/><b/><b/></div>}
      <p className={`cheer-text ${cheer.kind}`}>{cheer.text}</p>
    </div>}

    <section className="sync-summary">
      <div><b>Historique vérifié entre les sources</b><p className="small muted">{data?.reliability?`${data.reliability.confirmed} résultat(s) confirmé(s) par les deux sources · ${data.reliability.corrected} corrigé(s) · ${data.reliability.single} reçu(s) d’une seule source`:'Chargement des sources…'}</p>{!!data?.reliability?.review&&<p className="small">{data.reliability.review} résultat(s) à vérifier, exclus du calcul des pompes.</p>}</div>
      <a href="/connexions">Identités des joueurs →</a>
    </section>

    <section className="daily-recap" aria-labelledby="recap-title">
      <div className="section-title">
        <div><p className="eyebrow">LE BILAN DU JOUR</p><h2 id="recap-title">Récap du {recapLabel}</h2></div>
        <div className="filters"><label>Date du récap <input type="date" aria-label="Date du récap" value={recapDay} max={parisDay()} onChange={e=>{if(e.target.value)setRecapDay(e.target.value);}}/></label><button onClick={()=>setRecapDay(parisDay())}>Ce jour</button><button onClick={yesterday}>Hier</button></div>
      </div>
      <p className="small muted">Journée en heure de Paris · {recapDay===parisDay()?'Bilan en cours':'Journée passée'} · Calculé sur les matchs reçus, même s’ils sont synchronisés plus tard.</p>
      {!recap?<div className="sk-table" aria-label="Chargement du récap…"><i className="sk sk-line"/><i className="sk sk-line"/><i className="sk sk-line"/></div>:<>
        <div className="table-wrap"><table aria-label="Récapitulatif quotidien"><thead><tr><th>Joueur</th><th>Parties</th><th>Victoires</th><th>Défaites</th><th>Moins de points du match*</th><th>Pompes générées</th></tr></thead><tbody>{recap.players.map(p=><tr key={p.name}><td><b>{p.name}</b></td><td>{p.played}</td><td className="win">{p.wins}</td><td>{p.losses}</td><td>{p.compared>0?<>{p.lowest} fois<small>sur {p.compared} matchs comparables{p.lowestTies>0?` · dont ${p.lowestTies} ex æquo`:''}</small></>:<span className="muted">Non comparable</span>}{p.unranked>0&&<small>{p.unranked} match{p.unranked>1?'s':''} sans comparaison</small>}</td><td>{p.generated}{p.bonus>0&&<small>dont {p.bonus} de supplément</small>}</td></tr>)}</tbody></table></div>
        {recap.matchCount===0&&<p className="empty">Aucun match reçu pour cette journée. Le récap se complétera après synchronisation.</p>}
      </>}
      <p className="small muted">* Comparaison avec tous les joueurs du match, adversaires compris, seulement si le tableau complet est disponible. Les égalités sont indiquées. {lastPlaceRule.enabled?`Une défaite vaut 5 pompes, avec 5 de plus pour le dernier du match${lastPlaceRule.ties==='none'?' uniquement s’il est seul dernier':''}.`:'Le supplément dernier aux points reste désactivé.'}</p>
    </section>

    <section id="week" className="week" aria-labelledby="week-title">
      <p className="eyebrow">{podiumMode==='mmr'?'2V2 CLASSÉ · DERNIER RELEVÉ':'DEPUIS LUNDI'}</p><h2 id="week-title">{podiumMode==='mmr'?'Le podium MMR 2v2':'Le podium de la semaine'}</h2>
      <div className="podium-toggle" role="group" aria-label="Classer le podium par">
        <button type="button" aria-pressed={podiumMode==='effort'} onClick={()=>choosePodium('effort')}>Efforts</button>
        <button type="button" aria-pressed={podiumMode==='mmr'} onClick={()=>choosePodium('mmr')}>MMR 2v2</button>
      </div>
      {!data?<div className="sk-table"><i className="sk sk-big"/></div>:<>
        <ol className="podium">{[podiumRows[1],podiumRows[0],podiumRows[2]].map(p=>{const rank=podiumRows.indexOf(p)+1;return <li key={p.name} className={`step step-${rank}`} title={p.title}>
          <span className="step-name">{p.name}</span>
          <span className="step-value">{p.value}</span>
          <span className="step-block">{rank}</span>
        </li>;})}</ol>
        <p className="small muted">{podiumMode==='mmr'
          ?<>{mmrPodium[0].mmr!=null?`${mmrPodium[0].name} a le meilleur MMR 2v2${mmrPodium[0].label?` (${mmrPodium[0].label})`:''}.`:'Aucun MMR 2v2 reçu pour l’instant.'} Dernier relevé Epic, indépendant de la semaine.</>
          :<>{podium[0].effort>0?`${podium[0].name} mène la semaine.`:'Personne n’a encore bougé cette semaine…'}{debtor.generated>0?` Lanterne rouge : ${debtor.name} avec ${debtor.generated} pompes générées.`:''}</>}</p>
      </>}
    </section>

    <div className="histories">
      <section id="history" className="history">
        <div className="section-title"><h2>Les derniers matchs</h2><label className="small"><input type="checkbox" checked={test} onChange={e=>setTest(e.target.checked)}/> Inclure les tests bots</label></div>
        <div className="table-wrap"><table><thead><tr><th>Date / joueur</th><th>Résultat</th><th>Points</th><th>Pompes</th></tr></thead><tbody>{rows.map(r=><tr key={r.match_guid+r.player_id}>
          <td><b>{r.name}</b><small>{r.day} {r.kind==='test'?'· Test bots':''}</small><small>{r.review_required?'À vérifier':r.verification==='confirmed'?'Confirmé par les deux sources':r.verification==='corrected'?'Corrigé par Epic':r.selected_source==='epic'?'Epic':'Collecteur PC'}</small></td>
          <td><span className={r.review_required?'badge':r.team===r.winner?'badge victory':'badge defeat'}>{r.review_required?'À vérifier':r.team===r.winner?'Victoire':'Défaite'}</span></td>
          <td>{r.score}</td>
          <td>{!r.review_required&&r.kind==='match'&&r.team!==r.winner?'+5':'0'}</td>
        </tr>)}</tbody></table>{!rows.length&&<p className="empty">Aucun match enregistré pour cette période.</p>}</div>
      </section>
      <section className="history exercise-history">
        <h2>Historique des exercices</h2>
        <p className="small muted">Toutes les séries sont conservées. Leur auteur peut annuler une erreur dans les 24 heures.</p>
        <div className="table-wrap"><table><thead><tr><th>Date / joueur</th><th>Exercice réalisé</th><th>Équiv. pompes</th></tr></thead><tbody>{exercises.map(e=>{
          const canUndo=e.mine&&Date.now()-Date.parse(e.created)<UNDO_WINDOW_MS;
          return <tr key={e.id}>
            <td><b>{e.player}</b><small>{e.day} · {new Date(e.created).toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'})}</small></td>
            <td>{exerciseDescription(e)}<div className="reactions">{reactionsFor(e.id).map(r=><button type="button" key={r.emoji} aria-pressed={r.mine} aria-label={`Réagir ${r.emoji}`} onClick={()=>react(e.id,r.emoji)}>{r.emoji}{r.count>0&&<span>{r.count}</span>}</button>)}{canUndo&&<button type="button" className="undo-small" onClick={()=>undo(e,true)}>Annuler</button>}</div></td>
            <td className="win">−{formatNumber(pushupCredit(e))}</td>
          </tr>;
        })}</tbody></table>{!exercises.length&&<p className="empty">Aucun exercice enregistré pour cette période.</p>}</div>
      </section>
    </div>
    <footer><span>LES TROIS MOUSROCKETS · {data?.collectors.length?'Dernière réception PC : '+new Date(data.collectors[0].last_seen).toLocaleString('fr-FR',{timeZone:'Europe/Paris'}):data?.epic?.[0]?.last_sync?'Dernier historique Epic conservé : '+new Date(data.epic[0].last_sync).toLocaleString('fr-FR',{timeZone:'Europe/Paris'}):'En attente de la première collecte'}</span><p>Affichage actualisé toutes les 3 secondes. Aucun accès aux sessions Epic. Le Direct nécessite un onglet ouvert sur un PC qui joue. Tests bots exclus du bilan.</p><a href="/signout-with-chatgpt?return_to=%2F" target="_top">Se déconnecter</a></footer>
  </main>;
}
