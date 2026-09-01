// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BatchStrip } from '@/components/marketing/batch-strip';
import { BackgroundSwap } from '@/components/marketing/background-swap';
import { EdgeCrops } from '@/components/marketing/edge-crops';
import { EditorPreview } from '@/components/marketing/editor-preview';

/**
 * The homepage's demonstrations.
 *
 * These exist because the page's whole argument is "we show the capability
 * rather than describing it" — so a demonstration that silently stops
 * demonstrating is a worse failure here than a broken layout. Each test below
 * asserts the thing a visitor is supposed to *see*, not the implementation that
 * produces it.
 *
 * `BatchStrip`'s reduced-motion branch is covered separately from its animated
 * one because a browser cannot easily be made to exercise both, and the
 * finished state is the one that carries the meaning.
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** jsdom has no matchMedia. Every component here asks about reduced motion. */
function stubMotionPreference(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('reduce') ? reduce : !reduce,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia;
}

/** `useInView` measures against the viewport; put the element on screen. */
function placeOnScreen() {
  Element.prototype.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
}

beforeEach(() => {
  stubMotionPreference(false);
  placeOnScreen();
});

/* ------------------------------------------------------------------ batch -- */

const ITEMS = [
  { filename: 'a.jpg', beforeUrl: '/a-before.webp', afterUrl: '/a-after.webp' },
  { filename: 'b.jpg', beforeUrl: '/b-before.webp', afterUrl: '/b-after.webp' },
  { filename: 'c.jpg', beforeUrl: '/c-before.webp', afterUrl: '/c-after.webp' },
];

describe('BatchStrip', () => {
  it('advances every row from queued through processing to done', () => {
    vi.useFakeTimers();
    render(<BatchStrip items={ITEMS} />);

    expect(screen.getAllByText('Queued')).toHaveLength(3);

    // Far enough in for the first row to be working but not yet finished.
    act(() => void vi.advanceTimersByTime(600));
    expect(screen.getByText('Removing background')).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(5_000));
    expect(screen.getAllByText('Done')).toHaveLength(3);
    expect(screen.queryByText('Queued')).not.toBeInTheDocument();
  });

  it('never shows a percentage, because the real queue has none to show', () => {
    vi.useFakeTimers();
    const { container } = render(<BatchStrip items={ITEMS} />);
    act(() => void vi.advanceTimersByTime(700));

    expect(container.textContent).not.toMatch(/\d+\s?%/);
    // The processing row is indeterminate instead.
    expect(container.querySelector('.indeterminate')).not.toBeNull();
  });

  it('enables the ZIP action only once the whole run has settled', () => {
    vi.useFakeTimers();
    const { container } = render(<BatchStrip items={ITEMS} />);

    const zip = () =>
      [...container.querySelectorAll('span')].find((node) =>
        node.textContent?.startsWith('Download all'),
      );

    expect(zip()?.className).not.toContain('bg-accent');
    act(() => void vi.advanceTimersByTime(5_000));
    expect(zip()?.className).toContain('bg-accent');
  });

  it('jumps straight to the finished state when reduced motion is preferred', () => {
    stubMotionPreference(true);
    render(<BatchStrip items={ITEMS} />);

    // No timers advanced: the story must already be legible.
    expect(screen.getAllByText('Done')).toHaveLength(3);
  });
});

/* ------------------------------------------------------- background swap -- */

const SWAP_OPTIONS = [
  { id: 'transparent', label: 'Transparent', note: 'Alpha kept.' },
  { id: 'white', label: 'White', color: '#ffffff', note: 'On white.' },
  { id: 'red', label: 'ADH red', color: '#cd0f36', note: 'On brand red.' },
];

