// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Reveal } from '@/components/marketing/product-visuals';

/**
 * `Reveal` hides its children until it decides they are on screen. If that
 * decision never happens, most of the homepage stays blank — which is why it
 * uses scroll maths rather than IntersectionObserver, and why the "already on
 * screen" case is asserted separately from the "scrolled to" case.
 *
 * The editor, batch and background-picker replicas that used to live in this
 * file are gone. The homepage mounts the real components now, and those are
 * covered by the tests that belong to them.
 */

afterEach(cleanup);

const VIEWPORT = 800;

function stubRect(element: Element, top: number): void {
  element.getBoundingClientRect = () => ({ top }) as DOMRect;
}

function mount(top: number) {
  // The component measures on mount, so the rect has to be in place before
  // React commits — patching the prototype is the only hook jsdom gives us.
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = () => ({ top }) as DOMRect;
  const view = render(
    <Reveal>
      <p>Section body</p>
    </Reveal>,
  );
  Element.prototype.getBoundingClientRect = original;
  return view;
}

describe('Reveal', () => {
  it('reveals content already on screen without waiting for a scroll', () => {
    const view = mount(100);
    expect(view.container.querySelector('.reveal-in')).not.toBeNull();
  });

  it('leaves content below the fold hidden until it is scrolled to', () => {
    const view = mount(VIEWPORT * 2);
    const wrapper = view.container.querySelector('.reveal');
    if (!wrapper) throw new Error('reveal wrapper did not render');
    expect(wrapper.classList.contains('reveal-in')).toBe(false);

    stubRect(wrapper, 200);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(wrapper.classList.contains('reveal-in')).toBe(true);
  });

  it('detaches its listener once it has fired, leaving none behind', () => {
    const view = mount(VIEWPORT * 2);
    const wrapper = view.container.querySelector('.reveal');
    if (!wrapper) throw new Error('reveal wrapper did not render');

    stubRect(wrapper, 0);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    // A second scroll must not throw or re-measure a detached element.
    stubRect(wrapper, VIEWPORT * 3);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(wrapper.classList.contains('reveal-in')).toBe(true);
  });

  it('applies a stagger delay as a transition delay', () => {
    const view = render(
      <Reveal delay={120}>
        <p>Delayed</p>
      </Reveal>,
    );
    const wrapper = view.container.querySelector('.reveal') as HTMLElement;
    expect(wrapper.style.transitionDelay).toBe('120ms');
  });
});
