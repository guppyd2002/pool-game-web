/**
 * POPUP-001 — central popup lifecycle (P1-T08).
 * C# PopupManager + PopupBackPanel: open/close, backdrop, force-close-all.
 *
 * Panels register show/hide; manager owns the dimmed backdrop and stack order.
 */

export type PopupId = 'settings' | 'profile' | 'cues';

export interface PopupRegistration {
  show(): void;
  hide(): void;
}

export interface PopupManager {
  register(id: PopupId, panel: PopupRegistration): void;
  open(id: PopupId): void;
  close(id?: PopupId): void;
  closeAll(): void;
  isOpen(id: PopupId): boolean;
  /** Currently open popup ids (bottom → top). */
  stack(): readonly PopupId[];
  dispose(): void;
}

export function createPopupManager(container: HTMLElement): PopupManager {
  const registry = new Map<PopupId, PopupRegistration>();
  const openStack: PopupId[] = [];

  const backdrop = document.createElement('div');
  backdrop.id = 'popup-backdrop';
  backdrop.style.cssText = [
    'position:absolute', 'inset:0',
    'display:none',
    'background:rgba(0,0,0,0.55)',
    'z-index:340',
    'pointer-events:auto',
  ].join(';');
  backdrop.addEventListener('click', () => {
    // Close topmost popup (Unity back-panel tap)
    if (openStack.length > 0) close(openStack[openStack.length - 1]);
  });
  container.appendChild(backdrop);

  function _syncBackdrop(): void {
    backdrop.style.display = openStack.length > 0 ? 'block' : 'none';
  }

  function close(id?: PopupId): void {
    if (id == null) {
      if (openStack.length === 0) return;
      id = openStack[openStack.length - 1];
    }
    const idx = openStack.lastIndexOf(id);
    if (idx < 0) return;
    openStack.splice(idx, 1);
    registry.get(id)?.hide();
    _syncBackdrop();
  }

  return {
    register(id, panel): void {
      registry.set(id, panel);
    },

    open(id): void {
      const panel = registry.get(id);
      if (!panel) return;
      // If already open, bring to top
      const existing = openStack.indexOf(id);
      if (existing >= 0) openStack.splice(existing, 1);
      openStack.push(id);
      panel.show();
      _syncBackdrop();
    },

    close,

    closeAll(): void {
      while (openStack.length > 0) {
        const id = openStack.pop()!;
        registry.get(id)?.hide();
      }
      _syncBackdrop();
    },

    isOpen(id): boolean {
      return openStack.includes(id);
    },

    stack(): readonly PopupId[] {
      return [...openStack];
    },

    dispose(): void {
      while (openStack.length > 0) {
        const id = openStack.pop()!;
        registry.get(id)?.hide();
      }
      _syncBackdrop();
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      registry.clear();
    },
  };
}
