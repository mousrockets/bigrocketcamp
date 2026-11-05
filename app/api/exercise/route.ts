import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { validateExercise,parisDay } from '../../../lib/domain.mjs';
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Connexion requise.'},{status:401});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origine refusée.'},{status:403});
 try{const x=validateExercise(await request.json());if(x.day>parisDay())throw Error('La déclaration ne peut pas être datée dans le futur.');
 await env.DB!.prepare('INSERT INTO exercises (id,player,count,day,created,author,type) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(x.id,x.player,x.count,x.day,new Date().toISOString(),user.userId,x.type).run();
 const saved=await env.DB!.prepare('SELECT player,count,day,type FROM exercises WHERE id=?').bind(x.id).first();
 if(!saved||saved.player!==x.player||saved.count!==x.count||saved.day!==x.day||saved.type!==x.type)return Response.json({error:'Identifiant déjà utilisé.'},{status:409});return Response.json({ok:true});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Déclaration invalide.'},{status:400});}
}
const UNDO_WINDOW_MS=24*60*60*1000;
export async function DELETE(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Connexion requise.'},{status:401});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origine refusée.'},{status:403});
 const body=await request.json().catch(()=>null) as {id?:unknown}|null;const id=body?.id;
 if(typeof id!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(id))return Response.json({error:'Série inconnue.'},{status:400});
 const saved=await env.DB!.prepare('SELECT author,created FROM exercises WHERE id=?').bind(id).first() as {author:string;created:string}|null;
 if(!saved)return Response.json({error:'Série introuvable.'},{status:404});
 if(saved.author!==user.userId)return Response.json({error:'Seul l’auteur peut annuler cette série.'},{status:403});
 if(Date.now()-Date.parse(saved.created)>UNDO_WINDOW_MS)return Response.json({error:'Une série ne peut être annulée que dans les 24 heures.'},{status:403});
 await env.DB!.batch([env.DB!.prepare('DELETE FROM exercise_reactions WHERE exercise_id=?').bind(id),env.DB!.prepare('DELETE FROM exercises WHERE id=? AND author=?').bind(id,user.userId)]);
 return Response.json({ok:true});
}
