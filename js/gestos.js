// gestos.js — toque, arrastar e pressionar com Pointer Events (PLANO.md 10.2).
// Funciona com dedo, mouse e caneta.

const TEMPO_SEGURAR = 500;
const TOLERANCIA_PX = 10;
const TOQUE_MAX_MS = 350;
const ARRASTE_MAX_MS = 800;

/**
 * Liga os gestos num elemento.
 * acoes: { arrastar(dir: 'esquerda'|'direita'), toque(alvo, evento), segurar(alvo), soltar() }
 * soltar(): o dedo que estava segurando saiu da tela (ou o toque foi cancelado pelo sistema).
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
    // a) segurar: a ação já aconteceu no disparo do temporizador; agora avisa que soltou (antes do arraste:
    //    segurar e depois mexer o dedo não pode virar arraste e deixar o "segurando" sem fim)
    if (g.segurou) { acoes.soltar?.(); return; }
    const dx = ev.clientX - g.x;
    const dy = ev.clientY - g.y;
    const dur = performance.now() - g.t;
    const largura = elemento.getBoundingClientRect().width || 0;
    const minimo = Math.max(40, 0.08 * largura);
    // b) arraste
    if (Math.abs(dx) >= minimo && Math.abs(dx) >= 1.5 * Math.abs(dy) && dur <= ARRASTE_MAX_MS) {
      acoes.arrastar?.(dx < 0 ? 'esquerda' : 'direita');
      return;
    }
    // c) toque
    if (Math.hypot(dx, dy) < TOLERANCIA_PX && dur < TOQUE_MAX_MS) {
      acoes.toque?.(g.alvo, ev);
    }
    // d) qualquer outra coisa: ignorar
  };

  const aoCancelar = (ev) => {
    if (!ativo || ev.pointerId !== ativo.id) return;
    const segurou = ativo.segurou;
    limpar();
    if (segurou) acoes.soltar?.();
  };

  elemento.addEventListener('pointerdown', aoDescer);
  elemento.addEventListener('pointermove', aoMover);
  elemento.addEventListener('pointerup', aoSubir);
  elemento.addEventListener('pointercancel', aoCancelar);
  const semMenu = (ev) => ev.preventDefault();
  elemento.addEventListener('contextmenu', semMenu);

  return () => {
    if (ativo?.segurou) acoes.soltar?.();
    limpar();
    elemento.removeEventListener('pointerdown', aoDescer);
    elemento.removeEventListener('pointermove', aoMover);
    elemento.removeEventListener('pointerup', aoSubir);
    elemento.removeEventListener('pointercancel', aoCancelar);
    elemento.removeEventListener('contextmenu', semMenu);
  };
}
