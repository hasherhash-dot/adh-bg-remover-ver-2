import { SiteShell } from '@/components/layout/site-shell';

export interface LegalSection { id: string; title: string; paragraphs: string[]; }
export function LegalPage({title,intro,sections}:{title:string;intro:string;sections:LegalSection[]}) {
 return <SiteShell><div className="inner-page"><header><h1>{title}</h1><p className="mt-5 text-ink-muted">{intro}</p><p className="mt-5 text-xs text-ink-subtle">Last updated: 9 September 2026</p></header><div className="legal-grid"><nav className="legal-toc" aria-label="On this page"><p className="inner-eyebrow">ON THIS PAGE</p>{sections.map(s=><a key={s.id} href={`#${s.id}`}>{s.title}</a>)}</nav><article className="legal-body">{sections.map(s=><section key={s.id} id={s.id}><h2>{s.title}</h2>{s.paragraphs.map(p=><p key={p}>{p}</p>)}</section>)}<section id="contact"><h2>Contact American Design Hub</h2><p>Questions about these policies or your information? Email <a href="mailto:hello@americandesignhub.com">hello@americandesignhub.com</a>.</p><p><a href="/privacy-policy">Privacy Policy</a> · <a href="/terms">Terms and Conditions</a></p></section></article></div></div></SiteShell>;
}
