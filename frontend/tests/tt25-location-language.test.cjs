const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sourceDir = path.resolve(__dirname, '../src/features/registration');

function load(file, imports = {}, step) {
  let source = fs.readFileSync(path.join(sourceDir, file), 'utf8');
  if (step) source = source.replace('useState<1 | 2 | 3 | 4>(1)', `useState<1 | 2 | 3 | 4>(${step})`);
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, key => imports[key] ?? require(key));
  return exports;
}

function render(lang, step, targetPayment) {
  const passthrough = ({ children }) => React.createElement('div', null, children);
  const { TT25RegistrationForm } = load('form/TT25RegistrationForm.tsx', {
    '@/components/ui/alert': { Alert: passthrough, AlertDescription: passthrough },
    '@/components/ui/button': { Button: 'button' },
    '@/components/ui/checkbox': { Checkbox: () => null },
    '@/components/ui/field': { Field: passthrough, FieldError: passthrough, FieldLabel: 'label' },
    '@/components/ui/input': { Input: 'input' },
    '../tt25Types': {
      ...load('tt25Types.ts'),
      ...(targetPayment ? { getDefaultTargetPaymentByReason: () => targetPayment } : {}),
    },
    '../tt25Constants': load('tt25Constants.ts'),
    './SearchableSelect': {},
    './BirthDateInput': {},
    './cccdValidator': {},
    '../../../../../supabase/functions/_shared/passportName': load('../../../../supabase/functions/_shared/passportName.ts'),
    './locationService': {},
  }, step);
  return renderToStaticMarkup(React.createElement(TT25RegistrationForm, {
    lang, branch: 'q1', isLoading: false, onSubmit() {},
  }));
}

test('TT25 location labels follow the form language, including the automatic selection', () => {
  const english = render('en', 3);
  for (const label of ['Auto-selected: Medical facility', 'Mobile clinic', 'Health station', 'School', 'Home health check']) {
    assert.ok(english.includes(label), label);
  }
  assert.doesNotMatch(english, /CS KBCB|Khám lưu động|Trạm Y tế|Trường học|KSK tại nhà/);
  const vietnamese = render('vi', 3);
  for (const label of ['Mặc định: CS KBCB', 'Khám lưu động', 'Trạm Y tế', 'Trường học', 'KSK tại nhà']) {
    assert.ok(vietnamese.includes(label), label);
  }
});

test('TT25 confirmation shows the translated examination location', () => {
  const english = render('en', 4);
  assert.match(english, /Exam Location:/);
  assert.match(english, />Medical facility</);
  assert.doesNotMatch(english, /CS KBCB/);
  assert.match(render('vi', 4), />CS KBCB</);
});

test('the Japanese form translates payment choices and keeps custom answers in its confirmation', () => {
  const payment = render('ja', 3);
  for (const label of ['受診区分と費用負担', '14 – 学生・研修生', '勤務先負担', '自動選択：医療機関']) {
    assert.ok(payment.includes(label), label);
  }
  const confirmation = render('ja', 4, {
    targetGroup: 'other', paymentSource: 'other', targetOtherDetails: '研修参加者', paymentOtherDetails: '学校負担',
  });
  for (const label of ['登録内容の確認', '研修参加者', '学校負担', '医療機関']) assert.ok(confirmation.includes(label), label);
});

test('TT25 confirmation translates every target category and payment source', () => {
  for (const [targetGroup, enTarget, viTarget] of [
    ['14', '14 – Student / Trainee', '14 – Sinh viên, học viên'],
    ['15', '15 – Official employee', '15 – NLĐ chính thức'],
    ['16', '16 – Informal worker', '16 – NLĐ phi chính thức'],
    ['other', 'Other target category', 'Đối tượng khác'],
  ]) {
    for (const [paymentSource, enPayment, viPayment] of [
      ['employer', 'Paid by employer', 'Người sử dụng lao động'],
      ['self', 'Self-paid by examinee', 'Người dân tự chi trả'],
      ['other', 'Other payment source', 'Nguồn khác'],
    ]) {
      const value = { targetGroup, paymentSource, targetOtherDetails: '', paymentOtherDetails: '' };
      for (const [lang, target, payment] of [['en', enTarget, enPayment], ['vi', viTarget, viPayment]]) {
        const html = render(lang, 4, value);
        assert.ok(html.includes(target), `${lang}: ${target}`);
        assert.ok(html.includes(payment), `${lang}: ${payment}`);
      }
    }
  }
});

test('TT25 confirmation preserves custom target and payment details in either language', () => {
  for (const lang of ['en', 'vi']) {
    const html = render(lang, 4, {
      targetGroup: 'other', paymentSource: 'other',
      targetOtherDetails: 'Custom category', paymentOtherDetails: 'Custom payer',
    });
    assert.ok(html.includes('Custom category'));
    assert.ok(html.includes('Custom payer'));
  }
});