describe('BackgroundSwap', () => {
  function mount() {
    return render(
      <BackgroundSwap
        cutoutUrl="/cutout.webp"
        alt="A cut-out"
        width={100}
        height={100}
        options={SWAP_OPTIONS}
      />,
    );
  }

  it('starts transparent, with no colour layer covering the checkerboard', () => {
    const { container } = mount();
    const shown = [...container.querySelectorAll('span[aria-hidden]')].filter((node) =>
      node.className.includes('opacity-100'),
    );
    expect(shown).toHaveLength(0);
  });

  it('shows exactly one backdrop at a time', () => {
    const { container } = mount();
    const visible = () =>
      [...container.querySelectorAll('span[aria-hidden]')].filter((node) =>
        node.className.includes('opacity-100'),
      );

    act(() => screen.getByRole('radio', { name: /White/ }).click());
    expect(visible()).toHaveLength(1);

    act(() => screen.getByRole('radio', { name: /ADH red/ }).click());
    expect(visible()).toHaveLength(1);
    // jsdom serialises the hex as rgb(), so assert the resolved colour.
    expect(visible()[0]?.getAttribute('style')).toContain('rgb(205, 15, 54)');
  });

  it('keeps the subject mounted across every switch, so nothing re-decodes', () => {
    const { container } = mount();
    const subject = container.querySelector('img[alt="A cut-out"]');
    act(() => screen.getByRole('radio', { name: /White/ }).click());
    expect(container.querySelector('img[alt="A cut-out"]')).toBe(subject);
  });

  it('explains the selected option', () => {
    mount();
    act(() => screen.getByRole('radio', { name: /ADH red/ }).click());
    expect(screen.getByText('On brand red.')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------ edge crops -- */

const CROPS = [
  {
    key: 'hair',
    beforeUrl: '/hair-before.webp',
    afterUrl: '/hair-after.webp',
    title: 'Hair',
    note: 'Strands.',
    width: 760,
    height: 520,
    span: 'lg:col-span-5',
  },
  {
    key: 'fur',
    beforeUrl: '/fur-before.webp',
    afterUrl: '/fur-after.webp',
    title: 'Fur',
    note: 'Whiskers.',
    width: 430,
    height: 320,
    span: 'lg:col-span-3',
  },
];

describe('EdgeCrops', () => {
  it('shows the photograph first, so the difficulty is visible before the claim', () => {
    const { container } = render(<EdgeCrops crops={CROPS} />);
    const frames = container.querySelectorAll('figure > div');
    frames.forEach((frame) => {
      expect(frame.className).not.toContain('checkerboard');
      expect(frame.className).not.toContain('bg-navy');
    });
  });

  it('switches every crop together, including onto a solid colour', () => {
    const { container } = render(<EdgeCrops crops={CROPS} />);
    const frames = () => [...container.querySelectorAll('figure > div')];

    act(() => screen.getByRole('radio', { name: 'Cut-out' }).click());
    frames().forEach((frame) => expect(frame.className).toContain('checkerboard'));

    act(() => screen.getByRole('radio', { name: 'On colour' }).click());
    frames().forEach((frame) => expect(frame.className).toContain('bg-navy'));
  });

  it('states the native pixel size, which is the point of the crops', () => {
    render(<EdgeCrops crops={CROPS} />);
    expect(screen.getByText('760 × 520')).toBeInTheDocument();
    expect(screen.getByText('430 × 320')).toBeInTheDocument();
  });
});

/* --------------------------------------------------------- editor preview -- */

describe('EditorPreview', () => {
  function mount() {
    return render(
      <EditorPreview cutoutUrl="/cutout.webp" alt="A cut-out" filename="tiger.png" />,
    );
  }

  it('changes the frame when a crop ratio is chosen', () => {
    const { container } = mount();
    const canvas = () => container.querySelector('div.checkerboard') as HTMLElement;

    expect(canvas().style.aspectRatio).toBe('3 / 2');
    act(() => screen.getByRole('radio', { name: '1:1' }).click());
    // jsdom normalises aspect-ratio to its two-value form.
    expect(canvas().style.aspectRatio).toBe('1 / 1');
    act(() => screen.getByRole('radio', { name: '16:9' }).click());
    expect(canvas().style.aspectRatio).toBe(`${16 / 9} / 1`);
  });

  it('changes the padding from the slider', () => {
    const { container } = mount();
    const canvas = container.querySelector('div.checkerboard') as HTMLElement;
    const slider = screen.getByLabelText('Padding around the subject') as HTMLInputElement;

    expect(canvas.style.padding).toBe('8%');
    // React tracks the input's value, so a raw assignment is swallowed.
    // fireEvent.change goes through the tracker the way a real drag does.
    act(() => void fireEvent.change(slider, { target: { value: '20' } }));
    expect(canvas.style.padding).toBe('20%');
  });

  it('keeps the decorative controls out of reach rather than dead on click', () => {
    const { container } = mount();
    // Undo/redo, scale, rotate, background and download are shown but inert:
    // a button that silently does nothing is worse than one you cannot press.
    const inertRegions = container.querySelectorAll('[inert]');
    expect(inertRegions.length).toBeGreaterThan(0);

    // Only the two live controls are real buttons.
    const roles = [...container.querySelectorAll('button')];
    expect(roles.every((node) => node.closest('[inert]') === null)).toBe(true);
  });
});
