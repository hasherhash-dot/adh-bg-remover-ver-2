import { ArrowDown, ArrowUpRight, Check, ScanLine } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface HeroSceneProps {
  beforeUrl: string;
  afterUrl: string;
  width: number;
  height: number;
  children: React.ReactNode;
  className?: string;
}

export function HeroScene({beforeUrl, afterUrl, width, height, children, className}: HeroSceneProps) {
  return (
    <div className={cn('home-workbench',className)}>
      <div className="home-upload-panel" id="hero-uploader">
        <p className="home-kicker"><span className="home-dot" /> THE ADH BACKGROUND REMOVER</p>
        <h1 id="home-title"><span className="home-headline-line">Backgrounds off.</span><span className="home-headline-line">Creativity on.</span></h1>
        <p className="home-hero-lede">Turn your photo into a transparent cut-out.<br />Then take it somewhere entirely new.</p>
        {children}
        <div className="home-assurances"><span><Check size={13} aria-hidden /> Full resolution</span><span><Check size={13} aria-hidden /> No watermark</span><span><Check size={13} aria-hidden /> No account</span></div>
        <a className="home-hero-explore" href="#result">Explore a real result <ArrowDown size={15} aria-hidden /></a>
      </div>
      <figure className="home-art">
        <div className="home-art-top"><span><ScanLine size={15} aria-hidden /> PHOTO IN. POSSIBILITY OUT.</span><span>ADH / 01</span></div>
        <span className="home-art-word" aria-hidden>OFF<br />BEAT.</span>
        <div className="home-art-orbit" aria-hidden />
        <img className="home-art-subject" src={afterUrl} alt="White headphones cut out by the ADH engine" width={width} height={height} fetchPriority="high" />
        <div className="home-original"><img src={beforeUrl} alt="Original headphones photo on a yellow background" width={width} height={height} /><span>THE ORIGINAL <ArrowUpRight size={13} aria-hidden /></span></div>
        <figcaption><span><span className="home-dot" /> BACKGROUND REMOVED BY ADH</span><span>TRANSPARENT CUT-OUT ↗</span></figcaption>
      </figure>
    </div>
  );
}
