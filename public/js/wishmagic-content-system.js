(function(global) {
  "use strict";
  const PROTOCOL_VERSION = "1.0";
  const SUPPORTED_FIELD_TYPES = /* @__PURE__ */ new Set([
    "text",
    "textarea",
    "date",
    "time",
    "datetime",
    "number",
    "email",
    "phone",
    "url",
    "color",
    "select",
    "multiselect",
    "toggle",
    "range",
    "image",
    "image-multiple",
    "video",
    "video-multiple",
    "audio",
    "voice",
    "font",
    "icon"
  ]);
  const STANDARD_PERSONALIZATION_KEYS = /* @__PURE__ */ new Set([
    "recipient_name",
    "sender_name",
    "occasion",
    "relationship",
    "event_date",
    "event_time",
    "timezone",
    "custom_message"
  ]);
  const MONTHS_FULL = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  const MONTHS_SHORT = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];
  function parseBool(val, fallback = false) {
    if (val === null || val === void 0) return fallback;
    const s = String(val).trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no") return false;
    return fallback;
  }
  function parseOptionsList(optionsAttr) {
    if (!optionsAttr) return [];
    const trimmed = String(optionsAttr).trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((opt) => {
            if (typeof opt === "string") {
              return { value: opt, label: opt.charAt(0).toUpperCase() + opt.slice(1).replace(/_/g, " ") };
            }
            if (opt && typeof opt === "object") {
              return {
                value: String(opt.value || opt.key || opt.id || ""),
                label: String(opt.label || opt.name || opt.value || "")
              };
            }
            return { value: String(opt), label: String(opt) };
          });
        }
      } catch (e) {
      }
    }
    return trimmed.split(",").map((s) => s.trim()).filter(Boolean).map((item) => ({
      value: item,
      label: item.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
    }));
  }
  function formatDateString(val, formatStr) {
    if (!val || typeof val !== "string") return val || "";
    const cleanDate = val.trim().split("T")[0];
    const parts = cleanDate.split("-");
    if (parts.length !== 3) return val;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
      return val;
    }
    const fmt = (formatStr || "YYYY-MM-DD").trim();
    const monthName = MONTHS_FULL[month - 1] || "";
    const monthShort = MONTHS_SHORT[month - 1] || "";
    const dayStr = String(day).padStart(2, "0");
    const monthStr = String(month).padStart(2, "0");
    const yearStr = String(year);
    switch (fmt) {
      case "DD MMMM YYYY":
        return `${day} ${monthName} ${year}`;
      case "DD MMM YYYY":
        return `${day} ${monthShort} ${year}`;
      case "MMMM DD, YYYY":
        return `${monthName} ${day}, ${year}`;
      case "MMM DD, YYYY":
        return `${monthShort} ${day}, ${year}`;
      case "DD/MM/YYYY":
        return `${dayStr}/${monthStr}/${yearStr}`;
      case "MM/DD/YYYY":
        return `${monthStr}/${dayStr}/${yearStr}`;
      case "YYYY-MM-DD":
        return `${yearStr}-${monthStr}-${dayStr}`;
      default: {
        let result = fmt;
        result = result.replace(/YYYY/g, yearStr);
        result = result.replace(/MMMM/g, monthName);
        result = result.replace(/MMM/g, monthShort);
        result = result.replace(/MM/g, monthStr);
        result = result.replace(/DD/g, dayStr);
        result = result.replace(/D/g, String(day));
        return result;
      }
    }
  }
  function setElementTextSafe(el, text, targetAttr = "text") {
    if (!el) return;
    const strVal = text !== void 0 && text !== null ? String(text) : "";
    if (targetAttr && targetAttr.startsWith("attr:")) {
      const attrName = targetAttr.slice(5).trim();
      if (attrName) {
        el.setAttribute(attrName, strVal);
      }
      return;
    }
    if (targetAttr === "value" && "value" in el) {
      if (el.tagName === "INPUT" && el.type === "file") return;
      try {
        el.value = strVal;
      } catch (_) {
      }
      return;
    }
    el.textContent = strVal;
  }
  function evaluateVisibleIf(conditionStr, state) {
    if (!conditionStr || typeof conditionStr !== "string") return true;
    const cond = conditionStr.trim();
    if (!cond) return true;
    if (cond.startsWith("!")) {
      const fieldKey = cond.slice(1).trim();
      const val = state[fieldKey];
      return !val || val === "false" || val === false;
    }
    if (cond.includes("!=")) {
      const [fieldKey, targetVal] = cond.split("!=").map((s) => s.trim());
      const curVal2 = state[fieldKey];
      const normTarget = targetVal === "true" ? true : targetVal === "false" ? false : targetVal;
      return String(curVal2) !== String(normTarget);
    }
    if (cond.includes("=")) {
      const parts = cond.split("=").filter(Boolean);
      if (parts.length >= 2) {
        const fieldKey = parts[0].trim();
        const targetVal = parts[1].trim();
        const curVal2 = state[fieldKey];
        if (targetVal === "true") return curVal2 === true || curVal2 === "true";
        if (targetVal === "false") return curVal2 === false || curVal2 === "false";
        return String(curVal2).trim().toLowerCase() === targetVal.toLowerCase();
      }
    }
    const curVal = state[cond];
    return Boolean(curVal) && curVal !== "false" && curVal !== 0;
  }
  let currentSchema = null;
  let currentContent = {};
  let defaultContent = {};
  let initialTokenTemplates = /* @__PURE__ */ new Map();
  let changeListeners = [];
  let previewBridge = null;
  let activeDocument = null;
  const WishMagicContent = {
    PROTOCOL_VERSION,
    /**
     * Scan template document and extract declarative content schema
     * @param {Document|Element} rootDoc
     * @returns {Object} Normalized content schema
     */
    scan(rootDoc) {
      const doc = rootDoc || activeDocument || (typeof document !== "undefined" ? document : null);
      if (doc) activeDocument = doc;
      if (!doc) {
        return {
          valid: false,
          fields: [],
          groups: [],
          standardFields: [],
          templateSpecificFields: [],
          warnings: [{ code: "NO_DOCUMENT", message: "No document available for content scan." }],
          errors: [{ code: "NO_DOCUMENT", message: "Cannot scan null document." }]
        };
      }
      const warnings = [];
      const errors = [];
      const fieldsMap = /* @__PURE__ */ new Map();
      const fieldsList = [];
      const rawElements = doc.querySelectorAll ? Array.from(doc.querySelectorAll("[data-wm-field], [data-wm]")) : [];
      rawElements.forEach((el) => {
        try {
          const isLegacy = !el.hasAttribute("data-wm-field") && el.hasAttribute("data-wm");
          const rawKey = el.getAttribute("data-wm-field") || el.getAttribute("data-wm");
          if (!rawKey) return;
          const fieldKey = rawKey.trim();
          if (!fieldKey) return;
          if (isLegacy) {
            warnings.push({
              code: "LEGACY_METADATA",
              field: fieldKey,
              message: `Field "${fieldKey}" uses legacy data-wm attribute. Upgrade to data-wm-field.`
            });
          }
          let rawType = el.getAttribute("data-wm-type");
          let fieldType = rawType ? rawType.trim().toLowerCase() : null;
          if (!fieldType) {
            if (el.tagName === "IMG") fieldType = "image";
            else if (el.tagName === "TEXTAREA") fieldType = "textarea";
            else if (el.tagName === "VIDEO") fieldType = "video";
            else if (el.tagName === "AUDIO") fieldType = "audio";
            else if (el.tagName === "INPUT") {
              const inType = (el.getAttribute("type") || "").toLowerCase();
              if (inType === "checkbox") fieldType = "toggle";
              else if (inType === "range") fieldType = "range";
              else if (inType === "date") fieldType = "date";
              else if (inType === "time") fieldType = "time";
              else if (inType === "datetime-local") fieldType = "datetime";
              else if (inType === "number") fieldType = "number";
              else if (inType === "color") fieldType = "color";
              else if (inType === "email") fieldType = "email";
              else if (inType === "tel") fieldType = "phone";
              else if (inType === "url") fieldType = "url";
              else fieldType = "text";
            } else if (el.tagName === "SELECT") {
              fieldType = el.hasAttribute("multiple") ? "multiselect" : "select";
            } else {
              fieldType = "text";
            }
            if (!isLegacy) {
              warnings.push({
                code: "FIELD_TYPE_INFERRED",
                field: fieldKey,
                message: `Field "${fieldKey}" is missing data-wm-type attribute. Inferred as "${fieldType}".`
              });
            }
          } else if (!SUPPORTED_FIELD_TYPES.has(fieldType)) {
            warnings.push({
              code: "UNSUPPORTED_FIELD_TYPE",
              field: fieldKey,
              value: rawType,
              message: `Unsupported WishMagic field type: ${rawType}`
            });
            return;
          }
          const rawRequired = el.getAttribute("data-wm-required");
          const isRequired = parseBool(rawRequired, false);
          const fieldLabel = el.getAttribute("data-wm-label") || fieldKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
          let defaultValue = el.getAttribute("data-wm-default");
          if (defaultValue === null || defaultValue === void 0) {
            if (el.tagName === "IMG") {
              defaultValue = el.getAttribute("src") || "";
            } else if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
              defaultValue = el.value || "";
            } else if (!el.children || el.children.length === 0) {
              const rawTxt = el.textContent ? el.textContent.trim() : "";
              if (rawTxt && !rawTxt.includes("{{")) {
                defaultValue = rawTxt;
              }
            }
          }
          const placeholder = el.getAttribute("data-wm-placeholder") || null;
          const description = el.getAttribute("data-wm-description") || null;
          const rawMax = el.getAttribute("data-wm-maxlength");
          let maxlength = null;
          if (rawMax !== null && rawMax !== "") {
            const parsedMax = parseInt(rawMax, 10);
            if (Number.isNaN(parsedMax) || parsedMax <= 0) {
              warnings.push({
                code: "INVALID_MAX_LENGTH",
                field: fieldKey,
                value: rawMax,
                message: `Invalid data-wm-maxlength "${rawMax}" on field "${fieldKey}".`
              });
            } else {
              maxlength = parsedMax;
            }
          }
          const rawMinLen = el.getAttribute("data-wm-minlength");
          let minlength = null;
          if (rawMinLen !== null && rawMinLen !== "") {
            const parsedMinLen = parseInt(rawMinLen, 10);
            if (Number.isNaN(parsedMinLen) || parsedMinLen < 0) {
              warnings.push({
                code: "INVALID_MIN_LENGTH",
                field: fieldKey,
                value: rawMinLen,
                message: `Invalid data-wm-minlength "${rawMinLen}" on field "${fieldKey}".`
              });
            } else {
              minlength = parsedMinLen;
            }
          }
          const rawNumMin = el.getAttribute("data-wm-min");
          const min = rawNumMin !== null && rawNumMin !== "" && !Number.isNaN(Number(rawNumMin)) ? Number(rawNumMin) : null;
          const rawNumMax = el.getAttribute("data-wm-max");
          const max = rawNumMax !== null && rawNumMax !== "" && !Number.isNaN(Number(rawNumMax)) ? Number(rawNumMax) : null;
          const rawStep = el.getAttribute("data-wm-step");
          const step = rawStep !== null && rawStep !== "" && !Number.isNaN(Number(rawStep)) ? Number(rawStep) : null;
          const pattern = el.getAttribute("data-wm-pattern") || null;
          const format = el.getAttribute("data-wm-format") || null;
          const target = el.getAttribute("data-wm-target") || "text";
          let group = el.getAttribute("data-wm-group");
          if (!group) {
            if (fieldType === "image" || fieldType === "image-multiple" || fieldType === "video" || fieldType === "video-multiple" || fieldType === "audio" || fieldType === "voice") {
              group = "media";
            } else if (fieldType === "color") {
              group = "appearance";
            } else if (fieldKey === "custom_message" || fieldKey.includes("message") || fieldKey.includes("letter")) {
              group = "message";
            } else if (fieldKey === "event_date" || fieldKey === "event_time" || fieldKey === "timezone") {
              group = "event";
            } else {
              group = "personal";
            }
          }
          const rawOrder = el.getAttribute("data-wm-order");
          const order = rawOrder !== null && rawOrder !== "" && !Number.isNaN(parseInt(rawOrder, 10)) ? parseInt(rawOrder, 10) : null;
          const visibleIf = el.getAttribute("data-wm-visible-if") || null;
          const disabledIf = el.getAttribute("data-wm-disabled-if") || null;
          const requiredIf = el.getAttribute("data-wm-required-if") || null;
          const labelIf = el.getAttribute("data-wm-label-if") || null;
          const descriptionIf = el.getAttribute("data-wm-description-if") || null;
          const clearOnHide = parseBool(el.getAttribute("data-wm-clear-on-hide"), false);
          const rawOptions = el.getAttribute("data-wm-options");
          const options = parseOptionsList(rawOptions);
          if ((fieldType === "select" || fieldType === "multiselect") && options.length === 0) {
            warnings.push({
              code: "SELECT_OPTIONS_MISSING",
              field: fieldKey,
              message: `Select field "${fieldKey}" has no declared options.`
            });
          }
          if (fieldsMap.has(fieldKey)) {
            const existing = fieldsMap.get(fieldKey);
            existing.targets += 1;
            if (existing.type !== fieldType) {
              warnings.push({
                code: "FIELD_TYPE_CONFLICT",
                field: fieldKey,
                message: `Type mismatch for field "${fieldKey}": declared as "${existing.type}" and "${fieldType}". Retaining primary type "${existing.type}".`
              });
            }
            if (rawRequired !== null && existing.rawRequired !== null && existing.required !== isRequired) {
              warnings.push({
                code: "FIELD_REQUIRED_CONFLICT",
                field: fieldKey,
                message: `Conflicting required declaration for field "${fieldKey}".`
              });
            }
            if (maxlength !== null && existing.maxlength !== null && existing.maxlength !== maxlength) {
              warnings.push({
                code: "FIELD_MAXLENGTH_CONFLICT",
                field: fieldKey,
                message: `Conflicting maxlength for field "${fieldKey}": ${existing.maxlength} vs ${maxlength}.`
              });
            }
          } else {
            const newField = {
              key: fieldKey,
              label: fieldLabel,
              type: fieldType,
              required: isRequired,
              rawRequired,
              defaultValue,
              placeholder,
              description,
              minlength,
              maxlength,
              min,
              max,
              step,
              pattern,
              format,
              target,
              group,
              order,
              visibleIf,
              disabledIf,
              requiredIf,
              labelIf,
              descriptionIf,
              clearOnHide,
              options,
              isStandard: STANDARD_PERSONALIZATION_KEYS.has(fieldKey),
              legacy: isLegacy,
              targets: 1
            };
            fieldsMap.set(fieldKey, newField);
            fieldsList.push(newField);
          }
        } catch (err) {
          errors.push({
            code: "FIELD_SCAN_ERROR",
            message: `Error scanning field element: ${err.message}`
          });
        }
      });
      const sortedFields = [...fieldsList].sort((a, b) => {
        if (a.order !== null && b.order !== null) return a.order - b.order;
        if (a.order !== null) return -1;
        if (b.order !== null) return 1;
        return 0;
      });
      const groupsMap = /* @__PURE__ */ new Map();
      sortedFields.forEach((f) => {
        const grp = f.group || "general";
        if (!groupsMap.has(grp)) {
          groupsMap.set(grp, {
            id: grp,
            key: grp,
            title: grp.charAt(0).toUpperCase() + grp.slice(1).replace(/_/g, " "),
            fields: []
          });
        }
        groupsMap.get(grp).fields.push(f);
      });
      const standardFields = sortedFields.filter((f) => f.isStandard);
      const templateSpecificFields = sortedFields.filter((f) => !f.isStandard);
      currentSchema = {
        valid: errors.length === 0,
        protocol: { version: PROTOCOL_VERSION },
        fields: sortedFields,
        groups: Array.from(groupsMap.values()),
        standardFields,
        templateSpecificFields,
        warnings,
        errors
      };
      return currentSchema;
    },
    /**
     * Initialize Content System with template document and initial data
     * @param {Object} options
     */
    init(options = {}) {
      const doc = options.document || (typeof document !== "undefined" ? document : null);
      if (doc) {
        this.scan(doc);
        this.captureTokenTemplates(doc);
      }
      defaultContent = {};
      if (currentSchema && Array.isArray(currentSchema.fields)) {
        currentSchema.fields.forEach((f) => {
          if (f.defaultValue !== null && f.defaultValue !== void 0) {
            defaultContent[f.key] = f.defaultValue;
          } else if (f.type === "toggle") {
            defaultContent[f.key] = false;
          } else if (f.type === "multiselect") {
            defaultContent[f.key] = [];
          } else {
            defaultContent[f.key] = "";
          }
        });
      }
      const initialData = options.data || {};
      const initialContent = initialData.content || initialData;
      currentContent = { ...defaultContent };
      Object.keys(initialContent).forEach((k) => {
        if (initialContent[k] !== void 0 && initialContent[k] !== null) {
          currentContent[k] = initialContent[k];
        }
      });
      if (typeof window !== "undefined") {
        window.WishMagicData = window.WishMagicData || {};
        window.WishMagicData.content = { ...currentContent };
        if (currentContent.event_date || currentContent.event_time || currentContent.timezone) {
          window.WishMagicData.event = {
            date: currentContent.event_date || "",
            time: currentContent.event_time || "00:00",
            timezone: currentContent.timezone || "Asia/Kolkata"
          };
        }
      }
      if (options.previewBridge || options.previewTarget || options.previewIframe) {
        previewBridge = options.previewBridge || options.previewTarget || options.previewIframe;
      }
      if (typeof options.onChange === "function") {
        this.onChange(options.onChange);
      }
      if (doc) {
        this.renderTokens(doc, currentContent);
        this.applyContentToDOM(doc, currentContent);
      }
      return this;
    },
    /**
     * Capture elements containing {{tokens}} for safe continuous hydration
     */
    captureTokenTemplates(doc) {
      if (!doc) return;
      try {
        const walker = doc.createTreeWalker && doc.body ? doc.createTreeWalker(doc.body, 4, null, false) : null;
        if (walker) {
          let node;
          while (node = walker.nextNode()) {
            const txt = node.nodeValue;
            if (txt && txt.includes("{{") && txt.includes("}}")) {
              initialTokenTemplates.set(node, txt);
            }
          }
        }
      } catch (e) {
      }
    },
    /**
     * Get current scanned schema
     */
    getSchema() {
      return currentSchema;
    },
    /**
     * Get list of fields
     */
    getFields() {
      return currentSchema ? currentSchema.fields : [];
    },
    /**
     * Get value of a specific field
     */
    getValue(key) {
      return currentContent[key];
    },
    /**
     * Set value of a specific field
     */
    setValue(key, value) {
      if (!key) return;
      const oldValue = currentContent[key];
      currentContent[key] = value;
      if (typeof window !== "undefined") {
        window.WishMagicData = window.WishMagicData || {};
        window.WishMagicData.content = window.WishMagicData.content || {};
        window.WishMagicData.content[key] = value;
        if (key === "event_date" || key === "event_time" || key === "timezone") {
          window.WishMagicData.event = {
            date: currentContent.event_date || "",
            time: currentContent.event_time || "00:00",
            timezone: currentContent.timezone || "Asia/Kolkata"
          };
        }
      }
      const doc = activeDocument || (typeof document !== "undefined" ? document : null);
      if (doc) {
        this.updateFieldInDOM(doc, key, value);
        this.renderTokens(doc, currentContent);
      }
      this.sendUpdateToBridge(key, value);
      const changeObj = { key, oldValue, newValue: value, content: { ...currentContent } };
      changeListeners.forEach((cb) => {
        try {
          cb(changeObj);
        } catch (e) {
          console.warn("[WishMagicContent] Listener error:", e);
        }
      });
    },
    /**
     * Set multiple field values in batch
     */
    setValues(values = {}) {
      if (!values || typeof values !== "object") return;
      Object.keys(values).forEach((k) => {
        currentContent[k] = values[k];
      });
      if (typeof window !== "undefined") {
        window.WishMagicData = window.WishMagicData || {};
        window.WishMagicData.content = { ...currentContent };
        if (currentContent.event_date || currentContent.event_time || currentContent.timezone) {
          window.WishMagicData.event = {
            date: currentContent.event_date || "",
            time: currentContent.event_time || "00:00",
            timezone: currentContent.timezone || "Asia/Kolkata"
          };
        }
      }
      const doc = activeDocument || (typeof document !== "undefined" ? document : null);
      if (doc) {
        this.applyContentToDOM(doc, currentContent);
        this.renderTokens(doc, currentContent);
      }
      this.sendStateToBridge(currentContent);
    },
    /**
     * Get all content values (clean serializable object)
     */
    getValues() {
      return JSON.parse(JSON.stringify(currentContent));
    },
    /**
     * Central Validation System (Requirement #23)
     */
    validate(valuesToValidate) {
      const data = valuesToValidate || currentContent;
      const errors = [];
      const fields = currentSchema ? currentSchema.fields : [];
      fields.forEach((f) => {
        let isVisible = true;
        if (f.visibleIf) {
          if (global.WishMagicDependencies && typeof global.WishMagicDependencies.evaluate === "function") {
            isVisible = global.WishMagicDependencies.evaluate(f.visibleIf, data);
          } else {
            isVisible = evaluateVisibleIf(f.visibleIf, data);
          }
        }
        if (!isVisible) return;
        let isRequired = f.required === true;
        if (f.requiredIf && global.WishMagicDependencies && typeof global.WishMagicDependencies.evaluate === "function") {
          isRequired = global.WishMagicDependencies.evaluate(f.requiredIf, data);
        }
        const val = data[f.key];
        const isBlank = val === void 0 || val === null || typeof val === "string" && val.trim() === "" || Array.isArray(val) && val.length === 0;
        if (isRequired && isBlank) {
          errors.push({
            field: f.key,
            code: "REQUIRED",
            message: `${f.label} is required.`
          });
          return;
        }
        if (isBlank) return;
        if (f.minlength !== null && typeof val === "string" && val.length < f.minlength) {
          errors.push({
            field: f.key,
            code: "MIN_LENGTH",
            message: `${f.label} must be at least ${f.minlength} characters.`
          });
        }
        if (f.maxlength !== null && typeof val === "string" && val.length > f.maxlength) {
          errors.push({
            field: f.key,
            code: "MAX_LENGTH",
            message: `${f.label} cannot exceed ${f.maxlength} characters.`
          });
        }
        if (f.type === "date") {
          const dateStr = String(val).trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            errors.push({
              field: f.key,
              code: "INVALID_DATE",
              message: `Please enter a valid date in YYYY-MM-DD format.`
            });
          }
        }
        if (f.type === "time") {
          const timeStr = String(val).trim();
          if (!/^\d{2}:\d{2}(:\d{2})?$/.test(timeStr)) {
            errors.push({
              field: f.key,
              code: "INVALID_TIME",
              message: `Please enter a valid time in HH:mm format.`
            });
          }
        }
        if (f.type === "email") {
          const emailStr = String(val).trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
            errors.push({
              field: f.key,
              code: "INVALID_EMAIL",
              message: `Please enter a valid email address.`
            });
          }
        }
        if (f.type === "phone") {
          const phoneStr = String(val).trim();
          if (!/^[\d+\-\s()]{6,20}$/.test(phoneStr)) {
            errors.push({
              field: f.key,
              code: "INVALID_PHONE",
              message: `Please enter a valid phone number.`
            });
          }
        }
        if (f.type === "url") {
          const urlStr = String(val).trim();
          if (urlStr.toLowerCase().startsWith("javascript:") || urlStr.toLowerCase().startsWith("data:text/html")) {
            errors.push({
              field: f.key,
              code: "INVALID_URL",
              message: `Unsafe URL scheme is not permitted.`
            });
          } else if (!/^(https?:\/\/|\/|#)/i.test(urlStr)) {
            errors.push({
              field: f.key,
              code: "INVALID_URL",
              message: `Please enter a valid URL.`
            });
          }
        }
        if (f.type === "number" || f.type === "range") {
          const num = Number(val);
          if (Number.isNaN(num)) {
            errors.push({
              field: f.key,
              code: "INVALID_NUMBER",
              message: `${f.label} must be a valid number.`
            });
          } else {
            if (f.min !== null && num < f.min) {
              errors.push({
                field: f.key,
                code: "INVALID_NUMBER",
                message: `${f.label} must be at least ${f.min}.`
              });
            }
            if (f.max !== null && num > f.max) {
              errors.push({
                field: f.key,
                code: "INVALID_NUMBER",
                message: `${f.label} cannot exceed ${f.max}.`
              });
            }
          }
        }
        if (f.type === "select" && f.options && f.options.length > 0) {
          const allowed = f.options.map((o) => String(o.value));
          if (!allowed.includes(String(val))) {
            errors.push({
              field: f.key,
              code: "INVALID_OPTION",
              message: `Selected value for ${f.label} is not a declared option.`
            });
          }
        }
        if (f.type === "multiselect" && f.options && f.options.length > 0) {
          const allowed = f.options.map((o) => String(o.value));
          const items = Array.isArray(val) ? val : [val];
          const hasInvalid = items.some((item) => !allowed.includes(String(item)));
          if (hasInvalid) {
            errors.push({
              field: f.key,
              code: "INVALID_OPTION",
              message: `One or more selected options for ${f.label} are invalid.`
            });
          }
        }
        if (f.pattern) {
          try {
            const re = new RegExp(f.pattern);
            if (!re.test(String(val))) {
              errors.push({
                field: f.key,
                code: "INVALID_PATTERN",
                message: `${f.label} does not match required pattern.`
              });
            }
          } catch (e) {
          }
        }
      });
      return {
        valid: errors.length === 0,
        errors
      };
    },
    /**
     * Reset all content to template defaults
     */
    reset() {
      currentContent = { ...defaultContent };
      if (typeof window !== "undefined") {
        window.WishMagicData = window.WishMagicData || {};
        window.WishMagicData.content = { ...currentContent };
      }
      const doc = activeDocument || (typeof document !== "undefined" ? document : null);
      if (doc) {
        this.applyContentToDOM(doc, currentContent);
        this.renderTokens(doc, currentContent);
      }
      this.sendStateToBridge(currentContent);
    },
    /**
     * Format a value according to format string or type rules
     */
    formatValue(key, value, format) {
      if (format) {
        return formatDateString(value, format);
      }
      return value !== void 0 && value !== null ? String(value) : "";
    },
    /**
     * Resolve a dynamic token string
     */
    resolveToken(token, data) {
      if (!token) return "";
      const cleanToken = token.replace(/[{}]/g, "").trim();
      const dataSource = data || currentContent;
      const val = dataSource[cleanToken] !== void 0 ? dataSource[cleanToken] : global.WishMagicData && global.WishMagicData[cleanToken];
      return val !== void 0 && val !== null ? String(val) : "";
    },
    /**
     * Render dynamic {{tokens}} across text nodes in DOM tree safely as text
     */
    renderTokens(root, data) {
      if (!root) return;
      const source = data || currentContent;
      if (initialTokenTemplates.size > 0) {
        initialTokenTemplates.forEach((templateStr, textNode) => {
          if (textNode && textNode.parentNode) {
            let replaced = templateStr;
            replaced = replaced.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (match, key) => {
              const val = source[key] !== void 0 ? source[key] : global.WishMagicData && global.WishMagicData[key];
              return val !== void 0 && val !== null ? String(val) : match;
            });
            textNode.nodeValue = replaced;
          }
        });
        return;
      }
      try {
        const walker = root.createTreeWalker && root.body ? root.createTreeWalker(root.body, 4, null, false) : null;
        if (walker) {
          let node;
          while (node = walker.nextNode()) {
            const txt = node.nodeValue;
            if (txt && txt.includes("{{") && txt.includes("}}")) {
              initialTokenTemplates.set(node, txt);
              const replaced = txt.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (match, key) => {
                const val = source[key] !== void 0 ? source[key] : global.WishMagicData && global.WishMagicData[key];
                return val !== void 0 && val !== null ? String(val) : match;
              });
              node.nodeValue = replaced;
            }
          }
        }
      } catch (e) {
      }
    },
    /**
     * Update single field targets in DOM
     */
    updateFieldInDOM(doc, key, value) {
      if (!doc || !key) return;
      const elements = doc.querySelectorAll ? Array.from(doc.querySelectorAll(`[data-wm-field="${key}"], [data-wm="${key}"]`)) : [];
      elements.forEach((el) => {
        const type = el.getAttribute("data-wm-type") || (el.tagName === "IMG" ? "image" : "text");
        const format = el.getAttribute("data-wm-format");
        const target = el.getAttribute("data-wm-target") || "text";
        let displayValue = value;
        if (format && (type === "date" || type === "datetime")) {
          displayValue = formatDateString(value, format);
        }
        if (type === "image" && el.tagName === "IMG") {
          el.src = displayValue || el.getAttribute("data-wm-default") || "/assets/file_ab2082.webp";
        } else if (type === "toggle" && el.tagName === "INPUT" && el.type === "checkbox") {
          el.checked = Boolean(value);
        } else if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") && target === "value") {
          if (!(el.tagName === "INPUT" && el.type === "file")) {
            try {
              el.value = displayValue !== void 0 && displayValue !== null ? displayValue : "";
            } catch (_) {
            }
          }
        } else {
          setElementTextSafe(el, displayValue, target);
        }
      });
    },
    /**
     * Apply full content map to DOM
     */
    applyContentToDOM(doc, data) {
      if (!doc || !data) return;
      Object.keys(data).forEach((k) => {
        this.updateFieldInDOM(doc, k, data[k]);
      });
    },
    /**
     * Register Change Listener
     */
    onChange(callback) {
      if (typeof callback === "function") {
        changeListeners.push(callback);
      }
    },
    /**
     * Send update via runtime bridge
     */
    sendUpdateToBridge(key, value) {
      const bridge = previewBridge || global.WishMagicRuntimeBridge;
      if (bridge && typeof bridge.send === "function") {
        bridge.send("WISHMAGIC_UPDATE", {
          key,
          value,
          content: { [key]: value }
        });
      }
    },
    /**
     * Send full state via runtime bridge
     */
    sendStateToBridge(content) {
      const bridge = previewBridge || global.WishMagicRuntimeBridge;
      if (bridge && typeof bridge.send === "function") {
        bridge.send("WISHMAGIC_STATE", {
          content: { ...content }
        });
      }
    },
    /**
     * Update preview
     */
    updatePreview(data) {
      const content = data || currentContent;
      this.sendStateToBridge(content);
    },
    /**
     * Destroy / Cleanup
     */
    destroy() {
      changeListeners = [];
      initialTokenTemplates.clear();
      currentContent = {};
      defaultContent = {};
      currentSchema = null;
    }
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = WishMagicContent;
  }
  if (typeof window !== "undefined") {
    window.WishMagicContent = WishMagicContent;
  }
  global.WishMagicContent = WishMagicContent;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
