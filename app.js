// app.js — Diary Dump
// All logic extracted from index.html for easier maintenance.

import { firebaseConfig } from './config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const app      = initializeApp(firebaseConfig);
const db       = getFirestore(app);
const notesCol = collection(db, 'notes');

// ─── Constants ───────────────────────────────────────
const WALL_SIZE      = 4000;
const DRAG_THRESHOLD = 4;

// Map colorKey → CSS class. Also used for fallback from old numeric style field.
const COLOR_KEYS   = ['cream', 'rose', 'sage', 'blue', 'lavender', 'gold'];
const NOTE_CLASSES = {
  cream:    'note-cream',
  rose:     'note-rose',
  sage:     'note-sage',
  blue:     'note-blue',
  lavender: 'note-lavender',
  gold:     'note-gold',
};

function colorClass(note) {
  // New notes store colorKey string; old notes stored a numeric style index
  if (note.colorKey && NOTE_CLASSES[note.colorKey]) return NOTE_CLASSES[note.colorKey];
  if (typeof note.style === 'number') return NOTE_CLASSES[COLOR_KEYS[note.style % COLOR_KEYS.length]];
  return 'note-cream';
}

// ─── State ───────────────────────────────────────────
const state = {
  scale: 0.25, tx: 0, ty: 0,
  mode: 'navigate',
  isPanning: false,
  isDraggingNote: false,
  draggedNoteId: null,
  dragStartX: 0, dragStartY: 0,
  panStartX: 0, panStartY: 0,
  noteStartX: 0, noteStartY: 0,
  hasDragged: false,
  pendingX: 0, pendingY: 0,
  notes: new Map(),
  maxZ: 100,
  isOnline: true,
  modalOpen: false,
  detailOpen: false,
  selectedColor: 'cream'   // tracks chosen swatch in modal
};

let pinchState = {};

// ─── DOM ─────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const viewport      = $('viewport');
const wall          = $('wall');
const ghost         = $('ghost');
const placeHint     = $('placeHint');
const btnAdd        = $('btnAdd');
const zoomDisplay   = $('zoomDisplay');
const modalOverlay  = $('modalOverlay');
const detailOverlay = $('detailOverlay');
const detailCard    = $('detailCard');
const emptyState    = $('emptyState');
const loader        = $('loader');
const toastContainer = $('toastContainer');
const inputName     = $('inputName');
const inputFor      = $('inputFor');
const inputMessage  = $('inputMessage');
const charCount     = $('charCount');
const btnSubmit     = $('btnSubmit');
const btnCancel     = $('btnCancel');
const modalCloseBtn = $('modalCloseBtn');
const detailCloseBtn = $('detailCloseBtn');
const nameError     = $('nameError');
const msgError      = $('msgError');
const colorSwatches = $('colorSwatches');

// ─── Helpers ─────────────────────────────────────────
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, 3000);
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ─── Viewport ────────────────────────────────────────
function initView() {
  const vw = window.innerWidth, vh = window.innerHeight;
  state.scale = clamp(Math.min(vw, vh) / WALL_SIZE * 0.9, 0.15, 0.4);
  state.tx = (vw - WALL_SIZE * state.scale) / 2;
  state.ty = (vh - WALL_SIZE * state.scale) / 2;
  updateTransform();
}

function updateTransform() {
  wall.style.transform = `translate3d(${state.tx.toFixed(2)}px, ${state.ty.toFixed(2)}px, 0) scale(${state.scale.toFixed(4)})`;
  zoomDisplay.textContent = Math.round(state.scale * 100) + '%';
}

function zoomTo(newScale, mx, my) {
  const clamped = clamp(newScale, 0.1, 2.5);
  const wx = (mx - state.tx) / state.scale;
  const wy = (my - state.ty) / state.scale;
  state.scale = clamped;
  state.tx = mx - wx * clamped;
  state.ty = my - wy * clamped;
  updateTransform();
}

function setMode(mode) {
  state.mode = mode;
  if (mode === 'place') {
    btnAdd.textContent = '✕ Cancel';
    btnAdd.classList.add('active');
    viewport.classList.add('placing');
    ghost.className = `note ghost note-${state.selectedColor}`;
    ghost.style.setProperty('--r', '0deg');
    ghost.classList.remove('hidden');
    placeHint.classList.remove('hidden');
  } else {
    btnAdd.textContent = '+ Add Note';
    btnAdd.classList.remove('active');
    viewport.classList.remove('placing');
    ghost.classList.add('hidden');
    placeHint.classList.add('hidden');
  }
}

