const STORAGE_KEY = 'kopilka.v1';
const COIN_VALUE = 100_000; // Все суммы хранятся в копейках, без ошибок округления.
const MAX_AMOUNT = 9_999_999_999_999;
const MAX_JARS = 100;
const MAX_VISIBLE_COINS = 30;
const COLORS = [
  { value: '#cbb0ef', name: 'Лавандовый' },
  { value: '#b7dcb0', name: 'Зелёный' },
  { value: '#edafc3', name: 'Розовый' },
  { value: '#afcfe5', name: 'Голубой' },
  { value: '#f1cf95', name: 'Золотой' },
  { value: '#e8aa93', name: 'Персиковый' },
  { value: '#a9d9ce', name: 'Мятный' },
];
const $ = (selector) => document.querySelector(selector);
const jarsElement = $('#jars');
const editor = $('#editor');
const nameInput = $('#jar-name');
const amountInput = $('#jar-amount');
const editorError = $('#editor-error');
let editingId = null;
let toastTimer;
let confirmationAction = null;
let startupMessage = '';

function validateData(data) {
  if (data?.version !== 1 || !Array.isArray(data.jars) || data.jars.length > MAX_JARS) {
    throw new Error('Неверный формат резервной копии. Выбери JSON-файл, скачанный из копилки.');
  }
  const ids = new Set();
  return data.jars.map((jar) => {
    if (!jar || typeof jar.id !== 'string' || !jar.id || jar.id.length > 100 || ids.has(jar.id)
      || typeof jar.name !== 'string' || !jar.name.trim() || jar.name.trim().length > 32
      || !Number.isSafeInteger(jar.amount) || jar.amount < 0 || jar.amount > MAX_AMOUNT
      || !COLORS.some((color) => color.value === jar.color)) {
      throw new Error('В файле есть некорректная копилка. Данные не изменены.');
    }
    ids.add(jar.id);
    return { id: jar.id, name: jar.name.trim(), amount: jar.amount, color: jar.color };
  });
}

function loadJars() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return validateData(JSON.parse(saved));
  } catch {
    startupMessage = 'Не удалось прочитать данные. Можно загрузить резервную копию в настройках.';
  }
  return [];
}

let jars = loadJars();

function makeBackup(nextJars = jars) {
  return { version: 1, updatedAt: new Date().toISOString(), jars: nextJars };
}

function commit(nextJars) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeBackup(nextJars)));
  } catch {
    toast('Не удалось сохранить. Проверь, разрешено ли браузеру хранить данные.');
    return false;
  }
  jars = nextJars;
  render();
  return true;
}

function groupDigits(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatAmount(amount) {
  const rubles = Math.floor(amount / 100);
  const kopecks = amount % 100;
  return groupDigits(rubles) + (kopecks ? `,${String(kopecks).padStart(2, '0')}` : '');
}

function money(amount) {
  return `${formatAmount(amount)} ₽`;
}

function parseAmount(value) {
  const normalized = value.replace(/\s/g, '').replace(/\./g, ',');
  if (!/^\d+(?:,\d{0,2})?$/.test(normalized)) return null;
  const [rubles, kopecks = ''] = normalized.split(',');
  const amount = Number(rubles) * 100 + Number(kopecks.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_AMOUNT ? amount : null;
}

function coin() {
  const element = document.createElement('span');
  element.className = 'coin';
  element.setAttribute('aria-hidden', 'true');
  const img = document.createElement('img');
  img.src = 'assets/coin.png';
  img.alt = '';
  img.draggable = false;
  element.append(img);
  return element;
}

function render() {
  jarsElement.replaceChildren();
  for (const jar of jars) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'jar-card';
    card.dataset.id = jar.id;
    card.style.setProperty('--jar-color', jar.color);
    card.setAttribute('aria-label', `${jar.name}, ${money(jar.amount)}. Изменить копилку`);
    const box = document.createElement('span');
    box.className = 'jar';
    box.setAttribute('aria-hidden', 'true');
    const coins = document.createElement('span');
    coins.className = 'jar-coins';
    const fullCoins = Math.floor(jar.amount / COIN_VALUE);
    const remainder = jar.amount % COIN_VALUE;
    const totalCoins = fullCoins + (remainder > 0 ? 1 : 0);
    const visibleCoins = Math.min(totalCoins, MAX_VISIBLE_COINS);
    coins.dataset.size = visibleCoins <= 5 ? 'few' : 'many';
    for (let i = 0; i < visibleCoins; i++) {
      const item = coin();
      if (remainder && i === fullCoins) {
        item.style.clipPath = `inset(0 ${100 - remainder / COIN_VALUE * 100}% 0 0)`;
        item.style.opacity = '.75';
      }
      coins.append(item);
    }
    box.append(coins);
    if (totalCoins > MAX_VISIBLE_COINS) {
      const overflow = document.createElement('span');
      overflow.className = 'overflow-count';
      overflow.textContent = `+${groupDigits(totalCoins - MAX_VISIBLE_COINS)}`;
      box.append(overflow);
    }
    if (jar.amount === 0) {
      const empty = document.createElement('span');
      empty.className = 'jar-empty';
      empty.textContent = 'Начнём?';
      box.append(empty);
    }
    const name = document.createElement('span');
    name.className = 'jar-name';
    name.textContent = jar.name;
    const amount = document.createElement('span');
    amount.className = 'jar-amount';
    amount.textContent = money(jar.amount);
    amount.dataset.long = String(jar.amount).length > 9 ? 'true' : 'false';
    card.append(box, name, amount);
    card.addEventListener('click', () => openEditor(jar.id));
    jarsElement.append(card);
  }
  if (jars.length < MAX_JARS) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'jar-card add-card';
    add.setAttribute('aria-label', 'Добавить копилку');
    add.innerHTML = '<span class="jar"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 4v24M4 16h24"/></svg></span><span class="add-label">Новая копилка</span>';
    add.addEventListener('click', () => openEditor());
    jarsElement.append(add);
  }
  $('#total').textContent = money(jars.reduce((total, jar) => total + jar.amount, 0));
  $('#add-button').disabled = jars.length >= MAX_JARS;
}

