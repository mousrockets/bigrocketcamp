import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
const EMOJIS=['💪','🔥','😂'];
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Connexion requise.'},{status:401});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origine refusée.'},{status:403});
 const body=await request.json().catch(()=>null) as {exerciseId?:unknown;emoji?:unknown}|null;
 const exerciseId=body?.exerciseId,emoji=body?.emoji;
 if(typeof exerciseId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(exerciseId)||typeof emoji!=='string'||!EMOJIS.includes(emoji))return Response.json({error:'Réaction invalide.'},{status:400});
 const db=env.DB!;
 if(!await db.prepare('SELECT 1 FROM exercises WHERE id=?').bind(exerciseId).first())return Response.json({error:'Série introuvable.'},{status:404});
 const removed=await db.prepare('DELETE FROM exercise_reactions WHERE exercise_id=? AND author=? AND emoji=?').bind(exerciseId,user.userId,emoji).run() as {meta?:{changes?:number};changes?:number};
 if(!Number(removed.meta?.changes??removed.changes??0))await db.prepare('INSERT INTO exercise_reactions (exercise_id,author,emoji,created) VALUES (?,?,?,?) ON CONFLICT DO NOTHING').bind(exerciseId,user.userId,emoji,new Date().toISOString()).run();
 return Response.json({ok:true});
}
