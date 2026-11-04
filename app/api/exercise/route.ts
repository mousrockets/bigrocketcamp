import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { validateExercise,parisDay } from '../../../lib/domain.mjs';
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Connexion requise.'},{status:401});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origine refusée.'},{status:403});
 try{const x=validateExercise(await request.json());if(x.day>parisDay())throw Error('La déclaration ne peut pas être datée dans le futur.');
 await env.DB!.prepare('INSERT INTO exercises (id,player,count,day,created,author) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(x.id,x.player,x.count,x.day,new Date().toISOString(),user.userId).run();
 const saved=await env.DB!.prepare('SELECT player,count,day FROM exercises WHERE id=?').bind(x.id).first();
 if(!saved||saved.player!==x.player||saved.count!==x.count||saved.day!==x.day)return Response.json({error:'Identifiant déjà utilisé.'},{status:409});return Response.json({ok:true});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Déclaration invalide.'},{status:400});}
}