function toast(message) {
  clearTimeout(toastTimer);
  const element = $('#toast');
  element.textContent = message;
  if (typeof element.showPopover === 'function') {
    if (element.matches(':popover-open')) element.hidePopover();
    element.showPopover();
  } else {
    // В старых браузерах сообщение помещаем в активное окно.
    (document.querySelector('dialog[open]') ?? document.body).append(element);
  }
  element.classList.add('visible');
  toastTimer = setTimeout(() => {
    element.classList.remove('visible');
    if (typeof element.hidePopover === 'function' && element.matches(':popover-open')) element.hidePopover();
  }, 4500);
}

function showDialog(dialog) {
  dialog.showModal();
  document.body.style.overflow = 'hidden';
}

function openEditor(id = null) {
  if (!id && jars.length >= MAX_JARS) return;
  const jar = jars.find((item) => item.id === id);
  editingId = jar?.id ?? null;
  $('#jar-form').reset();
  editorError.textContent = '';
  $('#editor-title').textContent = jar ? 'Изменить копилку' : 'Новая копилка';
  $('#save-button').textContent = jar ? 'Сохранить' : 'Создать копилку';
  $('#delete-button').hidden = !jar;
  nameInput.value = jar?.name ?? '';
  amountInput.value = formatAmount(jar?.amount ?? 0);
  const color = jar?.color ?? COLORS[jars.length % COLORS.length].value;
  document.querySelectorAll('input[name="color"]').forEach((input) => { input.checked = input.value === color; });
  showDialog(editor);
  // Существующую копилку открываем без клавиатуры, чтобы сразу видеть все поля.
  if (jar) $('#editor [data-close]').focus({ preventScroll: true });
  else nameInput.focus({ preventScroll: true });
}

function highlightJar(id) {
  const card = [...jarsElement.querySelectorAll('.jar-card')].find((item) => item.dataset.id === id);
  if (!card) return;
  card.classList.add('just-saved');
  setTimeout(() => card.classList.remove('just-saved'), 600);
}

for (const color of COLORS) {
  const label = document.createElement('label');
  label.className = 'color-option';
  label.style.setProperty('--swatch', color.value);
  label.title = color.name;
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'color';
  input.value = color.value;
  input.className = 'sr-only';
  input.setAttribute('aria-label', color.name);
  input.required = true;
  label.append(input);
  $('#color-options').append(label);
}

amountInput.addEventListener('input', () => {
  editorError.textContent = '';
  const old = amountInput.value;
  const position = amountInput.selectionStart ?? old.length;
  const normalized = old.replace(/\s/g, '').replace(/\./g, ',');
  if (!/^\d*(?:,\d*)?$/.test(normalized)) return;
  const [rubles, kopecks] = normalized.split(',');
  const formatted = groupDigits(rubles) + (kopecks !== undefined ? `,${kopecks}` : '');
  let meaningful = old.slice(0, position).replace(/\s/g, '').length;
  let nextPosition = 0;
  while (nextPosition < formatted.length && meaningful > 0) {
    if (formatted[nextPosition] !== ' ') meaningful--;
    nextPosition++;
  }
  amountInput.value = formatted;
  amountInput.setSelectionRange(nextPosition, nextPosition);
});

document.querySelectorAll('[data-adjust]').forEach((button) => {
  button.addEventListener('click', () => {
    const current = parseAmount(amountInput.value);
    if (current === null) {
      editorError.textContent = 'Введи сумму от 0 до 99 999 999 999,99 ₽, не больше двух знаков после запятой.';
      return;
    }
    const next = Math.max(0, current + Number(button.dataset.adjust));
    if (next > MAX_AMOUNT) { editorError.textContent = 'Максимальная сумма — 99 999 999 999,99 ₽.'; return; }
    amountInput.value = formatAmount(next);
    editorError.textContent = '';
  });
});

