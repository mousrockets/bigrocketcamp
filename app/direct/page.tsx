import {requireChatGPTUser} from '../chatgpt-auth';
import Live from './client';
export const dynamic='force-dynamic';
export default async function Page(){await requireChatGPTUser('/direct');return <Live/>;}
