import { ArrowRight, ArrowUpRight, MoveUpRight, Plus } from 'lucide-react';
import { SiteShell } from '@/components/layout/site-shell';
import { BackgroundRemoverStudio } from '@/components/studio/background-remover-studio';
import { BeforeAfterSlider } from '@/components/compare/before-after-slider';
import { HeroScene } from '@/components/marketing/hero-scene';
import { BackgroundSwap } from '@/components/marketing/background-swap';
import { EditorPreview } from '@/components/marketing/editor-preview';
import { Faq } from '@/components/marketing/faq';
import { JsonLd } from '@/components/marketing/json-ld';
import { FAQ, HOW_IT_WORKS } from '@/lib/marketing/homepage-content';
import { applicationSchema, buildGraph, faqSchema, howToSchema, organisationSchema, websiteSchema } from '@/lib/seo/structured-data';
import './homepage.css';

const S='/showcase/studio';
const backgrounds=[
  {id:'transparent',label:'Transparent',note:'The real alpha channel. Ready to place into your own design.'},
  {id:'white',label:'White',color:'#ffffff',note:'A white background for a clean, minimal composition.'},
  {id:'blue',label:'Sky',color:'#c2d7f5',note:'A change of colour. A different feeling.'},
  {id:'pink',label:'Rose',color:'#f5c4d7',note:'A soft pink canvas, with the same original subject.'},
  {id:'dark',label:'Midnight',color:'#102844',note:'A darker setting brings the flowers into focus.'},
];

function UploadCta(){
  return <a href="#hero-uploader" className="home-cta">Upload your image <ArrowUpRight size={19} aria-hidden/></a>;
}

