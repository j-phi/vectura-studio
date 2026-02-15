/**
 * Binds pointer and wheel input for the renderer canvas.
 */
export const bindRendererInput = (renderer) => {
  if (!renderer?.canvas) return () => {};

  const onWheel = (e) => renderer.wheel(e);
  const onPointerDown = (e) => renderer.down(e);
  const onPointerMove = (e) => renderer.move(e);
  const onPointerUp = (e) => renderer.up(e);

  renderer.canvas.addEventListener('wheel', onWheel, { passive: false });
  renderer.canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  return () => {
    renderer.canvas.removeEventListener('wheel', onWheel);
    renderer.canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  };
};
