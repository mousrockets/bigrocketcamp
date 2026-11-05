import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
export async function GET(){
 if(!await getChatGPTUser())return Response.json({error:'Connexion requise.'},{status:401});
 const db=env.DB!;const [results,exercises,collectors,matchRosters]=await Promise.all([db.prepare('SELECT * FROM results ORDER BY day DESC,received DESC,rowid DESC').all(),db.prepare('SELECT * FROM exercises ORDER BY created DESC').all(),db.prepare('SELECT * FROM collectors ORDER BY last_seen DESC').all(),db.prepare('SELECT * FROM match_rosters').all()]);
 return Response.json({results:results.results,exercises:exercises.results,collectors:collectors.results,matchRosters:matchRosters.results},{headers:{'Cache-Control':'no-store'}});
}
