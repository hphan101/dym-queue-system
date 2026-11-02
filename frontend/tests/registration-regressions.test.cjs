const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function load(file, mocks = {}, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const generic = new Proxy({}, { get: (_, name) => String(name) });
  vm.runInNewContext(code, {
    exports, console, Date, ...globals,
    require: (name) => mocks[name] ?? generic,
  });
  return exports;
}

function reactHarness(initialStates = []) {
  const states = [...initialStates];
  let index = 0;
  const react = {
    useState(initial) {
      const slot = index++;
      if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
      return [states[slot], (value) => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }];
    },
    useEffect() {}, useRef: (value) => ({ current: value }),
    useCallback: (fn) => fn, useMemo: (fn) => fn(), useId: () => 'test',
    lazy: () => 'LazyComponent',
  };
  return {
    states,
    mocks: {
      react: { __esModule: true, default: react, ...react },
      'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    },
  };
}

function elements(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}

const fields = {
  full_name: ' Nguyễn Văn A ', gender: 'Nam', birth_date: '2000-01-01',
  phone_number: '090 123 4567', identity_document: ' b1234567 ',
  company_name: '', province: 'Hà Nội', ward: 'Cầu Giấy', address_detail: '123 đường A',
};

test('failed saves reject, never write a local success, and can be retried', async () => {
  let error = { message: 'INVALID_DATA' };
  let args;
  const localStorage = storage();
  const sessionStorage = storage();
  const { saveRegistrationEdit } = load('features/admin/registrationEdits.ts', {
    '../../lib/supabaseClient': { supabase: { rpc: async (_, input) => { args = input; return { error }; } } },
  }, { window: { localStorage, sessionStorage } });
  await assert.rejects(saveRegistrationEdit('patient', fields), /Không thể lưu/);
  assert.equal(sessionStorage.getItem('dym_registration_overrides_v1'), null);
  error = null;
  await saveRegistrationEdit('patient', fields);
  assert.equal(args.p_full_name, 'Nguyễn Văn A');
  assert.equal(args.p_phone_number, '0901234567');
  assert.equal(args.p_identity_document, 'B1234567');
});

test('network failures propagate to the edit form', async () => {
  const { saveRegistrationEdit } = load('features/admin/registrationEdits.ts', {
    '../../lib/supabaseClient': { supabase: { rpc: async () => { throw new Error('offline'); } } },
  });
  await assert.rejects(saveRegistrationEdit('patient', fields), /offline/);
});

test('queue receipts restore only for the same branch and Vietnam date', () => {
  const localStorage = storage();
  const receipt = load('features/registration/registrationReceipt.ts', {
    '../../lib/date': { getTodayInVietnam: () => '2026-11-01' },
  }, { localStorage });
  localStorage.setItem('dym_registration_step', 'success');
  localStorage.setItem('dym_registration_queue', '0001');
  assert.equal(receipt.readRegistrationReceipt('q1'), null);
  receipt.storeRegistrationReceipt({ branch: 'q1', queueDate: '2026-11-01', queueNumber: '0042' });
  assert.equal(receipt.readRegistrationReceipt('q1').queueNumber, '0042');
  assert.equal(receipt.readRegistrationReceipt('q7'), null);
  assert.equal(receipt.readRegistrationReceipt(null), null);
  assert.equal(receipt.readRegistrationReceipt('q1', '2026-11-02'), null);
  receipt.clearRegistrationReceipt();
  assert.equal(receipt.readRegistrationReceipt('q1'), null);
  localStorage.setItem('dym_registration_receipt_v2', '{broken');
  assert.equal(receipt.readRegistrationReceipt('q1'), null);
});

test('receipt storage errors do not turn a successful registration into a failure', () => {
  const receipt = load('features/registration/registrationReceipt.ts', {}, {
    localStorage: new Proxy({}, { get: () => () => { throw new Error('storage blocked'); } }),
  });
  assert.doesNotThrow(() => receipt.storeRegistrationReceipt({ branch: 'q1', queueDate: '2026-11-01', queueNumber: '0001' }));
  assert.equal(receipt.readRegistrationReceipt('q1', '2026-11-01'), null);
});

test('print status remains unchanged until the server confirms, including on failure', async () => {
  const localStorage = storage();
  let finish;
  const status = load('features/admin/hooks/usePrintStatus.ts', {
    react: {},
    '../../../lib/supabaseClient': { supabase: { rpc: () => new Promise((resolve) => { finish = resolve; }) } },
  }, { window: { localStorage, dispatchEvent() {} }, CustomEvent: class {} });
  const failed = status.markRegistrationPrinted('patient', 'tt25');
  assert.equal(localStorage.getItem('dym_registration_print_status_v1'), null);
  finish({ error: { message: 'offline' } });
  await assert.rejects(failed);
  assert.equal(localStorage.getItem('dym_registration_print_status_v1'), null);
  const success = status.markRegistrationPrinted('patient', 'tt25');
  finish({ error: null });
  await success;
  assert.equal(JSON.parse(localStorage.getItem('dym_registration_print_status_v1')).patient.tt25, true);
});