// ─── Note Rendering ───────────────────────────────────
function renderNote(note, animate = false) {
  if (document.getElementById(note.id)) return;

  const el = document.createElement('div');
  el.id = note.id;
  el.className = 'note ' + colorClass(note);
  el.style.left = note.x + 'px';
  el.style.top  = note.y + 'px';
  el.style.setProperty('--r', (note.rotation || 0) + 'deg');
  el.style.zIndex = Math.floor(note.y / 10);

  let html = `<div class="note-name">${escapeHtml(note.name)}</div>`;
  html += `<div class="note-message">${escapeHtml(note.message)}</div>`;
  if (note.for) html += `<div class="note-for">For ${escapeHtml(note.for)}</div>`;
  html += `<div class="note-date">${escapeHtml(note.date)}</div>`;
  el.innerHTML = html;

  el.addEventListener('mousedown', (e) => {
    if (state.mode === 'place' || e.button !== 0 || state.modalOpen || state.detailOpen) return;
    e.stopPropagation();
    state.isDraggingNote = true;
    state.draggedNoteId  = note.id;
    state.hasDragged     = false;
    state.dragStartX     = e.clientX;
    state.dragStartY     = e.clientY;
    state.noteStartX     = note.x;
    state.noteStartY     = note.y;
    el.classList.add('dragging');
    el.style.transition = 'none';
    bringToFront(el);
  });

  wall.appendChild(el);
  if (animate) {
    requestAnimationFrame(() => el.classList.add('animating'));
  }
}

function bringToFront(el) {
  state.maxZ++;
  el.style.zIndex = state.maxZ;
}

function updateEmptyState() {
  emptyState.style.display = state.notes.size > 0 ? 'none' : 'block';
}

// ─── Firestore ────────────────────────────────────────
function initFirestore() {
  loader.classList.remove('hidden');

  onSnapshot(notesCol, (snapshot) => {
    loader.classList.add('hidden');
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        const id   = change.doc.id;
        const note = {
          id, x: data.x, y: data.y,
          name: data.name, message: data.message,
          for: data.for || '',
          colorKey: data.colorKey || null,
          style: data.style ?? 0,          // kept for backward compat
          rotation: data.rotation || 0,
          date: data.createdAt?.toDate?.().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
          }) || 'Just now'
        };
        state.notes.set(id, note);
        renderNote(note, true);
      }
    });
    updateEmptyState();
  }, (err) => {
    loader.classList.add('hidden');
    console.error('Firestore error:', err);
    toast('Unable to connect to the wall. Please check your connection.', 'error');
    state.isOnline = false;
  });
}

// ─── Mouse Events ─────────────────────────────────────
viewport.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || state.modalOpen || state.detailOpen) return;
  if (e.target.closest('.note')) return;
  state.isPanning  = true;
  state.hasDragged = false;
  state.dragStartX = e.clientX;
  state.dragStartY = e.clientY;
  state.panStartX  = state.tx;
  state.panStartY  = state.ty;
  viewport.classList.add('panning');
});

window.addEventListener('mousemove', (e) => {
  if (state.isPanning) {
    const dx = e.clientX - state.dragStartX;
    const dy = e.clientY - state.dragStartY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) state.hasDragged = true;
    state.tx = state.panStartX + dx;
    state.ty = state.panStartY + dy;
    updateTransform();
  }
  if (state.isDraggingNote) {
    const dx = e.clientX - state.dragStartX;
    const dy = e.clientY - state.dragStartY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) state.hasDragged = true;
    const note = state.notes.get(state.draggedNoteId);
    if (note) {
      note.x = state.noteStartX + dx / state.scale;
      note.y = state.noteStartY + dy / state.scale;
      const el = document.getElementById(note.id);
      if (el) { el.style.left = note.x + 'px'; el.style.top = note.y + 'px'; }
    }
  }
  if (state.mode === 'place' && !state.modalOpen && !state.detailOpen) {
    ghost.style.left = e.clientX + 'px';
    ghost.style.top  = e.clientY + 'px';
  }
});

window.addEventListener('mouseup', (e) => {
  if (state.isPanning) {
    state.isPanning = false;
    viewport.classList.remove('panning');
  }
  if (state.isDraggingNote) {
    const el = document.getElementById(state.draggedNoteId);
    if (el) { el.classList.remove('dragging'); el.style.transition = ''; }
    state.isDraggingNote = false;
    state.draggedNoteId  = null;
  }

  if (!state.hasDragged && !state.modalOpen && !state.detailOpen) {
    const noteEl = e.target.closest('.note');
    if (noteEl) {
      const note = state.notes.get(noteEl.id);
      if (note) openDetail(note);
    } else if (state.mode === 'place' && !e.target.closest('.ui')) {
      const wx = (e.clientX - state.tx) / state.scale;
      const wy = (e.clientY - state.ty) / state.scale;
      openModal(wx, wy);
    }
  }
  state.hasDragged = false;
});

