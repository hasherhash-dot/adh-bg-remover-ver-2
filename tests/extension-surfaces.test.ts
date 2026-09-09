// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';

describe('extension UI integration',()=>{
 for(const page of ['popup','options','result']){
  it(`${page} retains every element used by its controller`,()=>{
   const source=readFileSync(`extension/src/${page}.ts`,'utf8');
   const html=readFileSync(`extension/src/${page}.html`,'utf8');
   const doc=new DOMParser().parseFromString(html,'text/html');
   const ids=[...source.matchAll(/(?:byId|el)<[^>]+>\('([^']+)'\)/g)].map(m=>m[1]);
   expect(ids.length).toBeGreaterThan(4);
   for(const id of ids)expect(doc.querySelectorAll(`[id="${id}"]`).length,`${page}: #${id}`).toBe(1);
   expect(doc.querySelector('h1')).not.toBeNull();
   expect(doc.querySelector('script[type="module"]')?.getAttribute('src')).toBe(`${page}.js`);
   expect(doc.querySelector('img.brand-logo')?.getAttribute('src')).toBe('assets/adh-logo.svg');
  });
 }
});
