// Utility functions for form builder

export function extractFields(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const fields = [];
  
  // Find all input, select, textarea elements
  const inputs = doc.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    let name = input.getAttribute('name');
    const id = input.getAttribute('id');
    
    // Auto-fix: if name is "temperature" or empty and id exists, use id as name
    if ((!name || name === 'temperature' || name === 'field_name') && id) {
      name = id;
    }
    
    if (name) {
      const type = input.getAttribute('type') || input.tagName.toLowerCase();
      fields.push({
        name: name,
        type: type === 'INPUT' ? (input.type || 'text') : type.toLowerCase()
      });
    }
  });
  
  return fields;
}

export function extractRules(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rules = [];
  
  // Find elements with rule data attributes
  const ruleElements = doc.querySelectorAll('[data-rule-left]');
  ruleElements.forEach(el => {
    const left = el.getAttribute('data-rule-left');
    const operator = el.getAttribute('data-rule-op');
    const ruleType = el.getAttribute('data-rule-type');
    const refForm = el.getAttribute('data-rule-ref-form');
    const refField = el.getAttribute('data-rule-ref-field');
    const constantValue = el.getAttribute('data-rule-value');
    
    // Skip rules with empty left field (not configured yet)
    if (!left || left.trim() === '') {
      return;
    }
    
    if (left && operator) {
      let right;
      
      // Determine rule type
      const actualRuleType = ruleType || (refForm && refField ? 'reference' : 'constant');
      
      if (actualRuleType === 'reference' && refForm && refField) {
        right = {
          source: "reference",
          formId: refForm,
          field: refField,
          mode: "last"
        };
      } else {
        // Constant rule
        if (constantValue !== null && constantValue !== '' && constantValue.trim() !== '') {
          const numValue = parseFloat(constantValue);
          right = {
            source: "constant",
            value: isNaN(numValue) ? constantValue : numValue
          };
        } else {
          return; // Skip constant rules with no value
        }
      }
      
      rules.push({
        type: "pass_fail",
        left: left,
        operator: operator,
        right: right
      });
    }
  });
  
  return rules;
}

export function formatHtml(html) {
  if (!html || !html.trim()) return html;
  
  try {
    // Simple HTML formatting - indent tags
    let formatted = html;
    
    // Add newlines before and after block-level tags
    formatted = formatted.replace(/(<div[^>]*>)/g, '\n$1');
    formatted = formatted.replace(/(<\/div>)/g, '$1\n');
    formatted = formatted.replace(/(<input[^>]*>)/g, '\n  $1');
    formatted = formatted.replace(/(<label[^>]*>)/g, '\n  $1');
    formatted = formatted.replace(/(<select[^>]*>)/g, '\n  $1');
    formatted = formatted.replace(/(<textarea[^>]*>)/g, '\n  $1');
    formatted = formatted.replace(/(<br\s*\/?>)/g, '$1\n');
    
    // Clean up multiple newlines
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    
    // Trim
    formatted = formatted.trim();
    
    return formatted;
  } catch (err) {
    console.error('Error formatting HTML:', err);
    return html;
  }
}
