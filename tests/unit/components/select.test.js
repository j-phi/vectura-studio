const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.Select', () => {
  let runtime;
  let Select;

  const opts = [
    { value: 'a', label: 'Apple' },
    { value: 'b', label: 'Banana' },
    { value: 'c', label: 'Cherry' },
  ];

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'select']);
    Select = runtime.window.Vectura.UI.Select;
  });
  afterEach(() => runtime.cleanup());

  test('renders a wrapped <select> with one <option> per entry', () => {
    const inst = Select(runtime.document.body, { ariaLabel: 'X', options: opts, value: 'b' });
    expect(inst.el.classList.contains('ctrl-sel-wrap')).toBe(true);
    const select = inst.el.querySelector('select.ctrl-sel');
    expect(select).toBeTruthy();
    expect(select.options.length).toBe(3);
    expect(select.value).toBe('b');
    expect(inst.getValue()).toBe('b');
    inst.destroy();
  });

  test('change event fires onChange with the new value', () => {
    let captured = null;
    const inst = Select(runtime.document.body, { ariaLabel: 'X', options: opts, onChange: (v) => { captured = v; } });
    const select = inst.el.querySelector('select');
    select.value = 'c';
    select.dispatchEvent(new runtime.window.Event('change', { bubbles: true }));
    expect(captured).toBe('c');
    inst.destroy();
  });

  test('renders optgroup when options nest under { group, options }', () => {
    const grouped = [
      { group: 'Fruit', options: [{ value: 'a', label: 'Apple' }] },
      { group: 'Veg', options: [{ value: 'k', label: 'Kale' }] },
    ];
    const inst = Select(runtime.document.body, { ariaLabel: 'X', options: grouped });
    const groups = inst.el.querySelectorAll('optgroup');
    expect(groups.length).toBe(2);
    expect(groups[0].label).toBe('Fruit');
    inst.destroy();
  });

  test('setValue silently does not fire onChange', () => {
    let count = 0;
    const inst = Select(runtime.document.body, { ariaLabel: 'X', options: opts, onChange: () => { count += 1; } });
    inst.setValue('c', { silent: true });
    expect(inst.getValue()).toBe('c');
    expect(count).toBe(0);
    inst.destroy();
  });

  test('update() with new options rebuilds the dropdown', () => {
    const inst = Select(runtime.document.body, { ariaLabel: 'X', options: opts, value: 'a' });
    inst.update({ options: [{ value: 'z', label: 'Zucchini' }], value: 'z' });
    expect(inst.el.querySelector('select').options.length).toBe(1);
    expect(inst.getValue()).toBe('z');
    inst.destroy();
  });

  test('destroy() detaches and removes', () => {
    const inst = Select(runtime.document.body, { ariaLabel: 'X', options: opts });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
