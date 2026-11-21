// gestos.js — toque, arrastar e pressionar com Pointer Events (PLANO.md 10.2).
// Funciona com dedo, mouse e caneta.

const TEMPO_SEGURAR = 500;
const TOLERANCIA_PX = 10;
const TOQUE_MAX_MS = 350;
const ARRASTE_MAX_MS = 800;

/**
 * Liga os gestos num elemento.
 * acoes: { arrastar(dir: 'esquerda'|'direita'), toque(alvo, evento), segurar(alvo) }
 * Devolve uma função que desliga tudo.
 */
export function ligarGestos(elemento, acoes) {
  let ativo = null; // { id, x, y, t, alvo, timer, segurou, cancelado }

  const limpar = () => {
    if (ativo?.timer) clearTimeout(ativo.timer);
    ativo = null;
  };

  const aoDescer = (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (ativo) return; // só um dedo por vez
    ativo = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: performance.now(), alvo: ev.target, segurou: false, timer: null };
    try { elemento.setPointerCapture(ev.pointerId); } catch { /* nada */ }
    if (acoes.segurar) {
      ativo.timer = setTimeout(() => {
        if (!ativo) return;
        ativo.segurou = true;
        ativo.timer = null;
        acoes.segurar(ativo.alvo);
      }, TEMPO_SEGURAR);
    }
  };

  const aoMover = (ev) => {
    if (!ativo || ev.pointerId !== ativo.id) return;
    const dx = ev.clientX - ativo.x;
    const dy = ev.clientY - ativo.y;
    if (ativo.timer && Math.hypot(dx, dy) > TOLERANCIA_PX) {
      clearTimeout(ativo.timer);
      ativo.timer = null;
    }
  };

  const aoSubir = (ev) => {
    if (!ativo || ev.pointerId !== ativo.id) return;
    const g = ativo;
    limpar();
    try { elemento.releasePointerCapture(ev.pointerId); } catch { /* nada */ }
    const dx = ev.clientX - g.x;
    const dy = ev.clientY - g.y;
    const dur = performance.now() - g.t;
    const largura = elemento.getBoundingClientRect().width || 0;
    const minimo = Math.max(40, 0.08 * largura);
    // a) arraste
    if (Math.abs(dx) >= minimo && Math.abs(dx) >= 1.5 * Math.abs(dy) && dur <= ARRASTE_MAX_MS) {
      acoes.arrastar?.(dx < 0 ? 'esquerda' : 'direita');
      return;
    }
    // b) segurar: a ação já aconteceu no disparo do temporizador
    if (g.segurou) return;
    // c) toque
    if (Math.hypot(dx, dy) < TOLERANCIA_PX && dur < TOQUE_MAX_MS) {
      acoes.toque?.(g.alvo, ev);
    }
    // d) qualquer outra coisa: ignorar
  };

  const aoCancelar = (ev) => {
    if (ativo && ev.pointerId === ativo.id) limpar();
  };

  elemento.addEventListener('pointerdown', aoDescer);
  elemento.addEventListener('pointermove', aoMover);
  elemento.addEventListener('pointerup', aoSubir);
  elemento.addEventListener('pointercancel', aoCancelar);
  const semMenu = (ev) => ev.preventDefault();
  elemento.addEventListener('contextmenu', semMenu);

  return () => {
    limpar();
    elemento.removeEventListener('pointerdown', aoDescer);
    elemento.removeEventListener('pointermove', aoMover);
    elemento.removeEventListener('pointerup', aoSubir);
    elemento.removeEventListener('pointercancel', aoCancelar);
    elemento.removeEventListener('contextmenu', semMenu);
  };
}
