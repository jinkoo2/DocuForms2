function _eid(id){
    return document.getElementById(id);
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
  