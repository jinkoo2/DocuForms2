// Test functions for form evaluation in iframe previews
// This file is served as a static asset and loaded in iframe previews

// Function to get server URL
// This will get the URL from window.BACKEND_URL which should be set by the parent
function get_server_url() {
  // Try to get from window (set by parent page)
  if (typeof window !== 'undefined' && window.BACKEND_URL) {
    return window.BACKEND_URL;
  }
  // Fallback
  return 'http://localhost:8001';
}

function _eid(id) {
  return document.getElementById(id);
}

function baseline() {
  console.log('baseline', window.baselineSubmission);
  return window.baselineSubmission;
}

function baseline_values() {
  const values = window.baselineSubmission?.values ?? null;
  console.log('baseline_values', values);
  return values;
}

function get_baseline_value(fieldName, fallbackInputId) {
  let b = null;

  // 1) Try baseline submission
  if (typeof baseline_values === 'function') {
    const base = baseline_values();
    if (base && base[fieldName] !== undefined) {
      b = parseFloat(base[fieldName]);
    }
  }

  // 2) Fallback to baseline input field
  if ((b === null || isNaN(b)) && fallbackInputId) {
    const el = _eid(fallbackInputId);
    if (el && el.value !== '') {
      b = parseFloat(el.value);
    }
  }

  return isNaN(b) ? null : b;
}

function calc_percent_error({
  inputId,
  baselineField,
  baselineInputId,
  outputId
}) {
  const a = parseFloat(_eid(inputId)?.value);
  const b = get_baseline_value(baselineField, baselineInputId);
  const out = _eid(outputId);

  if (!out) return;

  if (!isNaN(a) && b !== null && b !== 0) {
    const err = (a - b) / b * 100.0;
    out.value = err.toFixed(2);
  } else {
    // No valid baseline yet → neutral state
    out.value = '';
    out.dataset.result = 'PASS';
  }
}

function autofill_baseline(fieldName, targetInputId) {
  if (typeof baseline_values !== 'function') return;

  const base = baseline_values();
  if (base && base[fieldName] !== undefined) {
    const el = _eid(targetInputId);
    if (el) {
      el.value = base[fieldName];
    }
  }
}

function eval_form(caller_control) {
  console.log('eval_form', caller_control);

  const form = _eid('form');
  if (!form) return;

  const controls = form.querySelectorAll('input, select');
  controls.forEach(control => {
    run_control_script(control);
  });

  const inputs = form.querySelectorAll('input');
  inputs.forEach(input => {
    test_input_pass_warning_fail(input);
  });
}

function run_control_script(control) {
  const script = control.dataset.script;
  console.log('script', script);

  if (!script) return;

  try {
    const fn = new Function('self', script);
    fn(control);
  } catch (err) {
    console.error('Error evaluating data-script for', control, err);
  }
}

function test_input_pass_warning_fail(input) {
  if (!input || input.value === '') {
    if (input?.nextElementSibling) {
      input.nextElementSibling.textContent = '';
    }
    if (input) input.dataset.result = '';
    return;
  }

  const v = Number(input.value);
  if (Number.isNaN(v)) return;

  const inRange = r => {
    if (!r) return false;
    const [min, max] = r.split(':').map(Number);
    return v >= min && v <= max;
  };

  if (!input.dataset.passRange && !input.dataset.warningRange) {
    return;
  }

  let result = 'FAIL';
  let color = 'red';

  if (inRange(input.dataset.passRange)) {
    result = 'PASS';
    color = 'green';
  } else if (inRange(input.dataset.warningRange)) {
    result = 'WARNING';
    color = 'orange';
  }

  const output = input.nextElementSibling;
  if (output) {
    output.textContent = result.toUpperCase();
    output.style.color = color;
  }

  input.dataset.result = result.toUpperCase();
}

// Make functions available globally
if (typeof window !== 'undefined') {
  window._eid = _eid;
  window.baseline = baseline;
  window.baseline_values = baseline_values;
  window.get_baseline_value = get_baseline_value;
  window.calc_percent_error = calc_percent_error;
  window.autofill_baseline = autofill_baseline;
  window.eval_form = eval_form;
  window.run_control_script = run_control_script;
  window.test_input_pass_warning_fail = test_input_pass_warning_fail;
  window.get_server_url = get_server_url;
}
