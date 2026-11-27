export const controlPage = `<!doctype html>
<html lang="vi">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Thử hàng đợi DYM</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef2f7; color: #162336; font: 16px/1.5 system-ui, sans-serif; }
  main { width: min(100% - 2rem, 42rem); margin: clamp(2rem, 7vh, 5rem) auto; }
  h1 { font-size: clamp(1.65rem, 5vw, 2.2rem); margin: 0; }
  header p { color: #435470; margin: .35rem 0 1.5rem; }
  section { padding: clamp(1rem, 4vw, 1.5rem); background: #fff; border: 1px solid #d4dce7; border-radius: .75rem; }
  label { display: block; font-weight: 650; margin-bottom: .35rem; }
  select, button { font: inherit; color: inherit; background: #fff; border: 1px solid #9aaac0; border-radius: .4rem; padding: .52rem .75rem; }
  select { min-width: 10rem; }
  a { color: #154486; text-underline-offset: .2em; }
  .actions { display: flex; flex-wrap: wrap; gap: .55rem; margin: 1.25rem 0; }
  button { cursor: pointer; }
  button:first-child { color: #fff; background: #223d6a; border-color: #223d6a; }
  button:disabled { opacity: .55; cursor: default; }
  #result { display: block; padding: .65rem .8rem; background: #edf2fa; border-radius: .4rem; min-height: 2.75rem; }
  #result[data-state="error"] { background: #fff0eb; color: #8d2818; }
  :focus-visible { outline: 3px solid #2d64a9; outline-offset: 2px; }
</style>
<main>
  <header>
    <h1>Thử hàng đợi DYM</h1>
    <p>Hệ thống tự tạo mã khách giả cho bản thử.</p>
  </header>
  <section aria-label="Điều khiển bản thử">
    <label for="branch">Chi nhánh</label>
    <select id="branch">
      <option value="q1">Quận 1</option>
      <option value="q7">Quận 7</option>
      <option value="hn">Hà Nội</option>
    </select>
    <p><a id="tv" href="/tv/q1" target="_blank" rel="noopener">Mở màn hình TV ở tab mới</a></p>
    <div class="actions">
      <button type="button" id="register">Đăng ký thử</button>
      <button type="button" id="duplicate" disabled>Gửi lại mã vừa dùng</button>
      <button type="button" id="call">Gọi số tiếp theo</button>
    </div>
    <output id="result" role="status">Chọn một thao tác để bắt đầu.</output>
  </section>
</main>
<script type="module">
  const branch = document.querySelector('#branch');
  const tv = document.querySelector('#tv');
  const register = document.querySelector('#register');
  const duplicate = document.querySelector('#duplicate');
  const call = document.querySelector('#call');
  const result = document.querySelector('#result');
  const lastCode = new Map();
  const format = (number) => String(number).padStart(3, '0');

  function show(message, state = 'info') {
    result.value = message;
    result.dataset.state = state;
  }

  function setBusy(busy) {
    branch.disabled = register.disabled = call.disabled = busy;
    duplicate.disabled = busy || !lastCode.has(branch.value);
  }

  async function run(action, demoCode) {
    const selected = branch.value;
    setBusy(true);
    show('Đang xử lý…');
    try {
      const response = await fetch('/api/' + selected + '/' + action, {
        method: 'POST',
        headers: demoCode ? { 'Content-Type': 'application/json' } : undefined,
        body: demoCode ? JSON.stringify({ demoCode }) : undefined,
      });
      if (response.status === 409) {
        show('Đã chặn mã đăng ký trùng trong vòng 1 giờ.', 'error');
        return;
      }
      if (!response.ok) throw new Error('Unexpected response');
      const row = await response.json();
      if (action === 'register') {
        lastCode.set(selected, demoCode);
        show('Đã cấp số ' + format(row.queue_number) + '.');
      } else {
        show(row ? 'Đã gọi số ' + format(row.queue_number) + '.' : 'Hàng đợi đã hết khách.');
      }
    } catch {
      show('Không thực hiện được. Vui lòng thử lại.', 'error');
    } finally {
      setBusy(false);
    }
  }

  branch.addEventListener('change', () => {
    tv.href = '/tv/' + branch.value;
    setBusy(false);
    show('Đang thử ' + branch.selectedOptions[0].textContent + '.');
  });
  register.addEventListener('click', () => run('register', 'DEMO-' + crypto.randomUUID().toUpperCase()));
  duplicate.addEventListener('click', () => run('register', lastCode.get(branch.value)));
  call.addEventListener('click', () => run('call-next'));
</script>
</html>`;