export default function HomePage(){
  const graph=buildGraph([organisationSchema(),websiteSchema(),applicationSchema(),howToSchema(HOW_IT_WORKS.map(({name,text})=>({name,text}))),faqSchema(FAQ)]);
  return <SiteShell><JsonLd data={graph}/><div className="adh-home">
    <section className="home-container home-hero" aria-labelledby="home-title">
      <HeroScene beforeUrl={`${S}/headphones-before.webp`} afterUrl={`${S}/headphones-after.webp`} width={1200} height={900}><BackgroundRemoverStudio className="home-studio"/></HeroScene>
    </section>
    <div className="home-use-strip" aria-label="Ways to use your cut-outs"><span>PRODUCT SHOTS</span><Plus size={13} aria-hidden/><span>CAMPAIGN IMAGES</span><Plus size={13} aria-hidden/><span>PROFILE PICTURES</span><Plus size={13} aria-hidden/><span>YOUR NEXT IDEA</span></div>

    <section className="home-container home-section home-campaigns" aria-labelledby="campaign-title">
      <div className="home-section-heading"><div><p className="home-kicker">LESS EDITING. MORE MAKING.</p><h2 id="campaign-title">Take your images<br /><em>out of the ordinary.</em></h2></div><p className="home-lede">A new launch. A new look. A new direction.<br />Start with the subject, and build from there.</p></div>
      <div className="home-campaign-grid">
        <figure className="home-fashion-poster"><span className="home-poster-meta">THE CREATIVE EDIT / 01</span><span className="home-fashion-type" aria-hidden>MAKE<br />AN<br />ENTRANCE.</span><img src={`${S}/fashion-after.webp`} alt="Fashion portrait in a red blazer, isolated by ADH" width={1067} height={1600} loading="lazy"/><figcaption><a href="/profile-pictures"><span>Made for your next impression<small>Portraits &amp; personal projects</small></span><ArrowUpRight size={24} aria-hidden/></a></figcaption></figure>
        <div className="home-product-story"><figure className="home-sneaker-poster"><span className="home-poster-meta">THE PRODUCT EDIT / 02</span><span className="home-sneaker-type" aria-hidden>Fresh<br />perspective.</span><div className="home-product-plinth" aria-hidden/><img src={`${S}/sneaker-after.webp`} alt="Pink sneakers isolated by ADH for a product composition" width={1200} height={952} loading="lazy"/><figcaption>REAL PHOTO. REAL ADH CUT-OUT.</figcaption></figure><a className="home-product-link" href="/product-photos"><span>Put your product in the spotlight.<small>Clear the background. Keep the character.</small></span><ArrowUpRight size={27} aria-hidden/></a><p className="home-art-note">Background colours and layouts are compositions. The subjects are actual ADH outputs.</p></div>
      </div>
      <div className="home-section-actions"><UploadCta/></div>
    </section>

    <section id="result" className="home-proof" aria-labelledby="proof-title"><div className="home-container home-section home-proof-grid">
      <div className="home-proof-copy"><p className="home-kicker">THE PROOF IS IN THE PICTURE</p><h2 id="proof-title">From a busy street<br /><em>to a blank canvas.</em></h2><p className="home-lede">Move the divider. The original photograph is on one side, the actual ADH result on the other.</p><div className="home-proof-instruction"><span>↔</span><p>Drag to compare.<br /><strong>Zoom in. Look closer.</strong></p></div><dl className="home-specs"><div><dt>Subject</dt><dd>Street-style portrait</dd></div><div><dt>Result</dt><dd>Transparent background</dd></div><div><dt>Processed with</dt><dd>ADH engine</dd></div></dl><div className="home-section-actions"><UploadCta/></div></div>
      <div className="home-compare"><BeforeAfterSlider beforeUrl={`${S}/portrait-before.webp`} afterUrl={`${S}/portrait-after.webp`} alt="Street portrait before and after real ADH background removal" maxViewportHeight={76}/><p>One photograph. An actual engine result.</p></div>
    </div></section>

    <section className="home-backgrounds" aria-labelledby="scene-title"><div className="home-container home-section home-background-grid">
      <BackgroundSwap cutoutUrl={`${S}/flowers-after.webp`} alt="Pink flowers and their vase on your chosen background" width={1032} height={1200} options={backgrounds} className="home-swap"/>
      <div className="home-background-copy"><p className="home-kicker">MAKE A LITTLE ROOM FOR COLOUR</p><h2 id="scene-title">Same flowers.<br /><em>New atmosphere.</em></h2><p className="home-lede">Keep it transparent, go crisp white, or choose a colour that feels like you. A cut-out is just the beginning.</p><div className="home-swatch-hint"><MoveUpRight size={28} aria-hidden/><span>Pick a colour.<br />Watch the setting change.</span></div><div className="home-section-actions"><UploadCta/></div><span className="home-colour-word" aria-hidden>In full<br />bloom.</span></div>
    </div></section>

    <section className="home-container home-section home-editor" aria-labelledby="edit-title"><div className="home-section-heading"><div><p className="home-kicker">THE LAST FEW TOUCHES</p><h2 id="edit-title">Find your frame.<br /><em>Finish your image.</em></h2></div><p className="home-lede">Crop, rotate, adjust the scale, and leave some breathing room. Try the editor with this armchair cut-out, then bring your own image.</p></div><div className="home-editor-frame"><EditorPreview cutoutUrl={`${S}/armchair-after.webp`} alt="Interactive editor with a real ADH cut-out of a sculptural armchair" width={1200} height={1200} filename="armchair-no-background.png"/></div><ol className="home-steps">{HOW_IT_WORKS.map((step,i)=><li key={step.name}><span>0{i+1}</span><div><h3>{step.name}</h3><p>{step.text}</p></div></li>)}</ol><div className="home-section-actions"><UploadCta/></div></section>

    <section className="home-products home-container home-section" aria-labelledby="products-title">
      <div className="home-section-heading"><div><p className="home-kicker">MORE FROM AMERICAN DESIGN HUB</p><h2 id="products-title">One creative toolkit.<br/><em>More possibilities.</em></h2></div><p className="home-lede">Give your images a fresh start, prepare them for the web, or get to know the studio behind the tools.</p></div>
      <div className="home-products-grid">
        <article className="home-product-feature"><div className="home-product-number">01 / CREATE</div><div className="home-product-symbol" aria-hidden>ADH<span>↗</span></div><h3>A clear start for your image.</h3><p>Remove the background, find your composition, and download your PNG.</p><UploadCta/></article>
        <div className="home-product-companions"><article><span className="home-product-number">02 / OPTIMISE</span><h3>Smaller files.<br/>Ready for the web.</h3><p>Explore the ADH Image Compressor for your next upload.</p><a href="https://compress.americandesignhub.com" target="_blank" rel="noreferrer" className="home-text-link">Open image compressor <ArrowUpRight size={18} aria-hidden/></a></article><article><span className="home-product-number">03 / MEET THE STUDIO</span><h3>The people behind ADH.</h3><p>Discover American Design Hub and our creative work.</p><a href="https://americandesignhub.com" target="_blank" rel="noreferrer" className="home-text-link">Know about ADH <ArrowUpRight size={18} aria-hidden/></a></article></div>
      </div>
    </section>
    <section className="home-faq-wrap"><div className="home-container home-section home-faq"><div><p className="home-kicker">GOOD TO KNOW</p><h2>Before<br /><em>you begin.</em></h2><p className="home-lede">Your questions, answered.</p><div className="home-section-actions"><UploadCta/></div></div><Faq items={FAQ}/></div></section>
    <section className="home-last home-container"><p className="home-kicker">A FRESH START FOR YOUR NEXT IMAGE</p><h2>You bring the image.<br /><em>We’ll clear the background.</em></h2><a href="#hero-uploader" className="home-cta">Upload your image <ArrowRight size={20} aria-hidden/></a><p>Full-resolution PNG. No watermark. No account.</p><div className="home-last-rule"><span>AMERICAN DESIGN HUB</span><span>MADE FOR YOUR NEXT IDEA ↗</span></div></section>
    <details className="home-credits home-container"><summary>Photography &amp; real ADH examples</summary><p>Source photographs from Pexels. Cut-outs processed locally using the ADH engine; colour backgrounds and layouts added for presentation.</p><div>{[['Headphones','28739256'],['Sneakers','20228177'],['Street portrait','11132668'],['Studio portrait','5621194'],['Flowers','7292004'],['Armchair','32304969']].map(([name,id])=><a key={id} href={`https://www.pexels.com/photo/${id}/`} target="_blank" rel="noreferrer">{name} ↗</a>)}</div></details>
  </div></SiteShell>;
}
