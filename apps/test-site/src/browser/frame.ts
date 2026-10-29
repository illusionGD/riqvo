const form = document.getElementById('note-form');
const note = document.getElementById('note');
const status = document.getElementById('note-status');
if (!(form instanceof HTMLFormElement) || !(note instanceof HTMLInputElement) || !status)
  throw new Error('备注样例结构不完整');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  status.textContent = `已确认：${note.value}`;
});

export {};