for (const name of ['TT25PrintModal', 'ConsentPrintModal']) {
  test(`${name}: only the Print action marks printed; preview and download do not`, async () => {
    const harness = reactHarness(name === 'ConsentPrintModal'
      ? ['blob:pdf', false, null, 'all', null, true] : ['blob:pdf', false, null, 'pdf']);
    let confirmations = 0;
    const component = load(`features/registration/${name}.tsx`, {
      ...harness.mocks, 'react-dom': { createPortal: (tree) => tree },
      './consentPdfService': {
        getConsentFormLanguage: () => 'vi', getConsentPageIndices: () => [0, 1],
      },
    }, {
      window: { print() {}, open: () => ({}), innerWidth: 1280 }, navigator: { userAgent: 'Desktop', maxTouchPoints: 0 },
      document: { body: { appendChild() {}, removeChild() {} }, createElement: () => ({ click() {} }) },
    });
    const tree = component[name]({ isOpen: true, data: { fullName: 'Test', queueNumber: '0001' }, onClose() {}, onPrinted: async () => { confirmations++; } });
    assert.equal(confirmations, 0);
    const nodes = elements(tree);
    nodes.find((n) => n.props?.onClick?.name === 'handleDownload').props.onClick();
    assert.equal(confirmations, 0);
    nodes.find((n) => n.props?.onClick?.name === 'handlePrint').props.onClick();
    assert.equal(confirmations, 1);
    assert.equal(nodes.some((n) => n.type === 'PrintConfirmationButton'), false);
  });
}

test('printing both documents uses one request and reprinting never resets a status', async () => {
  const localStorage = storage();
  const requests = [];
  const status = load('features/admin/hooks/usePrintStatus.ts', {
    react: {},
    '../../../lib/supabaseClient': { supabase: { rpc: async (_, args) => { requests.push(args); return { error: null }; } } },
  }, { window: { localStorage, dispatchEvent() {} }, CustomEvent: class {} });
  await status.markRegistrationPrinted('patient', 'both');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].p_printed_consent, true);
  assert.equal(requests[0].p_printed_tt25, true);
  await status.markRegistrationPrinted('patient', 'consent');
  assert.equal(requests[1].p_printed_consent, true);
  assert.equal(requests[1].p_printed_tt25, null);
  const item = JSON.parse(localStorage.getItem('dym_registration_print_status_v1')).patient;
  assert.equal(item.consent, true);
  assert.equal(item.tt25, true);
});

test('editing a profile cannot overwrite print status from another workstation', async () => {
  let request;
  const { saveRegistrationEdit } = load('features/admin/registrationEdits.ts', {
    '../../lib/supabaseClient': { supabase: { rpc: async (_, args) => { request = args; return { error: null }; } } },
  });
  const extras = { occupation: 'Kế toán', printedConsent: false, printedTT25: false };
  await saveRegistrationEdit('patient', { ...fields, tt25_data: extras });
  assert.equal(request.p_tt25_data.occupation, 'Kế toán');
  assert.equal('printedConsent' in request.p_tt25_data, false);
  assert.equal('printedTT25' in request.p_tt25_data, false);
  assert.equal(extras.printedTT25, false);
});

test('reception prints the latest server record and ignores obsolete browser overrides', async () => {
  const harness = reactHarness();
  const oldStorage = storage();
  oldStorage.setItem('dym_registration_overrides_v1', JSON.stringify({ patient: { full_name: 'Stale local name' } }));
  const row = {
    id: 'patient', branch: 'q1', date: '2026-11-01', queueNumber: '0001',
    fullName: 'Name before refresh', birthDate: '01/01/2000', gender: 'Nam',
    phone: '0901234567', companyName: '', status: 'waiting',
  };
  let marked = false;
  const { buildPrintData } = load('features/admin/utils/buildPrintData.ts', {
    '../../registration/tt25Types': {
      createDefaultTT25Data: (data) => data,
      getDefaultTargetPaymentByReason: () => ({}),
    },
    '../../../lib/queueNumber': { formatQueueNumber: (n) => String(n) },
  });
  const { QueueTable } = load('features/admin/components/QueueTable.tsx', {
    ...harness.mocks,
    '../hooks/usePrintStatus': { usePrintStatus: () => ({ getStatus: () => ({}), markPrinted: () => { marked = true; } }) },
    '../constants/queueConstants': { STATUS_META: { waiting: { label: 'Chờ gọi' } } },
    '../utils/adminFormatters': { calculateAge: () => 26, formatPhone: (s) => s },
    '../utils/buildPrintData': { buildPrintData },
    '../../registration/tt25Types': {
      createDefaultTT25Data: (data) => data,
      getDefaultTargetPaymentByReason: () => ({}),
    },
    '../../../lib/supabaseClient': { supabase: { rpc: async () => ({
      data: [{ id: row.id, full_name: 'Latest server name', birth_date: '2000-01-01',
        gender: 'Nam', phone_number: row.phone, company_name: '', queue_date: row.date,
        identity_document: 'B1234567', province: 'Hà Nội', ward: 'Cầu Giấy', address_detail: '123 đường A' }],
      error: null,
    }) } },
  }, { window: { sessionStorage: oldStorage, localStorage: oldStorage } });
  const tree = QueueTable({
    filteredRows: [row], paginatedRows: [row], query: '', branchName: 'Q1',
    date: row.date, today: row.date, visiblePage: 1, totalPages: 1,
    firstVisibleRow: 1, lastVisibleRow: 1,
  });
  elements(tree).find((n) => n.props?.title === 'In phiếu khám sức khỏe TT25').props.onClick();
  await new Promise(setImmediate);
  assert.equal(harness.states[1].fullName, 'Latest server name');
  assert.equal(harness.states[1].cccd, 'B1234567');
  assert.equal(marked, false);
});
