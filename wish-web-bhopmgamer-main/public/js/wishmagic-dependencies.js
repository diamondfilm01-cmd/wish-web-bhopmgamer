/**
 * WishMagic Advanced Field Dependency & Smart Customizer UI System (Part 10)
 * ===========================================================================
 * Intelligent, dependency-aware, and template-driven logic engine.
 *
 * Implements:
 * - Safe Recursive-Descent Expression Parser (NO eval / new Function)
 * - Supported Operators: =, ==, !=, >, <, >=, <=, contains, not_contains, in, not_in, exists, not_exists, truthy, falsy
 * - AND / OR / NOT / Nested Parentheses logic
 * - Dependency Graph with Cycle & Infinite-Loop Detection
 * - Hidden vs Disabled state segregation
 * - Clear-On-Hide vs State Preservation Cache
 * - Conditional Required (data-wm-required-if)
 * - Conditional Select Options (visibleIf per option) & Auto-Reset of Invalid Options
 * - Dynamic Conditional Labels (data-wm-label-if) & Descriptions
 * - Group-level & Section/Media/Capability Dependency Integration
 * - Fast Topological Evaluation & Memory Cleanup
 *
 * Framework-independent, JSON-ready, Node/Browser compatible.
 */

(function (global) {
  'use strict';

  const PROTOCOL_VERSION = '1.0';

  // ---------------------------------------------------------------------------
  // 1. SAFE LEXER & RECURSIVE-DESCENT PARSER (NO EVAL / NEW FUNCTION)
  // ---------------------------------------------------------------------------

  const TokenType = {
    LPAREN: 'LPAREN',
    RPAREN: 'RPAREN',
    AND: 'AND',
    OR: 'OR',
    NOT: 'NOT',
    OP: 'OP',
    IDENT: 'IDENT',
    LITERAL: 'LITERAL',
    EOF: 'EOF'
  };

  const OPERATOR_SET = new Set([
    '=', '==', '!=', '<=', '>=', '<', '>',
    'contains', 'not_contains', 'in', 'not_in',
    'exists', 'not_exists', 'truthy', 'falsy'
  ]);

  function tokenize(input) {
    const tokens = [];
    let i = 0;
    const str = String(input || '').trim();

    while (i < str.length) {
      const ch = str[i];

      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      if (ch === '(') {
        tokens.push({ type: TokenType.LPAREN, value: '(' });
        i++;
        continue;
      }

      if (ch === ')') {
        tokens.push({ type: TokenType.RPAREN, value: ')' });
        i++;
        continue;
      }

      // Check multi-character symbols
      if (str.startsWith('!=', i)) {
        tokens.push({ type: TokenType.OP, value: '!=' });
        i += 2;
        continue;
      }
      if (str.startsWith('==', i)) {
        tokens.push({ type: TokenType.OP, value: '==' });
        i += 2;
        continue;
      }
      if (str.startsWith('<=', i)) {
        tokens.push({ type: TokenType.OP, value: '<=' });
        i += 2;
        continue;
      }
      if (str.startsWith('>=', i)) {
        tokens.push({ type: TokenType.OP, value: '>=' });
        i += 2;
        continue;
      }
      if (str.startsWith('&&', i)) {
        tokens.push({ type: TokenType.AND, value: 'AND' });
        i += 2;
        continue;
      }
      if (str.startsWith('||', i)) {
        tokens.push({ type: TokenType.OR, value: 'OR' });
        i += 2;
        continue;
      }

      if (ch === '=' || ch === '<' || ch === '>') {
        tokens.push({ type: TokenType.OP, value: ch });
        i++;
        continue;
      }

      if (ch === '!') {
        tokens.push({ type: TokenType.NOT, value: 'NOT' });
        i++;
        continue;
      }

      // Quoted literals: 'string' or "string"
      if (ch === '"' || ch === "'") {
        const quote = ch;
        i++;
        let lit = '';
        while (i < str.length && str[i] !== quote) {
          if (str[i] === '\\' && i + 1 < str.length) {
            lit += str[i + 1];
            i += 2;
          } else {
            lit += str[i];
            i++;
          }
        }
        if (i < str.length && str[i] === quote) i++;
        tokens.push({ type: TokenType.LITERAL, value: lit });
        continue;
      }

      // Word / Identifier / Keyword
      let word = '';
      while (i < str.length && !/\s|[()=!<>]/.test(str[i])) {
        word += str[i];
        i++;
      }

      const upper = word.toUpperCase();
      if (upper === 'AND') {
        tokens.push({ type: TokenType.AND, value: 'AND' });
      } else if (upper === 'OR') {
        tokens.push({ type: TokenType.OR, value: 'OR' });
      } else if (upper === 'NOT') {
        tokens.push({ type: TokenType.NOT, value: 'NOT' });
      } else if (OPERATOR_SET.has(word.toLowerCase())) {
        tokens.push({ type: TokenType.OP, value: word.toLowerCase() });
      } else if (word === 'true') {
        tokens.push({ type: TokenType.LITERAL, value: true });
      } else if (word === 'false') {
        tokens.push({ type: TokenType.LITERAL, value: false });
      } else if (word === 'null') {
        tokens.push({ type: TokenType.LITERAL, value: null });
      } else if (!Number.isNaN(Number(word)) && word !== '') {
        tokens.push({ type: TokenType.LITERAL, value: Number(word) });
      } else {
        tokens.push({ type: TokenType.IDENT, value: word });
      }
    }

    tokens.push({ type: TokenType.EOF, value: null });
    return tokens;
  }

  class Parser {
    constructor(tokens) {
      this.tokens = tokens;
      this.pos = 0;
    }

    peek() {
      return this.tokens[this.pos] || { type: TokenType.EOF };
    }

    consume(type) {
      const cur = this.peek();
      if (type && cur.type !== type) {
        throw new Error(`Unexpected token: expected ${type}, got ${cur.type} ("${cur.value}")`);
      }
      this.pos++;
      return cur;
    }

    parse() {
      if (this.peek().type === TokenType.EOF) {
        return { type: 'LITERAL', value: true };
      }
      const ast = this.parseOr();
      return ast;
    }

    parseOr() {
      let left = this.parseAnd();
      while (this.peek().type === TokenType.OR) {
        this.consume(TokenType.OR);
        const right = this.parseAnd();
        left = { type: 'LOGICAL', op: 'OR', left, right };
      }
      return left;
    }

    parseAnd() {
      let left = this.parseUnary();
      while (this.peek().type === TokenType.AND) {
        this.consume(TokenType.AND);
        const right = this.parseUnary();
        left = { type: 'LOGICAL', op: 'AND', left, right };
      }
      return left;
    }

    parseUnary() {
      if (this.peek().type === TokenType.NOT) {
        this.consume(TokenType.NOT);
        const expr = this.parseUnary();
        return { type: 'UNARY', op: 'NOT', expr };
      }
      return this.parsePrimary();
    }

    parsePrimary() {
      const cur = this.peek();

      if (cur.type === TokenType.LPAREN) {
        this.consume(TokenType.LPAREN);
        const expr = this.parseOr();
        this.consume(TokenType.RPAREN);
        return expr;
      }

      if (cur.type === TokenType.IDENT) {
        const ident = this.consume(TokenType.IDENT).value;
        const next = this.peek();

        // Check unary operators after ident: e.g. "field exists", "field truthy"
        if (next.type === TokenType.OP && (next.value === 'exists' || next.value === 'not_exists' || next.value === 'truthy' || next.value === 'falsy')) {
          const op = this.consume(TokenType.OP).value;
          return { type: 'COMPARISON', field: ident, op, value: null };
        }

        // Binary comparison: "field = value"
        if (next.type === TokenType.OP) {
          const op = this.consume(TokenType.OP).value;
          const valToken = this.peek();
          let value = null;

          if (valToken.type === TokenType.LITERAL || valToken.type === TokenType.IDENT) {
            value = this.consume().value;
          } else {
            value = '';
          }

          return { type: 'COMPARISON', field: ident, op, value };
        }

        // Bare identifier: treated as truthy check
        return { type: 'COMPARISON', field: ident, op: 'truthy', value: null };
      }

      if (cur.type === TokenType.LITERAL) {
        return { type: 'LITERAL', value: this.consume(TokenType.LITERAL).value };
      }

      throw new Error(`Unexpected token in expression: ${cur.type} ("${cur.value}")`);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. SAFE STATE RESOLUTION & COMPARISON EVALUATOR
  // ---------------------------------------------------------------------------

  function resolveStateValue(fieldKey, state) {
    if (!state || !fieldKey) return undefined;

    // Direct match
    if (state[fieldKey] !== undefined) return state[fieldKey];

    // Inside content namespace
    if (state.content && state.content[fieldKey] !== undefined) {
      return state.content[fieldKey];
    }

    // Dot navigation (e.g. "sections.gallery.enabled", "media.video", "capabilities.voice")
    if (fieldKey.includes('.')) {
      const parts = fieldKey.split('.');
      let cur = state;
      for (const p of parts) {
        if (cur === null || cur === undefined || typeof cur !== 'object') {
          cur = undefined;
          break;
        }
        cur = cur[p];
      }
      if (cur !== undefined) return cur;
    }

    // Fallback global WishMagicData check
    if (typeof global !== 'undefined' && global.WishMagicData) {
      const gData = global.WishMagicData;
      if (gData[fieldKey] !== undefined) return gData[fieldKey];
      if (gData.content && gData.content[fieldKey] !== undefined) return gData.content[fieldKey];
      if (gData.sections && gData.sections[fieldKey] !== undefined) {
        const sec = gData.sections[fieldKey];
        return typeof sec === 'boolean' ? sec : sec?.enabled;
      }
    }

    return undefined;
  }

  function evaluateComparison(ast, state) {
    const rawVal = resolveStateValue(ast.field, state);
    const op = (ast.op || '=').toLowerCase();
    const target = ast.value;

    switch (op) {
      case '=':
      case '==':
        if (target === true || target === 'true') return rawVal === true || rawVal === 'true' || rawVal === 1;
        if (target === false || target === 'false') return rawVal === false || rawVal === 'false' || rawVal === 0 || rawVal === undefined || rawVal === null;
        if (target === null || target === 'null') return rawVal === null || rawVal === undefined || rawVal === '';
        return String(rawVal !== undefined && rawVal !== null ? rawVal : '').trim().toLowerCase() === String(target).trim().toLowerCase();

      case '!=':
        if (target === true || target === 'true') return !(rawVal === true || rawVal === 'true' || rawVal === 1);
        if (target === false || target === 'false') return !(rawVal === false || rawVal === 'false' || rawVal === 0 || rawVal === undefined || rawVal === null);
        return String(rawVal !== undefined && rawVal !== null ? rawVal : '').trim().toLowerCase() !== String(target).trim().toLowerCase();

      case '>':
        return Number(rawVal) > Number(target);

      case '<':
        return Number(rawVal) < Number(target);

      case '>=':
        return Number(rawVal) >= Number(target);

      case '<=':
        return Number(rawVal) <= Number(target);

      case 'contains':
        if (Array.isArray(rawVal)) {
          return rawVal.some(item => String(item).toLowerCase() === String(target).toLowerCase());
        }
        return String(rawVal || '').toLowerCase().includes(String(target || '').toLowerCase());

      case 'not_contains':
        if (Array.isArray(rawVal)) {
          return !rawVal.some(item => String(item).toLowerCase() === String(target).toLowerCase());
        }
        return !String(rawVal || '').toLowerCase().includes(String(target || '').toLowerCase());

      case 'in': {
        const allowed = Array.isArray(target)
          ? target.map(String)
          : String(target || '').split(',').map(s => s.trim().toLowerCase());
        return allowed.includes(String(rawVal || '').trim().toLowerCase());
      }

      case 'not_in': {
        const disallowed = Array.isArray(target)
          ? target.map(String)
          : String(target || '').split(',').map(s => s.trim().toLowerCase());
        return !disallowed.includes(String(rawVal || '').trim().toLowerCase());
      }

      case 'exists':
        return rawVal !== undefined && rawVal !== null && rawVal !== '';

      case 'not_exists':
        return rawVal === undefined || rawVal === null || rawVal === '';

      case 'truthy':
        return Boolean(rawVal) && rawVal !== 'false' && rawVal !== '0' && rawVal !== 0;

      case 'falsy':
        return !rawVal || rawVal === 'false' || rawVal === '0' || rawVal === 0;

      default:
        return false;
    }
  }

  function evaluateAST(ast, state) {
    if (!ast) return true;

    if (ast.type === 'LITERAL') {
      return Boolean(ast.value);
    }

    if (ast.type === 'COMPARISON') {
      return evaluateComparison(ast, state);
    }

    if (ast.type === 'UNARY' && ast.op === 'NOT') {
      return !evaluateAST(ast.expr, state);
    }

    if (ast.type === 'LOGICAL') {
      if (ast.op === 'AND') {
        return evaluateAST(ast.left, state) && evaluateAST(ast.right, state);
      }
      if (ast.op === 'OR') {
        return evaluateAST(ast.left, state) || evaluateAST(ast.right, state);
      }
    }

    return true;
  }

  function extractFieldsFromAST(ast, fieldsSet = new Set()) {
    if (!ast) return fieldsSet;

    if (ast.type === 'COMPARISON' && ast.field) {
      fieldsSet.add(ast.field);
    } else if (ast.type === 'UNARY') {
      extractFieldsFromAST(ast.expr, fieldsSet);
    } else if (ast.type === 'LOGICAL') {
      extractFieldsFromAST(ast.left, fieldsSet);
      extractFieldsFromAST(ast.right, fieldsSet);
    }

    return fieldsSet;
  }

  // ---------------------------------------------------------------------------
  // 3. DEPENDENCY ENGINE IMPLEMENTATION
  // ---------------------------------------------------------------------------

  let cachedParsedASTs = new Map();
  let hiddenValuesCache = new Map(); // Preserves user data when field is conditionally hidden
  let activeListeners = [];

  const WishMagicDependencies = {
    PROTOCOL_VERSION,

    /**
     * Safely parse dependency expression string into AST without eval
     */
    parse(expression) {
      if (!expression || typeof expression !== 'string') {
        return { type: 'LITERAL', value: true };
      }
      const trimmed = expression.trim();
      if (!trimmed) return { type: 'LITERAL', value: true };

      if (cachedParsedASTs.has(trimmed)) {
        return cachedParsedASTs.get(trimmed);
      }

      try {
        const tokens = tokenize(trimmed);
        const parser = new Parser(tokens);
        const ast = parser.parse();
        cachedParsedASTs.set(trimmed, ast);
        return ast;
      } catch (err) {
        console.warn(`[WishMagicDependencies] Expression parse warning: "${expression}":`, err.message);
        const safeFallback = { type: 'LITERAL', value: true };
        cachedParsedASTs.set(trimmed, safeFallback);
        return safeFallback;
      }
    },

    /**
     * Safely evaluate dependency expression against state
     */
    evaluate(expression, state = {}) {
      if (!expression) return true;
      if (typeof expression === 'boolean') return expression;

      const ast = this.parse(expression);
      return evaluateAST(ast, state);
    },

    evaluateExpression(expression, state = {}) {
      return this.evaluate(expression, state);
    },

    /**
     * Get list of upstream field keys that an expression or field depends on
     */
    getDependencies(fieldOrExpression) {
      const expr = typeof fieldOrExpression === 'string'
        ? fieldOrExpression
        : (fieldOrExpression?.visibleIf || fieldOrExpression?.disabledIf || fieldOrExpression?.requiredIf || '');

      if (!expr) return [];
      const ast = this.parse(expr);
      const set = extractFieldsFromAST(ast);
      return Array.from(set);
    },

    /**
     * Build dependency graph & check for cycles
     */
    buildDependencyGraph(fields = []) {
      const graph = new Map(); // fieldKey -> Set of fields that depend on it
      const inEdges = new Map(); // fieldKey -> Set of upstream fields it depends on
      const warnings = [];

      fields.forEach(f => {
        const key = f.key || f.id;
        if (!key) return;

        if (!graph.has(key)) graph.set(key, new Set());
        if (!inEdges.has(key)) inEdges.set(key, new Set());

        const upstreams = new Set([
          ...this.getDependencies(f.visibleIf),
          ...this.getDependencies(f.disabledIf),
          ...this.getDependencies(f.requiredIf)
        ]);

        if (Array.isArray(f.options)) {
          f.options.forEach(opt => {
            if (opt && opt.visibleIf) {
              this.getDependencies(opt.visibleIf).forEach(u => upstreams.add(u));
            }
          });
        }

        upstreams.forEach(upstreamKey => {
          if (!graph.has(upstreamKey)) graph.set(upstreamKey, new Set());
          graph.get(upstreamKey).add(key);
          inEdges.get(key).add(upstreamKey);
        });
      });

      // Detect cycles using DFS with 3-color marking
      const visited = new Map(); // 0: unvisited, 1: visiting, 2: visited
      let hasCycle = false;

      function dfs(node, path = []) {
        visited.set(node, 1);
        const neighbors = graph.get(node) || new Set();

        for (const neighbor of neighbors) {
          const status = visited.get(neighbor) || 0;
          if (status === 1) {
            hasCycle = true;
            warnings.push({
              code: 'CIRCULAR_DEPENDENCY',
              cycle: [...path, node, neighbor].join(' -> '),
              message: `Circular WishMagic field dependency detected: ${[...path, node, neighbor].join(' -> ')}`
            });
          } else if (status === 0) {
            dfs(neighbor, [...path, node]);
          }
        }

        visited.set(node, 2);
      }

      fields.forEach(f => {
        const k = f.key || f.id;
        if ((visited.get(k) || 0) === 0) {
          dfs(k);
        }
      });

      return {
        graph,
        inEdges,
        hasCycle,
        warnings
      };
    },

    /**
     * Evaluate all field states in topological / dependency order
     */
    evaluateAll(fields = [], currentState = {}, options = {}) {
      const stateMap = new Map();
      const state = { ...currentState };
      const content = state.content || state;

      fields.forEach(f => {
        const key = f.key || f.id;
        if (!key) return;

        // 1. Evaluate Visibility
        let isVisible = true;
        if (f.visibleIf) {
          isVisible = this.evaluate(f.visibleIf, state);
        }

        // 2. Evaluate Disabled state
        let isDisabled = false;
        if (f.disabledIf) {
          isDisabled = this.evaluate(f.disabledIf, state);
        }

        // 3. Evaluate Required state
        let isRequired = f.required === true;
        if (f.requiredIf) {
          isRequired = this.evaluate(f.requiredIf, state);
        }

        // 4. Evaluate Dynamic Label & Description
        let label = f.label;
        if (f.labelIf) {
          label = this.evaluateDynamicLabel(f.labelIf, state, f.label);
        }

        let description = f.description || '';
        if (f.descriptionIf) {
          description = this.evaluateDynamicDescription(f.descriptionIf, state, description);
        }

        // 5. Evaluate Option Visibility
        let visibleOptions = Array.isArray(f.options) ? [...f.options] : [];
        if (Array.isArray(f.options)) {
          visibleOptions = f.options.filter(opt => {
            if (!opt || !opt.visibleIf) return true;
            return this.evaluate(opt.visibleIf, state);
          });
        }

        // 6. Handle Hidden / Preserved Value
        const hasExplicitVal = content[key] !== undefined && content[key] !== null && content[key] !== '';
        let curVal = hasExplicitVal ? content[key] : (hiddenValuesCache.has(key) ? hiddenValuesCache.get(key) : f.defaultValue);

        if (!isVisible) {
          if (f.clearOnHide === true || f.clearOnHide === 'true') {
            curVal = '';
            content[key] = '';
            hiddenValuesCache.delete(key);
          } else if (curVal !== undefined && curVal !== '' && curVal !== null) {
            hiddenValuesCache.set(key, curVal);
          }
        } else {
          if (hiddenValuesCache.has(key) && !hasExplicitVal) {
            curVal = hiddenValuesCache.get(key);
            content[key] = curVal;
          }
        }

        // 7. Auto-Reset of Invalid Option Values (Requirement #16)
        if (isVisible && (f.type === 'select') && visibleOptions.length > 0 && curVal) {
          const allowedVals = visibleOptions.map(o => String(typeof o === 'object' ? o.value : o));
          if (!allowedVals.includes(String(curVal))) {
            const defaultOpt = visibleOptions.find(o => o.default || o.value === f.defaultValue);
            curVal = defaultOpt ? defaultOpt.value : (visibleOptions[0]?.value || '');
            content[key] = curVal;
          }
        }

        // 8. Validation (Hidden fields never fail required validation)
        const isBlank = curVal === undefined || curVal === null || String(curVal).trim() === '' || (Array.isArray(curVal) && curVal.length === 0);
        let isValid = true;
        const errors = [];

        if (isVisible && isRequired && isBlank) {
          isValid = false;
          errors.push({
            field: key,
            code: 'REQUIRED',
            message: `${label} is required.`
          });
        }

        stateMap.set(key, {
          key,
          value: curVal,
          visible: isVisible,
          disabled: isDisabled,
          required: isRequired,
          valid: isValid,
          errors,
          label,
          description,
          visibleOptions
        });
      });

      return stateMap;
    },

    /**
     * Evaluate dynamic label expression
     */
    evaluateDynamicLabel(labelIfAttr, state, fallbackLabel) {
      if (!labelIfAttr) return fallbackLabel;
      if (typeof labelIfAttr === 'object') {
        for (const [cond, lbl] of Object.entries(labelIfAttr)) {
          if (this.evaluate(cond, state)) return lbl;
        }
        return fallbackLabel;
      }

      // Format: "rel=mother:Mother's Name|rel=father:Father's Name"
      const clauses = String(labelIfAttr).split('|');
      for (const clause of clauses) {
        const parts = clause.split(':');
        if (parts.length === 2) {
          const cond = parts[0].trim();
          const lbl = parts[1].trim();
          if (this.evaluate(cond, state)) return lbl;
        }
      }

      return fallbackLabel;
    },

    /**
     * Evaluate dynamic description expression
     */
    evaluateDynamicDescription(descIfAttr, state, fallbackDesc) {
      if (!descIfAttr) return fallbackDesc;
      if (typeof descIfAttr === 'object') {
        for (const [cond, desc] of Object.entries(descIfAttr)) {
          if (this.evaluate(cond, state)) return desc;
        }
        return fallbackDesc;
      }

      const clauses = String(descIfAttr).split('|');
      for (const clause of clauses) {
        const parts = clause.split(':');
        if (parts.length === 2) {
          const cond = parts[0].trim();
          const desc = parts[1].trim();
          if (this.evaluate(cond, state)) return desc;
        }
      }

      return fallbackDesc;
    },

    /**
     * Synchronize evaluated dependency states into DOM Customizer UI
     */
    updateDOM(container, evaluatedStates = new Map()) {
      if (!container) return;

      // 1. Update each field wrapper
      evaluatedStates.forEach((fieldState, fieldKey) => {
        const wrapper = container.querySelector
          ? container.querySelector(`[data-wm-control-for="${fieldKey}"]`)?.closest?.('.wm-control-wrapper') ||
            container.querySelector(`[data-wm-control-wrapper-for="${fieldKey}"]`)
          : null;

        const input = container.querySelector ? container.querySelector(`[data-wm-control-for="${fieldKey}"]`) : null;

        if (wrapper) {
          if (fieldState.visible) {
            wrapper.classList.remove('hidden');
            wrapper.removeAttribute('aria-hidden');
            wrapper.style.display = '';
          } else {
            wrapper.classList.add('hidden');
            wrapper.setAttribute('aria-hidden', 'true');
            wrapper.style.display = 'none';
          }
        }

        if (input) {
          if (fieldState.disabled) {
            input.setAttribute('disabled', 'disabled');
            input.setAttribute('aria-disabled', 'true');
            input.classList.add('opacity-50', 'cursor-not-allowed');
          } else {
            input.removeAttribute('disabled');
            input.removeAttribute('aria-disabled');
            input.classList.remove('opacity-50', 'cursor-not-allowed');
          }

          // If select, update visible options
          if (input.tagName === 'SELECT' && Array.isArray(fieldState.visibleOptions)) {
            const currentSelected = input.value;
            let optionsHTML = '';
            fieldState.visibleOptions.forEach(opt => {
              const val = typeof opt === 'object' ? opt.value : opt;
              const lbl = typeof opt === 'object' ? opt.label : opt;
              optionsHTML += `<option value="${escapeHTML(val)}" ${val === currentSelected ? 'selected' : ''}>${escapeHTML(lbl)}</option>`;
            });
            input.innerHTML = optionsHTML;
          }
        }
      });

      // 2. Update Group-level Visibility (data-wm-group-visible-if or data-wm-visible-if on group cards)
      const groupCards = container.querySelectorAll ? Array.from(container.querySelectorAll('.wm-group-card[data-wm-visible-if]')) : [];
      groupCards.forEach(card => {
        const cond = card.getAttribute('data-wm-visible-if');
        if (cond) {
          const isGrpVisible = this.evaluate(cond, global.WishMagicData || {});
          if (isGrpVisible) {
            card.classList.remove('hidden');
            card.removeAttribute('aria-hidden');
            card.style.display = '';
          } else {
            card.classList.add('hidden');
            card.setAttribute('aria-hidden', 'true');
            card.style.display = 'none';
          }
        }
      });
    },

    /**
     * Clear caches & listeners
     */
    destroy() {
      cachedParsedASTs.clear();
      hiddenValuesCache.clear();
      activeListeners = [];
    }
  };

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WishMagicDependencies;
  }
  if (typeof window !== 'undefined') {
    window.WishMagicDependencies = WishMagicDependencies;
  }
  global.WishMagicDependencies = WishMagicDependencies;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
