(function(global) {
  "use strict";
  const PROTOCOL_VERSION = "1.0";
  const TokenType = {
    LPAREN: "LPAREN",
    RPAREN: "RPAREN",
    AND: "AND",
    OR: "OR",
    NOT: "NOT",
    OP: "OP",
    IDENT: "IDENT",
    LITERAL: "LITERAL",
    EOF: "EOF"
  };
  const OPERATOR_SET = /* @__PURE__ */ new Set([
    "=",
    "==",
    "!=",
    "<=",
    ">=",
    "<",
    ">",
    "contains",
    "not_contains",
    "in",
    "not_in",
    "exists",
    "not_exists",
    "truthy",
    "falsy"
  ]);
  function tokenize(input) {
    const tokens = [];
    let i = 0;
    const str = String(input || "").trim();
    while (i < str.length) {
      const ch = str[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (ch === "(") {
        tokens.push({ type: TokenType.LPAREN, value: "(" });
        i++;
        continue;
      }
      if (ch === ")") {
        tokens.push({ type: TokenType.RPAREN, value: ")" });
        i++;
        continue;
      }
      if (str.startsWith("!=", i)) {
        tokens.push({ type: TokenType.OP, value: "!=" });
        i += 2;
        continue;
      }
      if (str.startsWith("==", i)) {
        tokens.push({ type: TokenType.OP, value: "==" });
        i += 2;
        continue;
      }
      if (str.startsWith("<=", i)) {
        tokens.push({ type: TokenType.OP, value: "<=" });
        i += 2;
        continue;
      }
      if (str.startsWith(">=", i)) {
        tokens.push({ type: TokenType.OP, value: ">=" });
        i += 2;
        continue;
      }
      if (str.startsWith("&&", i)) {
        tokens.push({ type: TokenType.AND, value: "AND" });
        i += 2;
        continue;
      }
      if (str.startsWith("||", i)) {
        tokens.push({ type: TokenType.OR, value: "OR" });
        i += 2;
        continue;
      }
      if (ch === "=" || ch === "<" || ch === ">") {
        tokens.push({ type: TokenType.OP, value: ch });
        i++;
        continue;
      }
      if (ch === "!") {
        tokens.push({ type: TokenType.NOT, value: "NOT" });
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        const quote = ch;
        i++;
        let lit = "";
        while (i < str.length && str[i] !== quote) {
          if (str[i] === "\\" && i + 1 < str.length) {
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
      let word = "";
      while (i < str.length && !/\s|[()=!<>]/.test(str[i])) {
        word += str[i];
        i++;
      }
      const upper = word.toUpperCase();
      if (upper === "AND") {
        tokens.push({ type: TokenType.AND, value: "AND" });
      } else if (upper === "OR") {
        tokens.push({ type: TokenType.OR, value: "OR" });
      } else if (upper === "NOT") {
        tokens.push({ type: TokenType.NOT, value: "NOT" });
      } else if (OPERATOR_SET.has(word.toLowerCase())) {
        tokens.push({ type: TokenType.OP, value: word.toLowerCase() });
      } else if (word === "true") {
        tokens.push({ type: TokenType.LITERAL, value: true });
      } else if (word === "false") {
        tokens.push({ type: TokenType.LITERAL, value: false });
      } else if (word === "null") {
        tokens.push({ type: TokenType.LITERAL, value: null });
      } else if (!Number.isNaN(Number(word)) && word !== "") {
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
        return { type: "LITERAL", value: true };
      }
      const ast = this.parseOr();
      return ast;
    }
    parseOr() {
      let left = this.parseAnd();
      while (this.peek().type === TokenType.OR) {
        this.consume(TokenType.OR);
        const right = this.parseAnd();
        left = { type: "LOGICAL", op: "OR", left, right };
      }
      return left;
    }
    parseAnd() {
      let left = this.parseUnary();
      while (this.peek().type === TokenType.AND) {
        this.consume(TokenType.AND);
        const right = this.parseUnary();
        left = { type: "LOGICAL", op: "AND", left, right };
      }
      return left;
    }
    parseUnary() {
      if (this.peek().type === TokenType.NOT) {
        this.consume(TokenType.NOT);
        const expr = this.parseUnary();
        return { type: "UNARY", op: "NOT", expr };
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
        if (next.type === TokenType.OP && (next.value === "exists" || next.value === "not_exists" || next.value === "truthy" || next.value === "falsy")) {
          const op = this.consume(TokenType.OP).value;
          return { type: "COMPARISON", field: ident, op, value: null };
        }
        if (next.type === TokenType.OP) {
          const op = this.consume(TokenType.OP).value;
          const valToken = this.peek();
          let value = null;
          if (valToken.type === TokenType.LITERAL || valToken.type === TokenType.IDENT) {
            value = this.consume().value;
          } else {
            value = "";
          }
          return { type: "COMPARISON", field: ident, op, value };
        }
        return { type: "COMPARISON", field: ident, op: "truthy", value: null };
      }
      if (cur.type === TokenType.LITERAL) {
        return { type: "LITERAL", value: this.consume(TokenType.LITERAL).value };
      }
      throw new Error(`Unexpected token in expression: ${cur.type} ("${cur.value}")`);
    }
  }
  function resolveStateValue(fieldKey, state) {
    if (!state || !fieldKey) return void 0;
    if (state[fieldKey] !== void 0) return state[fieldKey];
    if (state.content && state.content[fieldKey] !== void 0) {
      return state.content[fieldKey];
    }
    if (fieldKey.includes(".")) {
      const parts = fieldKey.split(".");
      let cur = state;
      for (const p of parts) {
        if (cur === null || cur === void 0 || typeof cur !== "object") {
          cur = void 0;
          break;
        }
        cur = cur[p];
      }
      if (cur !== void 0) return cur;
    }
    if (typeof global !== "undefined" && global.WishMagicData) {
      const gData = global.WishMagicData;
      if (gData[fieldKey] !== void 0) return gData[fieldKey];
      if (gData.content && gData.content[fieldKey] !== void 0) return gData.content[fieldKey];
      if (gData.sections && gData.sections[fieldKey] !== void 0) {
        const sec = gData.sections[fieldKey];
        return typeof sec === "boolean" ? sec : sec?.enabled;
      }
    }
    return void 0;
  }
  function evaluateComparison(ast, state) {
    const rawVal = resolveStateValue(ast.field, state);
    const op = (ast.op || "=").toLowerCase();
    const target = ast.value;
    switch (op) {
      case "=":
      case "==":
        if (target === true || target === "true") return rawVal === true || rawVal === "true" || rawVal === 1;
        if (target === false || target === "false") return rawVal === false || rawVal === "false" || rawVal === 0 || rawVal === void 0 || rawVal === null;
        if (target === null || target === "null") return rawVal === null || rawVal === void 0 || rawVal === "";
        return String(rawVal !== void 0 && rawVal !== null ? rawVal : "").trim().toLowerCase() === String(target).trim().toLowerCase();
      case "!=":
        if (target === true || target === "true") return !(rawVal === true || rawVal === "true" || rawVal === 1);
        if (target === false || target === "false") return !(rawVal === false || rawVal === "false" || rawVal === 0 || rawVal === void 0 || rawVal === null);
        return String(rawVal !== void 0 && rawVal !== null ? rawVal : "").trim().toLowerCase() !== String(target).trim().toLowerCase();
      case ">":
        return Number(rawVal) > Number(target);
      case "<":
        return Number(rawVal) < Number(target);
      case ">=":
        return Number(rawVal) >= Number(target);
      case "<=":
        return Number(rawVal) <= Number(target);
      case "contains":
        if (Array.isArray(rawVal)) {
          return rawVal.some((item) => String(item).toLowerCase() === String(target).toLowerCase());
        }
        return String(rawVal || "").toLowerCase().includes(String(target || "").toLowerCase());
      case "not_contains":
        if (Array.isArray(rawVal)) {
          return !rawVal.some((item) => String(item).toLowerCase() === String(target).toLowerCase());
        }
        return !String(rawVal || "").toLowerCase().includes(String(target || "").toLowerCase());
      case "in": {
        const allowed = Array.isArray(target) ? target.map(String) : String(target || "").split(",").map((s) => s.trim().toLowerCase());
        return allowed.includes(String(rawVal || "").trim().toLowerCase());
      }
      case "not_in": {
        const disallowed = Array.isArray(target) ? target.map(String) : String(target || "").split(",").map((s) => s.trim().toLowerCase());
        return !disallowed.includes(String(rawVal || "").trim().toLowerCase());
      }
      case "exists":
        return rawVal !== void 0 && rawVal !== null && rawVal !== "";
      case "not_exists":
        return rawVal === void 0 || rawVal === null || rawVal === "";
      case "truthy":
        return Boolean(rawVal) && rawVal !== "false" && rawVal !== "0" && rawVal !== 0;
      case "falsy":
        return !rawVal || rawVal === "false" || rawVal === "0" || rawVal === 0;
      default:
        return false;
    }
  }
  function evaluateAST(ast, state) {
    if (!ast) return true;
    if (ast.type === "LITERAL") {
      return Boolean(ast.value);
    }
    if (ast.type === "COMPARISON") {
      return evaluateComparison(ast, state);
    }
    if (ast.type === "UNARY" && ast.op === "NOT") {
      return !evaluateAST(ast.expr, state);
    }
    if (ast.type === "LOGICAL") {
      if (ast.op === "AND") {
        return evaluateAST(ast.left, state) && evaluateAST(ast.right, state);
      }
      if (ast.op === "OR") {
        return evaluateAST(ast.left, state) || evaluateAST(ast.right, state);
      }
    }
    return true;
  }
  function extractFieldsFromAST(ast, fieldsSet = /* @__PURE__ */ new Set()) {
    if (!ast) return fieldsSet;
    if (ast.type === "COMPARISON" && ast.field) {
      fieldsSet.add(ast.field);
    } else if (ast.type === "UNARY") {
      extractFieldsFromAST(ast.expr, fieldsSet);
    } else if (ast.type === "LOGICAL") {
      extractFieldsFromAST(ast.left, fieldsSet);
      extractFieldsFromAST(ast.right, fieldsSet);
    }
    return fieldsSet;
  }
  let cachedParsedASTs = /* @__PURE__ */ new Map();
  let hiddenValuesCache = /* @__PURE__ */ new Map();
  let activeListeners = [];
  const WishMagicDependencies = {
    PROTOCOL_VERSION,
    /**
     * Safely parse dependency expression string into AST without eval
     */
    parse(expression) {
      if (!expression || typeof expression !== "string") {
        return { type: "LITERAL", value: true };
      }
      const trimmed = expression.trim();
      if (!trimmed) return { type: "LITERAL", value: true };
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
        const safeFallback = { type: "LITERAL", value: true };
        cachedParsedASTs.set(trimmed, safeFallback);
        return safeFallback;
      }
    },
    /**
     * Safely evaluate dependency expression against state
     */
    evaluate(expression, state = {}) {
      if (!expression) return true;
      if (typeof expression === "boolean") return expression;
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
      const expr = typeof fieldOrExpression === "string" ? fieldOrExpression : fieldOrExpression?.visibleIf || fieldOrExpression?.disabledIf || fieldOrExpression?.requiredIf || "";
      if (!expr) return [];
      const ast = this.parse(expr);
      const set = extractFieldsFromAST(ast);
      return Array.from(set);
    },
    /**
     * Build dependency graph & check for cycles
     */
    buildDependencyGraph(fields = []) {
      const graph = /* @__PURE__ */ new Map();
      const inEdges = /* @__PURE__ */ new Map();
      const warnings = [];
      fields.forEach((f) => {
        const key = f.key || f.id;
        if (!key) return;
        if (!graph.has(key)) graph.set(key, /* @__PURE__ */ new Set());
        if (!inEdges.has(key)) inEdges.set(key, /* @__PURE__ */ new Set());
        const upstreams = /* @__PURE__ */ new Set([
          ...this.getDependencies(f.visibleIf),
          ...this.getDependencies(f.disabledIf),
          ...this.getDependencies(f.requiredIf)
        ]);
        if (Array.isArray(f.options)) {
          f.options.forEach((opt) => {
            if (opt && opt.visibleIf) {
              this.getDependencies(opt.visibleIf).forEach((u) => upstreams.add(u));
            }
          });
        }
        upstreams.forEach((upstreamKey) => {
          if (!graph.has(upstreamKey)) graph.set(upstreamKey, /* @__PURE__ */ new Set());
          graph.get(upstreamKey).add(key);
          inEdges.get(key).add(upstreamKey);
        });
      });
      const visited = /* @__PURE__ */ new Map();
      let hasCycle = false;
      function dfs(node, path = []) {
        visited.set(node, 1);
        const neighbors = graph.get(node) || /* @__PURE__ */ new Set();
        for (const neighbor of neighbors) {
          const status = visited.get(neighbor) || 0;
          if (status === 1) {
            hasCycle = true;
            warnings.push({
              code: "CIRCULAR_DEPENDENCY",
              cycle: [...path, node, neighbor].join(" -> "),
              message: `Circular WishMagic field dependency detected: ${[...path, node, neighbor].join(" -> ")}`
            });
          } else if (status === 0) {
            dfs(neighbor, [...path, node]);
          }
        }
        visited.set(node, 2);
      }
      fields.forEach((f) => {
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
      const stateMap = /* @__PURE__ */ new Map();
      const state = { ...currentState };
      const content = state.content || state;
      fields.forEach((f) => {
        const key = f.key || f.id;
        if (!key) return;
        let isVisible = true;
        if (f.visibleIf) {
          isVisible = this.evaluate(f.visibleIf, state);
        }
        let isDisabled = false;
        if (f.disabledIf) {
          isDisabled = this.evaluate(f.disabledIf, state);
        }
        let isRequired = f.required === true;
        if (f.requiredIf) {
          isRequired = this.evaluate(f.requiredIf, state);
        }
        let label = f.label;
        if (f.labelIf) {
          label = this.evaluateDynamicLabel(f.labelIf, state, f.label);
        }
        let description = f.description || "";
        if (f.descriptionIf) {
          description = this.evaluateDynamicDescription(f.descriptionIf, state, description);
        }
        let visibleOptions = Array.isArray(f.options) ? [...f.options] : [];
        if (Array.isArray(f.options)) {
          visibleOptions = f.options.filter((opt) => {
            if (!opt || !opt.visibleIf) return true;
            return this.evaluate(opt.visibleIf, state);
          });
        }
        const hasExplicitVal = content[key] !== void 0 && content[key] !== null && content[key] !== "";
        let curVal = hasExplicitVal ? content[key] : hiddenValuesCache.has(key) ? hiddenValuesCache.get(key) : f.defaultValue;
        if (!isVisible) {
          if (f.clearOnHide === true || f.clearOnHide === "true") {
            curVal = "";
            content[key] = "";
            hiddenValuesCache.delete(key);
          } else if (curVal !== void 0 && curVal !== "" && curVal !== null) {
            hiddenValuesCache.set(key, curVal);
          }
        } else {
          if (hiddenValuesCache.has(key) && !hasExplicitVal) {
            curVal = hiddenValuesCache.get(key);
            content[key] = curVal;
          }
        }
        if (isVisible && f.type === "select" && visibleOptions.length > 0 && curVal) {
          const allowedVals = visibleOptions.map((o) => String(typeof o === "object" ? o.value : o));
          if (!allowedVals.includes(String(curVal))) {
            const defaultOpt = visibleOptions.find((o) => o.default || o.value === f.defaultValue);
            curVal = defaultOpt ? defaultOpt.value : visibleOptions[0]?.value || "";
            content[key] = curVal;
          }
        }
        const isBlank = curVal === void 0 || curVal === null || String(curVal).trim() === "" || Array.isArray(curVal) && curVal.length === 0;
        let isValid = true;
        const errors = [];
        if (isVisible && isRequired && isBlank) {
          isValid = false;
          errors.push({
            field: key,
            code: "REQUIRED",
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
      if (typeof labelIfAttr === "object") {
        for (const [cond, lbl] of Object.entries(labelIfAttr)) {
          if (this.evaluate(cond, state)) return lbl;
        }
        return fallbackLabel;
      }
      const clauses = String(labelIfAttr).split("|");
      for (const clause of clauses) {
        const parts = clause.split(":");
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
      if (typeof descIfAttr === "object") {
        for (const [cond, desc] of Object.entries(descIfAttr)) {
          if (this.evaluate(cond, state)) return desc;
        }
        return fallbackDesc;
      }
      const clauses = String(descIfAttr).split("|");
      for (const clause of clauses) {
        const parts = clause.split(":");
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
    updateDOM(container, evaluatedStates = /* @__PURE__ */ new Map()) {
      if (!container) return;
      evaluatedStates.forEach((fieldState, fieldKey) => {
        const wrapper = container.querySelector ? container.querySelector(`[data-wm-control-for="${fieldKey}"]`)?.closest?.(".wm-control-wrapper") || container.querySelector(`[data-wm-control-wrapper-for="${fieldKey}"]`) : null;
        const input = container.querySelector ? container.querySelector(`[data-wm-control-for="${fieldKey}"]`) : null;
        if (wrapper) {
          if (fieldState.visible) {
            wrapper.classList.remove("hidden");
            wrapper.removeAttribute("aria-hidden");
            wrapper.style.display = "";
          } else {
            wrapper.classList.add("hidden");
            wrapper.setAttribute("aria-hidden", "true");
            wrapper.style.display = "none";
          }
        }
        if (input) {
          if (fieldState.disabled) {
            input.setAttribute("disabled", "disabled");
            input.setAttribute("aria-disabled", "true");
            input.classList.add("opacity-50", "cursor-not-allowed");
          } else {
            input.removeAttribute("disabled");
            input.removeAttribute("aria-disabled");
            input.classList.remove("opacity-50", "cursor-not-allowed");
          }
          if (input.tagName === "SELECT" && Array.isArray(fieldState.visibleOptions)) {
            const currentSelected = input.value;
            let optionsHTML = "";
            fieldState.visibleOptions.forEach((opt) => {
              const val = typeof opt === "object" ? opt.value : opt;
              const lbl = typeof opt === "object" ? opt.label : opt;
              optionsHTML += `<option value="${escapeHTML(val)}" ${val === currentSelected ? "selected" : ""}>${escapeHTML(lbl)}</option>`;
            });
            input.innerHTML = optionsHTML;
          }
        }
      });
      const groupCards = container.querySelectorAll ? Array.from(container.querySelectorAll(".wm-group-card[data-wm-visible-if]")) : [];
      groupCards.forEach((card) => {
        const cond = card.getAttribute("data-wm-visible-if");
        if (cond) {
          const isGrpVisible = this.evaluate(cond, global.WishMagicData || {});
          if (isGrpVisible) {
            card.classList.remove("hidden");
            card.removeAttribute("aria-hidden");
            card.style.display = "";
          } else {
            card.classList.add("hidden");
            card.setAttribute("aria-hidden", "true");
            card.style.display = "none";
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
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = WishMagicDependencies;
  }
  if (typeof window !== "undefined") {
    window.WishMagicDependencies = WishMagicDependencies;
  }
  global.WishMagicDependencies = WishMagicDependencies;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