viewport.addEventListener('wheel', (e) => {
  if (state.modalOpen || state.detailOpen) return;
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.92 : 1.08;
  zoomTo(state.scale * factor, e.clientX, e.clientY);
}, { passive: false });

// ─── Touch Events ─────────────────────────────────────
viewport.addEventListener('touchstart', (e) => {
  if (state.modalOpen || state.detailOpen) return;
  if (e.touches.length === 2) {
    e.preventDefault();
    const t1 = e.touches[0], t2 = e.touches[1];
    const dist   = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const center = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
    pinchState = {
      startDistance: dist, startScale: state.scale,
      wallAnchorX: (center.x - state.tx) / state.scale,
      wallAnchorY: (center.y - state.ty) / state.scale
    };
  } else if (e.touches.length === 1) {
    const t      = e.touches[0];
    const target = document.elementFromPoint(t.clientX, t.clientY);
    if (!target || !target.closest('.note')) {
      state.isPanning  = true;
      state.hasDragged = false;
      state.dragStartX = t.clientX;
      state.dragStartY = t.clientY;
      state.panStartX  = state.tx;
      state.panStartY  = state.ty;
    }
  }
}, { passive: false });

viewport.addEventListener('touchmove', (e) => {
  if (state.modalOpen || state.detailOpen) return;
  if (e.touches.length === 2 && pinchState.startDistance) {
    e.preventDefault();
    const t1   = e.touches[0], t2 = e.touches[1];
    const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const newScale = clamp(pinchState.startScale * (dist / pinchState.startDistance), 0.1, 2.5);
    const center   = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
    state.scale = newScale;
    state.tx = center.x - pinchState.wallAnchorX * newScale;
    state.ty = center.y - pinchState.wallAnchorY * newScale;
    updateTransform();
  } else if (e.touches.length === 1 && state.isPanning) {
    e.preventDefault();
    const t  = e.touches[0];
    const dx = t.clientX - state.dragStartX;
    const dy = t.clientY - state.dragStartY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) state.hasDragged = true;
    state.tx = state.panStartX + dx;
    state.ty = state.panStartY + dy;
    updateTransform();
  }
}, { passive: false });

viewport.addEventListener('touchend', (e) => {
  if (e.touches.length < 2) pinchState = {};
  if (e.touches.length === 0) {
    state.isPanning = false;
    if (!state.hasDragged && state.mode === 'place' && !state.modalOpen && !state.detailOpen) {
      const t = e.changedTouches[0];
      if (t && !t.target.closest('.ui')) {
        const wx = (t.clientX - state.tx) / state.scale;
        const wy = (t.clientY - state.ty) / state.scale;
        openModal(wx, wy);
      }
    }
    state.hasDragged = false;
  }
});

viewport.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('.note')) e.preventDefault();
});

// ─── Toolbar ─────────────────────────────────────────
btnAdd.addEventListener('click', () => {
  if (state.modalOpen || state.detailOpen) return;
  setMode(state.mode === 'place' ? 'navigate' : 'place');
});

$('btnZoomIn').addEventListener('click', () => {
  if (state.modalOpen || state.detailOpen) return;
  zoomTo(state.scale * 1.3, window.innerWidth / 2, window.innerHeight / 2);
});

$('btnZoomOut').addEventListener('click', () => {
  if (state.modalOpen || state.detailOpen) return;
  zoomTo(state.scale * 0.7, window.innerWidth / 2, window.innerHeight / 2);
});

$('btnReset').addEventListener('click', () => {
  if (state.modalOpen || state.detailOpen) return;
  initView();
});

// ─── Modal ────────────────────────────────────────────
function openModal(x, y) {
  state.pendingX  = x;
  state.pendingY  = y;
  state.modalOpen = true;
  modalOverlay.classList.remove('hidden');
  inputName.value    = '';
  inputFor.value     = '';
  inputMessage.value = '';
  charCount.textContent = '0';
  nameError.classList.remove('visible');
  msgError.classList.remove('visible');
  inputName.classList.remove('input-error');
  inputMessage.classList.remove('input-error');
  ghost.classList.add('hidden');
  placeHint.classList.add('hidden');

  // Reset to default color
  selectColor('cream');

  // Double rAF gives iOS time to settle before focusing
  requestAnimationFrame(() => {
    requestAnimationFrame(() => inputName.focus());
  });
}

function closeModal() {
  state.modalOpen = false;
  modalOverlay.classList.add('hidden');
  setMode('navigate');
}

