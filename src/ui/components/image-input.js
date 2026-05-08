/*
 * Vectura Studio — ImageInput component (Phase 1).
 *
 * Image-file input slot with preview thumbnail. Handles CONTROL_DEFS' `image`
 * type (wavetable noise image source, pattern designer image import).
 *
 * Props:
 *   value         — { name, dataUrl } | null. Default null.
 *   accept        — file accept string. Default 'image/*'.
 *   ariaLabel     — string. Default 'Image'.
 *   placeholder   — text shown when no image is loaded. Default 'Choose image…'.
 *   onChange(value, file) — fires when a file is loaded; `value` shape matches
 *                  the `value` prop. Pass null to clear.
 *
 * Returns: { el, update, destroy, getValue, setValue, clear }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const create = (host, initialProps = {}) => {
    let props = Object.assign({ accept: 'image/*', ariaLabel: 'Image', placeholder: 'Choose image…' }, initialProps);
    const utils = UI.utils || {};
    let value = props.value || null;

    const el = document.createElement('div');
    el.className = 'image-input';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'hdr-btn image-input-trigger';
    el.appendChild(trigger);

    const thumb = document.createElement('span');
    thumb.className = 'image-input-thumb';
    thumb.style.cssText = 'width: 18px; height: 18px; border-radius: 2px; background: var(--ui-border, #444); display: inline-block; margin-right: 6px; vertical-align: middle; background-size: cover; background-position: center;';
    trigger.appendChild(thumb);

    const labelSpan = document.createElement('span');
    labelSpan.className = 'image-input-label';
    trigger.appendChild(labelSpan);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'layer-act image-input-clear';
    clearBtn.setAttribute('aria-label', 'Clear image');
    clearBtn.textContent = '×';
    el.appendChild(clearBtn);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = props.accept;
    fileInput.style.display = 'none';
    el.appendChild(fileInput);

    const render = () => {
      if (value && value.name) {
        labelSpan.textContent = value.name;
        thumb.style.backgroundImage = value.dataUrl ? `url(${value.dataUrl})` : '';
        clearBtn.style.display = '';
      } else {
        labelSpan.textContent = props.placeholder;
        thumb.style.backgroundImage = '';
        clearBtn.style.display = 'none';
      }
      trigger.setAttribute('aria-label', value && value.name ? `${props.ariaLabel}: ${value.name}` : props.ariaLabel);
    };

    const onTriggerClick = () => fileInput.click();
    const onClear = (event) => {
      event.stopPropagation();
      value = null;
      fileInput.value = '';
      render();
      if (typeof props.onChange === 'function') props.onChange(null, null);
    };
    const onFile = () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const FR = (typeof FileReader !== 'undefined') ? FileReader : (window.FileReader || null);
      if (!FR) {
        // No FileReader — surface the filename only.
        value = { name: file.name, dataUrl: '' };
        render();
        if (typeof props.onChange === 'function') props.onChange(value, file);
        return;
      }
      const reader = new FR();
      reader.onload = () => {
        value = { name: file.name, dataUrl: String(reader.result || '') };
        render();
        if (typeof props.onChange === 'function') props.onChange(value, file);
      };
      reader.readAsDataURL(file);
    };

    const offs = [];
    const bind = (target, evt, fn) => {
      target.addEventListener(evt, fn);
      offs.push(() => target.removeEventListener(evt, fn));
    };
    bind(trigger, 'click', onTriggerClick);
    bind(clearBtn, 'click', onClear);
    bind(fileInput, 'change', onFile);

    render();
    if (host) host.appendChild(el);

    return {
      el,
      getValue: () => (value ? Object.assign({}, value) : null),
      setValue(next) {
        value = next ? Object.assign({}, next) : null;
        render();
      },
      clear() {
        value = null;
        render();
      },
      update(newProps) {
        const merged = Object.assign({}, props, newProps || {});
        if (newProps && newProps.accept) fileInput.accept = newProps.accept;
        if (newProps && 'value' in newProps) value = newProps.value || null;
        props = merged;
        render();
      },
      destroy() {
        offs.forEach((fn) => fn());
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.ImageInput = create;
})();
