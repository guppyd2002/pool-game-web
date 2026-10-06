/**
 * Phase 1 / 0-A CTO C2 — DOM metrics format without scene/GLB.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { formatDomMetrics } from '../../layout/probe-metrics';

describe('formatDomMetrics (CTO C2 — no GLB)', () => {
  let app: HTMLElement;

  beforeEach(() => {
    app = document.createElement('div');
    app.id = 'app';
    Object.defineProperty(app, 'getBoundingClientRect', {
      value: () => ({
        width: 800,
        height: 400,
        left: 0,
        top: 0,
        right: 800,
        bottom: 400,
        x: 0,
        y: 0,
        toJSON() {
          return {};
        },
      }),
    });
    document.body.appendChild(app);
  });

  afterEach(() => {
    app.remove();
  });

  it('renders viewport + #app lines while canvas pending', () => {
    const text = formatDomMetrics({ app, status: 'scene/GLB: loading…' });
    expect(text).toContain('0-A LAYOUT PROBE');
    expect(text).toContain('scene/GLB: loading…');
    expect(text).toContain('#app rect');
    expect(text).toContain('800.00 × 400.00');
    expect(text).toContain('(pending — scene/GLB loading)');
    expect(text).toContain('C1 buffer/css aspect  (pending canvas)');
    expect(text).toContain('C2 #app.h vs vv.h');
  });
});