async function submitNote() {
  const name      = inputName.value.trim();
  const message   = inputMessage.value.trim();
  const forPerson = inputFor.value.trim();
  let hasError    = false;

  if (!name) {
    nameError.classList.add('visible');
    inputName.classList.add('input-error');
    hasError = true;
  }
  if (!message) {
    msgError.classList.add('visible');
    inputMessage.classList.add('input-error');
    hasError = true;
  }
  if (hasError) {
    if (!name) inputName.focus();
    else inputMessage.focus();
    return;
  }

  btnSubmit.disabled    = true;
  btnSubmit.textContent = 'Placing...';

  try {
    await addDoc(notesCol, {
      x: state.pendingX, y: state.pendingY,
      name, message, for: forPerson,
      colorKey: state.selectedColor,
      rotation: (Math.random() - 0.5) * 5,
      createdAt: serverTimestamp()
    });
    toast('Your note has been placed on the wall', 'success');
    closeModal();
  } catch (err) {
    console.error(err);
    toast('Failed to place note. Please try again.', 'error');
    // Keep modal open so user can retry
  } finally {
    btnSubmit.disabled    = false;
    btnSubmit.textContent = 'Place on Wall';
  }
}

modalCloseBtn.addEventListener('click', closeModal);
btnCancel.addEventListener('click', closeModal);
btnSubmit.addEventListener('click', submitNote);

// ─── Color Swatch Selection ───────────────────────────
function selectColor(colorKey) {
  state.selectedColor = colorKey;
  // Update active swatch highlight
  colorSwatches.querySelectorAll('.swatch').forEach((s) => {
    s.classList.toggle('active', s.dataset.color === colorKey);
  });
  // Update ghost color live
  ghost.className = `note ghost note-${colorKey}`;
  ghost.style.setProperty('--r', '0deg');
}

colorSwatches.addEventListener('click', (e) => {
  const swatch = e.target.closest('.swatch');
  if (swatch) selectColor(swatch.dataset.color);
});

// ─── Live Ghost Preview ───────────────────────────────
function updateGhostPreview() {
  const name    = inputName.value.trim() || 'Your Name';
  const message = inputMessage.value.trim() || 'Your message...';
  ghost.querySelector('.note-name').textContent    = name;
  ghost.querySelector('.note-message').textContent = message;
}

inputName.addEventListener('input', () => {
  nameError.classList.remove('visible');
  inputName.classList.remove('input-error');
  updateGhostPreview();
});
inputMessage.addEventListener('input', () => {
  charCount.textContent = inputMessage.value.length;
  msgError.classList.remove('visible');
  inputMessage.classList.remove('input-error');
  updateGhostPreview();
});

// Close on backdrop click
modalOverlay.addEventListener('mousedown', (e) => {
  if (e.target === modalOverlay) closeModal();
});
$('modalBox').addEventListener('mousedown', (e) => e.stopPropagation());
$('modalBox').addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

// Ctrl/Cmd+Enter submits from textarea; plain Enter submits too
inputMessage.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitNote();
  }
});

// ─── Detail View ──────────────────────────────────────
function openDetail(note) {
  state.detailOpen = true;
  $('detailName').textContent    = note.name;
  $('detailMessage').textContent = note.message;
  $('detailFor').textContent     = note.for ? `For ${note.for}` : '';
  $('detailDate').textContent    = note.date;
  detailCard.className = 'detail-card ' + colorClass(note);
  detailCard.style.setProperty('--r', (note.rotation || 0) + 'deg');
  detailOverlay.classList.remove('hidden');
}

function closeDetail() {
  state.detailOpen = false;
  detailOverlay.classList.add('hidden');
}

detailCloseBtn.addEventListener('click', closeDetail);
detailOverlay.addEventListener('mousedown', (e) => {
  if (e.target === detailOverlay) closeDetail();
});
detailCard.addEventListener('mousedown', (e) => e.stopPropagation());
detailCard.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

// ─── Keyboard Shortcuts ───────────────────────────────
document.addEventListener('keydown', (e) => {
  const activeTag = document.activeElement?.tagName;
  const isTyping  = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

  if (e.key === 'Escape') {
    if (state.modalOpen)       closeModal();
    else if (state.detailOpen) closeDetail();
    else if (state.mode === 'place') setMode('navigate');
    return;
  }

  if (isTyping) return;

  if (e.key === '+' || e.key === '=') {
    zoomTo(clamp(state.scale * 1.2, 0.1, 2.5), window.innerWidth / 2, window.innerHeight / 2);
  } else if (e.key === '-') {
    zoomTo(clamp(state.scale * 0.8, 0.1, 2.5), window.innerWidth / 2, window.innerHeight / 2);
  }
});

// ─── Boot ─────────────────────────────────────────────
initView();
initFirestore();

