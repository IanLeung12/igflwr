import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import React from 'react';
import ReactDOM from 'react-dom/client';

export default defineContentScript({
  matches: ['*://www.instagram.com/*'],
  runAt: 'document_end',
  main(ctx: ContentScriptContext) {
    let ui: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;

    function toggleSidebar() {
      if (ui) {
        ui.remove();
        ui = null;
        return;
      }

      createShadowRootUi(ctx, {
        position: 'inline',
        anchor: document.body,
        name: 'igflwr-sidebar',
        onMount: (container: HTMLElement) => {
          const root = ReactDOM.createRoot(container);
          import('../components/Sidebar').then((mod) => {
            root.render(
              React.createElement(
                React.Suspense,
                { fallback: null },
                React.createElement(mod.Sidebar, {
                  onClose: () => {
                    root.unmount();
                    ui?.remove();
                    ui = null;
                  },
                }),
              ),
            );
          });
          return root;
        },
        onRemove: (root: ReactDOM.Root | undefined) => {
          root?.unmount();
        },
      }).then((u) => {
        ui = u;
        ui.mount();
      });
    }

    function addToggleButton() {
      if (document.getElementById('igflwr-toggle-btn')) return;

      const btn = document.createElement('div');
      btn.id = 'igflwr-toggle-btn';
      btn.textContent = 'IG';
      Object.assign(btn.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '44px',
        height: '44px',
        background: '#0095f6',
        color: '#fff',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: '700',
        fontSize: '14px',
        cursor: 'pointer',
        zIndex: '999998',
        boxShadow: '0 2px 10px rgba(0,149,246,0.4)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        userSelect: 'none',
        transition: 'transform 0.15s',
      });
      btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.1)'; });
      btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
      btn.addEventListener('click', toggleSidebar);
      document.body.appendChild(btn);
    }

    addToggleButton();
  },
});
