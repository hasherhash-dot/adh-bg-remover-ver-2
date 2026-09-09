import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

export function InnerCta() {
  return <aside className="inner-cta"><div><p className="inner-eyebrow">YOUR NEXT IMAGE STARTS HERE</p><h2>Keep the subject.<br/><em>Make it your own.</em></h2></div><div><Link href="/remove-background" className="inner-button">Upload your image <ArrowUpRight size={19} aria-hidden/></Link><a href="https://compress.americandesignhub.com" className="inner-secondary" target="_blank" rel="noreferrer">Explore image compressor ↗</a></div></aside>;
}
