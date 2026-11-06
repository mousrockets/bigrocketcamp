import {readFileSync} from 'node:fs';
import {transpileModule,ModuleKind,JsxEmit} from 'typescript';

// Execute actual client components with React; substitute only module resolution.
function compile(path,aliases={}){
 const source=readFileSync(new URL(path,import.meta.url),'utf8');
 let code=transpileModule(source,{compilerOptions:{module:ModuleKind.ESNext,jsx:JsxEmit.ReactJSX}}).outputText;
 const modules={'react/jsx-runtime':import.meta.resolve('react/jsx-runtime'),react:import.meta.resolve('react'),
  '../lib/domain.mjs':new URL('../../lib/domain.mjs',import.meta.url).href,
  '../lib/season.mjs':new URL('../../lib/season.mjs',import.meta.url).href,
  '../lib/doubles-ranks.mjs':new URL('../../lib/doubles-ranks.mjs',import.meta.url).href,...aliases};
 for(const [specifier,url] of Object.entries(modules))for(const quote of ["'",'"'])code=code.replaceAll(quote+specifier+quote,JSON.stringify(url));
 return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const monthlyUrl=compile('../../app/monthly-mmr.tsx');
export const {default:MonthlyMmr}=await import(monthlyUrl);
export const {default:Dashboard}=await import(compile('../../app/dashboard.tsx',{'./monthly-mmr':monthlyUrl}));
