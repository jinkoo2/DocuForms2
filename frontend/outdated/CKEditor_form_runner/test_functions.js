function _eid(id){
    return document.getElementById(id);
}

function baseline() {
  console.log('baseline', baselineSubmission);
  return baselineSubmission;
}

function baseline_values() {
  const values = baselineSubmission?.values ?? null;
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

  const controls = form.querySelectorAll(
    'input, select'
  );
  controls.forEach(control => {
    run_control_script(control);
  });


  const inputs = form.querySelectorAll(
    'input' 
  );
  inputs.forEach(input => {
    test_input_pass_warning_fail(input);
  });


}

function run_control_script(control) {
  // run script
  const script = control.dataset.script;

  console.log('script', script);

  if (!script) return;

  try {
    // Provide controlled scope
    const fn = new Function('self', script);
    fn(control);
  } catch (err) {
    console.error(
      'Error evaluating data-script for',
      control,
      err
    );
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

    // If no passRange and no warningRange provided, nothing to evaluate.
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

