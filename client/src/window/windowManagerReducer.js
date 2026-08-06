// @ts-check
/**
 * windowManagerReducer — pure store + reducer for the in-app window
 * manager (Phase 1). No React, no DOM (node:test imports it directly).
 *
 * Store: { windows: Window[], zTop: number, counter: number }
 * Window: { id, tabId, title, x, y, w, h, z, state, singleton, prevRect }
 *
 * The reducer is deliberately title/registry-agnostic — the OPEN payload
 * already carries `title` + `singleton` (computed by the context, which
 * is allowed to import React + the tab registry). That keeps this module
 * pure and free of Date.now/Math.random (ids come from `counter`).
 */
import {
  WINDOW_Z_BASE,
  DEFAULT_WINDOW_W,
  DEFAULT_WINDOW_H,
  MIN_WINDOW_W,
  MIN_WINDOW_H,
} from './windowLogic.js';

export const WM_ACTIONS = {
  OPEN: 'OPEN',
  FOCUS: 'FOCUS',
  MINIMIZE: 'MINIMIZE',
  MAXIMIZE: 'MAXIMIZE',
  RESTORE: 'RESTORE',
  CLOSE: 'CLOSE',
  MOVE: 'MOVE',
  RESIZE: 'RESIZE',
  HYDRATE: 'HYDRATE',
};

const A = WM_ACTIONS;

export function initialWindowState() {
  return { windows: [], zTop: WINDOW_Z_BASE, counter: 0 };
}

// Cascade offset so successive windows don't stack exactly on top.
function cascadeRect(counter, rect) {
  const step = (counter % 8) * 28;
  return {
    x: rect?.x != null ? rect.x : 64 + step,
    y: rect?.y != null ? rect.y : 56 + step,
    w: Math.max(MIN_WINDOW_W, rect?.w != null ? rect.w : DEFAULT_WINDOW_W),
    h: Math.max(MIN_WINDOW_H, rect?.h != null ? rect.h : DEFAULT_WINDOW_H),
  };
}

function raise(store) {
  return store.zTop + 1;
}

export function windowManagerReducer(state, action) {
  const { type, payload } = action || {};
  switch (type) {
    case A.OPEN: {
      const { tabId, title = '', singleton = true, rect, fixed = false } = payload || {};
      if (!tabId) return state;
      // Singleton: focus the existing window (raise + un-minimize) instead
      // of opening a duplicate. A fixed window (Home base layer) is never
      // raised — it stays behind the floating windows.
      if (singleton) {
        const existing = state.windows.find((w) => w.tabId === tabId);
        if (existing) {
          if (existing.fixed) return state; // Home base — already at the back.
          const z = raise(state);
          return {
            ...state,
            zTop: z,
            windows: state.windows.map((w) =>
              w.id === existing.id ? { ...w, z, state: 'normal' } : w
            ),
          };
        }
      }
      const counter = state.counter + 1;
      // Fixed windows pin to the base z (below every floating window) and
      // do NOT bump zTop, so later windows always open on top of Home.
      const z = fixed ? WINDOW_Z_BASE : raise(state);
      const geo = cascadeRect(state.counter, rect);
      const win = {
        id: `win-${counter}`,
        tabId,
        title,
        x: geo.x,
        y: geo.y,
        w: geo.w,
        h: geo.h,
        z,
        state: 'normal',
        singleton: !!singleton,
        fixed: !!fixed,
        prevRect: null,
      };
      return { ...state, counter, zTop: fixed ? state.zTop : z, windows: [...state.windows, win] };
    }

    case A.FOCUS: {
      const { id } = payload || {};
      const target = state.windows.find((w) => w.id === id);
      if (!target) return state;
      // Fixed (Home) never raises — it's the base layer behind floats.
      if (target.fixed) return state;
      const z = raise(state);
      return {
        ...state,
        zTop: z,
        windows: state.windows.map((w) =>
          w.id === id ? { ...w, z, state: w.state === 'min' ? 'normal' : w.state } : w
        ),
      };
    }

    case A.MINIMIZE: {
      const { id } = payload || {};
      const target = state.windows.find((w) => w.id === id);
      if (!target || target.fixed) return state; // Home can't be minimized.
      return {
        ...state,
        windows: state.windows.map((w) => (w.id === id ? { ...w, state: 'min' } : w)),
      };
    }

    case A.MAXIMIZE: {
      const { id } = payload || {};
      const target = state.windows.find((w) => w.id === id);
      if (!target || target.fixed || target.state === 'max') return state;
      const z = raise(state);
      return {
        ...state,
        zTop: z,
        windows: state.windows.map((w) =>
          w.id === id
            ? {
                ...w,
                z,
                state: 'max',
                prevRect: { x: w.x, y: w.y, w: w.w, h: w.h },
              }
            : w
        ),
      };
    }

    case A.RESTORE: {
      const { id } = payload || {};
      const target = state.windows.find((w) => w.id === id);
      if (!target) return state;
      const z = raise(state);
      return {
        ...state,
        zTop: z,
        windows: state.windows.map((w) => {
          if (w.id !== id) return w;
          const r = w.prevRect;
          return {
            ...w,
            z,
            state: 'normal',
            ...(r ? { x: r.x, y: r.y, w: r.w, h: r.h } : {}),
            prevRect: null,
          };
        }),
      };
    }

    case A.CLOSE: {
      const { id } = payload || {};
      const target = state.windows.find((w) => w.id === id);
      if (target?.fixed) return state; // Home can never be closed.
      return { ...state, windows: state.windows.filter((w) => w.id !== id) };
    }

    case A.MOVE: {
      const { id, x, y } = payload || {};
      return {
        ...state,
        windows: state.windows.map((w) =>
          w.id === id ? { ...w, x: Number(x) || 0, y: Number(y) || 0 } : w
        ),
      };
    }

    case A.RESIZE: {
      const { id, w: nw, h: nh, x, y } = payload || {};
      return {
        ...state,
        windows: state.windows.map((win) =>
          win.id === id
            ? {
                ...win,
                w: Math.max(MIN_WINDOW_W, Number(nw) || win.w),
                h: Math.max(MIN_WINDOW_H, Number(nh) || win.h),
                ...(x != null ? { x: Number(x) || 0 } : {}),
                ...(y != null ? { y: Number(y) || 0 } : {}),
              }
            : win
        ),
      };
    }

    case A.HYDRATE: {
      const { windows, zTop, counter } = payload || {};
      if (!Array.isArray(windows)) return state;
      return {
        windows,
        zTop: Number(zTop) || WINDOW_Z_BASE,
        counter: Number(counter) || windows.length,
      };
    }

    default:
      return state;
  }
}