$('#jar-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name || name.length > 32) {
    editorError.textContent = 'Дай копилке название: от 1 до 32 символов.';
    nameInput.focus();
    return;
  }
  const amount = parseAmount(amountInput.value);
  if (amount === null) {
    editorError.textContent = 'Введи сумму от 0 до 99 999 999 999,99 ₽, не больше двух знаков после запятой.';
    amountInput.focus();
    return;
  }
  const color = document.querySelector('input[name="color"]:checked')?.value;
  if (!color) { editorError.textContent = 'Выбери цвет копилки.'; return; }
  const id = editingId ?? (globalThis.crypto?.randomUUID?.() ?? `jar-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const jar = { id, name, amount, color };
  const next = editingId ? jars.map((item) => item.id === editingId ? jar : item) : [...jars, jar];
  if (!commit(next)) {
    editorError.textContent = 'Сохранение недоступно. Разреши хранение данных в настройках браузера и попробуй ещё раз.';
    return;
  }
  editor.close();
  highlightJar(id);
  toast(editingId ? 'Изменения сохранены' : 'Копилка создана');
});

function confirmAction(title, description, acceptLabel, action) {
  $('#confirmation-title').textContent = title;
  $('#confirmation-description').textContent = description;
  $('#confirm-accept').textContent = acceptLabel;
  confirmationAction = action;
  showDialog($('#confirmation'));
  $('#confirm-cancel').focus();
}

$('#confirm-cancel').addEventListener('click', () => $('#confirmation').close());
$('#confirm-accept').addEventListener('click', () => {
  const action = confirmationAction;
  $('#confirmation').close();
  action?.();
});
$('#confirmation').addEventListener('close', () => { confirmationAction = null; });

$('#delete-button').addEventListener('click', () => {
  const jar = jars.find((item) => item.id === editingId);
  if (!jar) return;
  confirmAction('Удалить копилку?', `«${jar.name}» и её сумма ${money(jar.amount)} будут удалены из учёта.`, 'Удалить', () => {
    if (commit(jars.filter((item) => item.id !== jar.id))) {
      editor.close();
      toast('Копилка удалена');
    }
  });
});

$('#add-button').addEventListener('click', () => openEditor());
$('#settings-button').addEventListener('click', () => showDialog($('#settings')));
$('#deposit-button').addEventListener('click', () => {
  if (!jars.length) { openEditor(); return; }
  const list = $('#deposit-list');
  list.replaceChildren();
  for (const jar of jars) {
    const button = document.createElement('button');
    button.className = 'deposit-option';
    button.style.setProperty('--jar-color', jar.color);
    button.setAttribute('aria-label', `Добавить 1 000 рублей: ${jar.name}`);
    const dot = document.createElement('span');
    dot.className = 'color-dot';
    dot.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'deposit-option-name';
    name.textContent = jar.name;
    const amount = document.createElement('span');
    amount.className = 'deposit-option-amount';
    amount.textContent = money(jar.amount);
    button.append(dot, name, amount);
    button.addEventListener('click', () => {
      // Читаем актуальную сумму: вкладка могла обновиться через storage event.
      const current = jars.find((item) => item.id === jar.id);
      if (!current) { $('#deposit').close(); toast('Эта копилка уже удалена'); return; }
      if (current.amount + COIN_VALUE > MAX_AMOUNT) { toast('Достигнута максимальная сумма копилки'); return; }
      if (commit(jars.map((item) => item.id === jar.id ? { ...item, amount: item.amount + COIN_VALUE } : item))) {
        $('#deposit').close();
        highlightJar(jar.id);
        toast(`+1 000 ₽ в копилку «${current.name}»`);
      }
    });
    list.append(button);
  }
  showDialog($('#deposit'));
});

document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (!document.querySelector('dialog[open]')) document.body.style.overflow = '';
  });
});

$('#export-button').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(makeBackup(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const date = new Date();
  const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  link.download = `kopilka-${dateString}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Резервная копия подготовлена');
});

$('#import-button').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 1_000_000) { toast('Файл слишком большой. Выбери резервную копию копилки.'); return; }
  let imported;
  try {
    imported = validateData(JSON.parse(await file.text()));
  } catch (error) {
    toast(error instanceof SyntaxError ? 'Не удалось прочитать JSON-файл. Данные не изменены.' : error.message);
    return;
  }
  confirmAction('Загрузить резервную копию?', `Текущие копилки заменятся данными из файла. В копии: ${imported.length} шт., всего ${money(imported.reduce((sum, jar) => sum + jar.amount, 0))}.`, 'Загрузить', () => {
    if (commit(imported)) { $('#settings').close(); toast('Резервная копия загружена'); }
  });
});

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  try {
    const next = event.newValue ? validateData(JSON.parse(event.newValue)) : [];
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
    jars = next;
    render();
    toast('Копилки обновлены в другой вкладке');
  } catch { toast('Не удалось прочитать изменения из другой вкладки'); }
});

render();
if (startupMessage) toast(startupMessage);
