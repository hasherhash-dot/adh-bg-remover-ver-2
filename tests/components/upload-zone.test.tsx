// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UploadZone } from '@/components/upload/upload-zone';

/**
 * The upload zone is the first thing every user touches, so its four input
 * paths (click, keyboard, drop, paste) are covered here along with the
 * accessibility contract that makes the keyboard path work at all.
 */

afterEach(cleanup);

function imageFile(name = 'photo.png', type = 'image/png'): File {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type });
}

describe('UploadZone', () => {
  it('exposes the drop area as a labelled button with format guidance', () => {
    render(<UploadZone onFiles={vi.fn()} />);

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAccessibleDescription(/JPG, PNG, WEBP or HEIC/i);
    expect(screen.getByText(/up to 25MB/i)).toBeInTheDocument();
  });

  it('opens the file picker when activated by keyboard', async () => {
    const user = userEvent.setup();
    render(<UploadZone onFiles={vi.fn()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});

    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(clickSpy).toHaveBeenCalled();
  });

  it('emits selected files with the browse source', async () => {
    const onFiles = vi.fn();
    const user = userEvent.setup();
    render(<UploadZone onFiles={onFiles} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, imageFile());

    expect(onFiles).toHaveBeenCalledOnce();
    const [files, source] = onFiles.mock.calls[0] as [File[], string];
    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe('photo.png');
    expect(source).toBe('browse');
  });

  it('changes appearance while a file is dragged over it', () => {
    render(<UploadZone onFiles={vi.fn()} />);
    const button = screen.getByRole('button');

    expect(screen.getByText('Drop an image here')).toBeInTheDocument();

    fireEvent.dragEnter(button, { dataTransfer: { types: ['Files'], files: [] } });
    expect(screen.getByText('Drop to remove the background')).toBeInTheDocument();

    fireEvent.dragLeave(button, { dataTransfer: { types: ['Files'], files: [] } });
    expect(screen.getByText('Drop an image here')).toBeInTheDocument();
  });

  it('emits dropped files with the drop source', () => {
    const onFiles = vi.fn();
    render(<UploadZone onFiles={onFiles} />);

    const file = imageFile('dropped.jpg', 'image/jpeg');
    fireEvent.drop(screen.getByRole('button'), {
      dataTransfer: { types: ['Files'], files: [file] },
    });

    expect(onFiles).toHaveBeenCalledWith([file], 'drop');
  });

  it('accepts an image pasted anywhere on the page', () => {
    const onFiles = vi.fn();
    render(<UploadZone onFiles={onFiles} />);

    const file = imageFile('clipboard.png');
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: [file] } });
    window.dispatchEvent(event);

    expect(onFiles).toHaveBeenCalledWith([file], 'paste');
  });

  it('ignores a paste that carries no image', () => {
    const onFiles = vi.fn();
    render(<UploadZone onFiles={onFiles} />);

    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] },
    });
    window.dispatchEvent(event);

    expect(onFiles).not.toHaveBeenCalled();
  });

  it('passes through only one file when multiple is off', () => {
    const onFiles = vi.fn();
    render(<UploadZone onFiles={onFiles} multiple={false} />);

    fireEvent.drop(screen.getByRole('button'), {
      dataTransfer: { types: ['Files'], files: [imageFile('a.png'), imageFile('b.png')] },
    });

    expect((onFiles.mock.calls[0] as [File[], string])[0]).toHaveLength(1);
  });

  it('accepts nothing while disabled', () => {
    const onFiles = vi.fn();
    render(<UploadZone onFiles={onFiles} disabled />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();

    fireEvent.drop(button, { dataTransfer: { types: ['Files'], files: [imageFile()] } });
    expect(onFiles).not.toHaveBeenCalled();
  });
});
