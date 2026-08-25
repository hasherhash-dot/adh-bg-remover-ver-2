// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BackgroundSwapDemo, BeforeAfter, Reveal } from '@/components/marketing/product-visuals';

/**
 * The homepage's product visuals.
 *
 * These are the only interactive things on a page whose whole job is to be
 * convincing, so they get real coverage. Two of them have a failure mode that
 * is invisible in review and obvious to a visitor:
 *
 *  - `Reveal` hides its children until it decides they are on screen. If that
 *    decision never happens, most of the homepage stays blank.
 *  - `BeforeAfter` used to call setPointerCapture before moving the divider,
 *    so a browser that refused the capture swallowed the whole interaction.
 *
 * Both are asserted below.
 */

afterEach(cleanup);

/** jsdom gives every element a zero-size rect, so the geometry is supplied. */
function stubRect(element: Element, rect: Partial<DOMRect>): void {
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, ...rect }) as DOMRect;
}

function clipOf(container: HTMLElement): string {
  const clipped = container.querySelector<HTMLElement>('[style*="clip-path"]');
  return clipped?.style.clipPath ?? '';
}

describe('BeforeAfter', () => {
  function setup() {
    const view = render(
      <BeforeAfter before="/a.webp" after="/b.webp" alt="Example" initial={50} />,
    );
    const frame = view.container.querySelector<HTMLElement>('.cursor-ew-resize');
    if (!frame) throw new Error('comparison frame did not render');
    stubRect(frame, { left: 100, width: 400, top: 0, height: 300 });
    return { view, frame };
  }

  it('shows both images with the after state as the labelled subject', () => {
    setup();
    expect(screen.getByAltText('Example')).toHaveAttribute('src', '/b.webp');
    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
  });

  it('moves the divider to wherever the pointer goes down', () => {
    const { view, frame } = setup();
    expect(clipOf(view.container)).toBe('inset(0 50% 0 0)');

    // 300px into a frame that starts at 100 and is 400 wide → 50%… so pick a
    // point that cannot coincide with the initial value.
    fireEvent.pointerDown(frame, { clientX: 200, pointerId: 1 });
    expect(clipOf(view.container)).toBe('inset(0 75% 0 0)');
  });

  it('keeps working when the browser refuses pointer capture', () => {
    const { view, frame } = setup();
    frame.setPointerCapture = () => {
      throw new DOMException('no such pointer', 'NotFoundError');
    };

    fireEvent.pointerDown(frame, { clientX: 400, pointerId: 1 });
    expect(clipOf(view.container)).toBe('inset(0 25% 0 0)');
  });

  it('tracks a drag and stops once the pointer is released', () => {
    const { view, frame } = setup();
    frame.setPointerCapture = () => undefined;
    frame.hasPointerCapture = () => false;

    fireEvent.pointerDown(frame, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(frame, { clientX: 400, pointerId: 1 });
    expect(clipOf(view.container)).toBe('inset(0 25% 0 0)');

    fireEvent.pointerUp(frame, { clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(frame, { clientX: 140, pointerId: 1 });
    expect(clipOf(view.container)).toBe('inset(0 25% 0 0)');
  });

  it('clamps to the frame when the pointer leaves it', () => {
    const { view, frame } = setup();
    fireEvent.pointerDown(frame, { clientX: -500, pointerId: 1 });
    expect(clipOf(view.container)).toBe('inset(0 100% 0 0)');

    fireEvent.pointerMove(frame, { clientX: 5000, pointerId: 1 });
    expect(clipOf(view.container)).toBe('inset(0 0% 0 0)');
  });
});

describe('BackgroundSwapDemo', () => {
  it('starts transparent and applies the colour that is chosen', () => {
    const view = render(<BackgroundSwapDemo src="/cutout.webp" alt="Cut-out" />);
    const stage = view.container.querySelector<HTMLElement>('.aspect-4\\/3');
    if (!stage) throw new Error('stage did not render');

    expect(stage.className).toContain('checkerboard');
    expect(screen.getByRole('button', { name: /Transparent/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: /Navy/ }));

    expect(stage.className).not.toContain('checkerboard');
    expect(stage.style.background).toContain('rgb(21, 53, 102)');
    expect(screen.getByRole('button', { name: /Navy/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Transparent/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('Reveal', () => {
  const height = 800;

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

  it('reveals content that is already on screen without waiting for a scroll', () => {
    const view = mount(100);
    expect(view.container.querySelector('.reveal-in')).not.toBeNull();
  });

  it('leaves content below the fold hidden until it is scrolled to', () => {
    const view = mount(height * 2);
    const wrapper = view.container.querySelector('.reveal');
    if (!wrapper) throw new Error('reveal wrapper did not render');
    expect(wrapper.classList.contains('reveal-in')).toBe(false);

    stubRect(wrapper, { top: 200 });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(wrapper.classList.contains('reveal-in')).toBe(true);
  });

  it('detaches its listener once it has fired, leaving none behind', () => {
    const view = mount(height * 2);
    const wrapper = view.container.querySelector('.reveal');
    if (!wrapper) throw new Error('reveal wrapper did not render');

    stubRect(wrapper, { top: 0 });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    // A second scroll must not throw or re-measure a detached element.
    stubRect(wrapper, { top: height * 3 });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(wrapper.classList.contains('reveal-in')).toBe(true);
  });
});
