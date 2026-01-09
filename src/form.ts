import type { NFAFormData, PrefillConfig } from "./types";
import { SignatureManager } from "./signature";

// Module-level signature manager instance
let signatureManager: SignatureManager | null = null;

// Type definitions for form elements
interface ValidationRule {
  check: (value: string) => boolean;
  msg: string;
}

type ValidationsMap = {
  [key: string]: ValidationRule;
};

// Export serializeForm for use by PDF generator
export function serializeForm(includeDefaults = false): NFAFormData {
  const form = document.getElementById("nfa-form") as HTMLFormElement;
  if (!form) {
    throw new Error("Form not found");
  }

  const getTodayYYYYMMDD = (): string => {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, "0");
    const day = today.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const data: Record<string, any> = {};
  const elements = form.elements;
  const processedCheckboxGroups = new Set<string>();
  const todayString = getTodayYYYYMMDD();

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as HTMLInputElement | HTMLTextAreaElement;
    if (!el.name || el.disabled) continue;

    switch (el.type) {
      case "checkbox": {
        const groupName = el.name;
        if (processedCheckboxGroups.has(groupName)) continue;

        const groupElements = form.elements.namedItem(groupName);
        if (!groupElements) continue;

        const isNodeList = "length" in groupElements;
        if (!isNodeList) {
          // Single boolean checkbox
          const checkbox = groupElements as HTMLInputElement;
          // Special handling for q3a_sameAs2: only store if unchecked (false) unless includeDefaults is true
          if (groupName === "q3a_sameAs2") {
            if (!checkbox.checked) {
              data[groupName] = false;
            } else if (includeDefaults) {
              data[groupName] = true;
            }
          } else {
            data[groupName] = checkbox.checked;
          }
        } else {
          // Group of checkboxes with values
          const checkboxes = groupElements as RadioNodeList;
          const checkedValues: string[] = [];
          checkboxes.forEach((c) => {
            const checkbox = c as HTMLInputElement;
            if (checkbox.checked) {
              checkedValues.push(checkbox.value);
            }
          });
          if (checkedValues.length > 0) {
            data[groupName] = checkedValues;
          }
        }
        processedCheckboxGroups.add(groupName);
        break;
      }
      case "radio": {
        const radio = el as HTMLInputElement;
        if (radio.checked && radio.value) {
          data[radio.name] = radio.value;
        }
        break;
      }
      case "text":
      case "email":
      case "tel": {
        // Handle special case for 'other' radio/checkbox text input
        if (el.name.endsWith("_other")) {
          const baseName = el.name.replace("_other", "");
          const controls = form.elements.namedItem(baseName);
          if (controls) {
            const controlsList =
              "length" in controls
                ? Array.from(controls as RadioNodeList)
                : [controls as HTMLInputElement];
            const otherControl = controlsList.find(
              (r) => (r as HTMLInputElement).value === "OTHER"
            ) as HTMLInputElement | undefined;
            if (otherControl && otherControl.checked && el.value) {
              data[el.name] = el.value.toUpperCase();
            }
          }
        } else if (el.value) {
          data[el.name] = el.value.toUpperCase();
        }
        break;
      }
      case "date": {
        const dateInput = el as HTMLInputElement;
        // Special handling for certificationDate: only store if not blank and not today
        if (dateInput.name === "certificationDate") {
          if (dateInput.value && dateInput.value !== todayString) {
            data[dateInput.name] = dateInput.value;
          }
        } else if (dateInput.value) {
          data[dateInput.name] = dateInput.value;
        }
        break;
      }
      default: {
        if (el.value) {
          // Normalize textarea values to uppercase
          if (el.tagName === "TEXTAREA") {
            data[el.name] = el.value.toUpperCase();
          } else {
            data[el.name] = el.value;
          }
        }
        break;
      }
    }
  }

  // Add signature if present
  if (signatureManager && !signatureManager.isEmpty()) {
    const signature = signatureManager.serialize();
    if (signature) {
      data.signature = signature;
    }
  }

  return data as NFAFormData;
}

// Main initialization function
export function initializeForm(): void {
  const init = () => {
    const form = document.getElementById("nfa-form") as HTMLFormElement;
    if (!form) {
      console.error("Form not found");
      return;
    }

    // Initialize signature manager
    try {
      signatureManager = new SignatureManager("signature-canvas", "signature-render-canvas");
      console.log("Signature manager initialized");
    } catch (error) {
      console.error("Failed to initialize signature manager:", error);
    }

    const getTodayYYYYMMDD = (): string => {
      const today = new Date();
      const year = today.getFullYear();
      const month = (today.getMonth() + 1).toString().padStart(2, "0");
      const day = today.getDate().toString().padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    // --- STATE MANAGEMENT ---

    const deserializeForm = (data: Record<string, any>): void => {
      // Handle signature separately
      if (data.signature && signatureManager) {
        signatureManager.deserialize(data.signature);
      }

      for (const key in data) {
        // Skip signature as it's handled above
        if (key === "signature") continue;

        const elements = form.elements.namedItem(key);
        if (!elements) continue;

        let value = data[key];
        const isNodeList = "length" in elements;
        const el = (isNodeList ? (elements as RadioNodeList)[0] : elements) as
          | HTMLInputElement
          | HTMLTextAreaElement;

        if (el.type === "radio") {
          const radios = elements as RadioNodeList;
          radios.forEach((radio) => {
            (radio as HTMLInputElement).checked = (radio as HTMLInputElement).value === value;
          });
        } else if (el.type === "checkbox") {
          if (typeof value === "boolean") {
            (elements as HTMLInputElement).checked = value;
          } else {
            const checkboxes = elements as RadioNodeList;
            checkboxes.forEach((checkbox) => {
              (checkbox as HTMLInputElement).checked = (value as string[]).includes(
                (checkbox as HTMLInputElement).value
              );
            });
          }
        } else {
          // Normalize text values to uppercase when rehydrating
          if (
            typeof value === "string" &&
            (el.type === "text" ||
              el.type === "email" ||
              el.type === "tel" ||
              el.tagName === "TEXTAREA")
          ) {
            value = value.toUpperCase();
          }
          el.value = value;
        }
      }
    };

    const applyPrefillConfig = (): void => {
      if (!window.PREFILL_CONFIG) return;

      const config: PrefillConfig = window.PREFILL_CONFIG;
      const prefillData: Record<string, any> = {};

      for (const fieldName in config) {
        const fieldConfig = config[fieldName];
        if (!fieldConfig) continue;

        const element = form.elements.namedItem(fieldName);
        if (!element) continue;

        // Only prefill if no value from hash
        const hasValueFromHash = (el: Element | RadioNodeList): boolean => {
          if ("type" in el && (el.type === "radio" || el.type === "checkbox")) {
            const list = "length" in el ? Array.from(el as RadioNodeList) : [el];
            return list.some((e) => (e as HTMLInputElement).checked);
          }
          return !!("value" in el && el.value);
        };

        if (!hasValueFromHash(element)) {
          let value = fieldConfig.value;

          // Format phone/SSN if needed
          if (fieldName === "q3b_telephone" && typeof value === "string") {
            const digits = value.replace(/\D/g, "");
            if (digits.length === 10) {
              value = `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6, 10)}`;
            }
          } else if (fieldName === "q3f_ssn" && typeof value === "string") {
            const cleaned = value.replace(/\D/g, "");
            if (cleaned.length === 9) {
              value = `${cleaned.substring(0, 3)}-${cleaned.substring(3, 5)}-${cleaned.substring(5, 9)}`;
            }
          }

          // Uppercase text values
          const el = "length" in element ? (element as RadioNodeList)[0] : element;
          const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
          if (
            typeof value === "string" &&
            (inputEl.type === "text" ||
              inputEl.type === "email" ||
              inputEl.type === "tel" ||
              inputEl.tagName === "TEXTAREA")
          ) {
            value = value.toUpperCase();
          }

          prefillData[fieldName] = value;
        }
      }

      if (Object.keys(prefillData).length > 0) {
        deserializeForm(prefillData);
      }
    };

    const applyReadonlyLocks = (): void => {
      if (!window.PREFILL_CONFIG) return;

      for (const fieldName in window.PREFILL_CONFIG) {
        const fieldConfig = window.PREFILL_CONFIG[fieldName];
        if (!fieldConfig || !fieldConfig.readonly) continue;

        const elements = form.elements.namedItem(fieldName);
        if (!elements) continue;

        const elementList =
          "length" in elements ? Array.from(elements as RadioNodeList) : [elements as HTMLElement];
        elementList.forEach((el) => {
          (el as HTMLInputElement).disabled = true;
          el.classList.add("prefill-locked");

          // Add lock icon indicator
          const container = el.closest(
            ".question-group, .radio-group, .checkbox-group, .sub-input"
          );
          if (container && !container.querySelector(".prefill-lock-indicator")) {
            const indicator = document.createElement("span");
            indicator.className = "prefill-lock-indicator";
            indicator.title = "This field is locked by prefill configuration";
            indicator.innerHTML = "🔒";

            const label =
              container.querySelector(`label[for="${(el as HTMLElement).id}"]`) ||
              el.previousElementSibling ||
              container.querySelector("legend");
            if (label) {
              label.appendChild(indicator);
            }
          }
        });
      }
    };

    const lockRelatedOtherFields = (): void => {
      if (!window.PREFILL_CONFIG) return;

      const otherFieldMap: Record<string, string> = {
        q4a_firearmType: "q4a_firearmType_other",
        q9a_citizenship: "q9a_citizenship_other",
        q9c_birthCountry: "q9c_birthCountry_other",
      };

      for (const [parentField, otherField] of Object.entries(otherFieldMap)) {
        const parentConfig = window.PREFILL_CONFIG[parentField];
        if (!parentConfig || !parentConfig.readonly) continue;

        const parentElement = form.elements.namedItem(parentField);
        const otherElement = document.getElementById(otherField) as HTMLInputElement | null;

        if (parentElement && otherElement) {
          const elementList =
            "length" in parentElement
              ? Array.from(parentElement as RadioNodeList)
              : [parentElement];
          const otherSelected = elementList.some(
            (el) => (el as HTMLInputElement).checked && (el as HTMLInputElement).value === "OTHER"
          );

          if (otherSelected) {
            otherElement.disabled = true;
            otherElement.classList.add("prefill-locked");
          }
        }
      }
    };

    const debounce = <T extends (...args: any[]) => any>(
      func: T,
      delay: number
    ): ((...args: Parameters<T>) => void) => {
      let timeout: ReturnType<typeof setTimeout>;
      return function (this: any, ...args: Parameters<T>) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
      };
    };

    const saveStateToHash = (): void => {
      const data = serializeForm();
      if (Object.keys(data).length > 0) {
        const jsonString = JSON.stringify(data);
        const base64String = btoa(jsonString)
          .replace(/\+/g, "-") // Convert '+' to '-'
          .replace(/\//g, "_") // Convert '/' to '_'
          .replace(/=+$/, ""); // Remove trailing '='
        history.replaceState(null, "", "#" + base64String);
      } else {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };

    const loadStateFromHash = (): void => {
      if (window.location.hash) {
        try {
          let base64String = window.location.hash
            .substring(1)
            .replace(/-/g, "+") // Convert '-' back to '+'
            .replace(/_/g, "/"); // Convert '_' back to '/'

          const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
          const jsonString = atob(base64String + padding);

          const data = JSON.parse(jsonString);
          deserializeForm(data);
        } catch (e) {
          console.error("Failed to load state from hash:", e);
        }
      }
    };

    // --- VALIDATION ---
    const validations: ValidationsMap = {
      q3b_telephone: {
        check: (v) => !v || /^[\d\s\(\)-]+$/.test(v),
        msg: "Must only contain digits and separators.",
      },
      q3c_email: {
        check: (v) => !v || /.+@.+/.test(v),
        msg: "Must be a valid email format.",
      },
      q3f_ssn: {
        check: (v) => !v || /^(\d{3}-\d{2}-\d{4}|\d{9}|[a-zA-Z0-9]{8})$/.test(v),
        msg: "Must be a 9-digit SSN or 8-character UPIN.",
      },
      q3g_dob: {
        check: (v) => !v || new Date(v) <= new Date(),
        msg: "Date of Birth cannot be in the future.",
      },
    };

    const validateField = (field: HTMLInputElement | null): boolean => {
      if (!field) return true;
      const errorContainer = document.getElementById(field.id + "-error");
      const rule = validations[field.name];
      const value = field.value;
      const isValid = !rule || rule.check(value);

      if (isValid) {
        field.classList.remove("invalid-field");
        if (errorContainer) errorContainer.textContent = "";
      } else {
        field.classList.add("invalid-field");
        if (errorContainer) errorContainer.textContent = rule.msg;
      }
      return isValid;
    };

    const runAllValidations = (): boolean => {
      let allValid = true;
      Object.keys(validations).forEach((fieldName) => {
        const field = form.elements.namedItem(fieldName) as HTMLInputElement | null;
        if (!validateField(field)) {
          allValid = false;
        }
      });
      return allValid;
    };

    // --- UPPERCASE NORMALIZATION ---

    // Function to normalize text inputs to uppercase
    const normalizeToUppercase = (element: HTMLInputElement | HTMLTextAreaElement): void => {
      if (
        element.type === "text" ||
        element.type === "email" ||
        element.type === "tel" ||
        element.tagName === "TEXTAREA"
      ) {
        const cursorPos = element.selectionStart || 0;
        const cursorEnd = element.selectionEnd || 0;
        const originalValue = element.value;
        const upperValue = originalValue.toUpperCase();

        if (originalValue !== upperValue) {
          element.value = upperValue;
          // Restore cursor position
          element.setSelectionRange(cursorPos, cursorEnd);
        }
      }
    };

    // Add input event listeners for real-time uppercase conversion
    form.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      normalizeToUppercase(target);
    });

    form.addEventListener("input", debounce(saveStateToHash, 150));
    form.addEventListener("change", saveStateToHash);

    // --- DYNAMIC FIELD LOGIC & FORMATTING ---

    // Auto-expanding textareas with line limits
    const textareaLineLimits: Record<string, number> = {
      q2_address: 2,
      q3a_homeAddress: 7,
      q5_address: 2,
      q4b_address: 2,
      q3d_otherNames: 2,
    };

    const autoResizeTextarea = (el: HTMLTextAreaElement): void => {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    };

    const limitTextareaLines = (textarea: HTMLTextAreaElement): void => {
      const maxLines = textareaLineLimits[textarea.name];
      if (!maxLines) return;

      const lines = textarea.value.split("\n");
      if (lines.length > maxLines) {
        lines.splice(maxLines);
        textarea.value = lines.join("\n");
      }
    };

    form.querySelectorAll("textarea").forEach((textarea) => {
      textarea.addEventListener("input", () => {
        limitTextareaLines(textarea);
        autoResizeTextarea(textarea);
      });
    });

    // Q3a: Same as 2
    const sameAsCheckbox = document.getElementById("q3a_sameAs2") as HTMLInputElement;
    const q2Address = document.getElementById("q2_address") as HTMLTextAreaElement;
    const q3aHomeAddress = document.getElementById("q3a_homeAddress") as HTMLTextAreaElement;

    const syncAddress = (): void => {
      if (sameAsCheckbox.checked) {
        q3aHomeAddress.value = q2Address.value;
        q3aHomeAddress.disabled = true;
        q3aHomeAddress.dispatchEvent(new Event("input", { bubbles: true })); // to trigger resize
      } else {
        q3aHomeAddress.disabled = false;
      }
    };
    sameAsCheckbox.addEventListener("change", syncAddress);
    q2Address.addEventListener("input", syncAddress);

    // Q3b Phone Formatting
    const phoneInput = document.getElementById("q3b_telephone") as HTMLInputElement;
    phoneInput.addEventListener("blur", (e) => {
      const target = e.target as HTMLInputElement;
      const digits = target.value.replace(/\D/g, "");
      if (digits.length === 10) {
        target.value = `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6, 10)}`;
      }
      // Ensure uppercase after formatting
      normalizeToUppercase(target);
    });

    // Q3f SSN Formatting
    const ssnInput = document.getElementById("q3f_ssn") as HTMLInputElement;
    ssnInput.addEventListener("blur", (e) => {
      const target = e.target as HTMLInputElement;
      const cleaned = target.value.replace(/\D/g, "");
      if (cleaned.length === 9) {
        target.value = `${cleaned.substring(0, 3)}-${cleaned.substring(3, 5)}-${cleaned.substring(5, 9)}`;
      }
      // Ensure uppercase after formatting
      normalizeToUppercase(target);
    });

    // Q4a: Other firearm type text input
    const otherFirearmRadio = document.getElementById("q4a_other") as HTMLInputElement;
    const otherFirearmText = document.getElementById("q4a_other_text") as HTMLInputElement;
    const q4aRadios = form.elements.namedItem("q4a_firearmType") as RadioNodeList;
    q4aRadios.forEach((radio) => {
      radio.addEventListener("change", () => {
        const isOther = otherFirearmRadio.checked;
        otherFirearmText.disabled = !isOther;
        if (!isOther) otherFirearmText.value = "";
        if (isOther) otherFirearmText.focus();
      });
    });

    // Q6: All No button
    const q6AllNoButton = document.getElementById("q6_allNo") as HTMLButtonElement;
    q6AllNoButton.addEventListener("click", () => {
      const prohibitors = document.getElementById("q6_prohibitors") as HTMLElement;
      prohibitors
        .querySelectorAll<HTMLInputElement>('input[type="radio"][value="NO"]')
        .forEach((radio) => {
          radio.checked = true;
          radio.dispatchEvent(new Event("change", { bubbles: true }));
        });
      const q6m2na = document.getElementById("q6m2-na") as HTMLInputElement;
      q6m2na.checked = true;
      q6m2na.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Q6m: Dependency logic
    const q6m1Radios = form.elements.namedItem("q6m1_nonimmigrant") as RadioNodeList;
    const q6m2Radios = form.elements.namedItem("q6m2_exception") as RadioNodeList;
    const updateQ6m2 = (): void => {
      const q6m1Yes = (document.getElementById("q6m1-yes") as HTMLInputElement).checked;
      const q6m1No = (document.getElementById("q6m1-no") as HTMLInputElement).checked;

      if (q6m1Yes) {
        (document.getElementById("q6m2-yes") as HTMLInputElement).disabled = false;
        (document.getElementById("q6m2-no") as HTMLInputElement).disabled = false;
        (document.getElementById("q6m2-na") as HTMLInputElement).disabled = true;
        if ((document.getElementById("q6m2-na") as HTMLInputElement).checked) {
          q6m2Radios.forEach((r) => ((r as HTMLInputElement).checked = false));
        }
      } else if (q6m1No) {
        (document.getElementById("q6m2-yes") as HTMLInputElement).disabled = true;
        (document.getElementById("q6m2-no") as HTMLInputElement).disabled = true;
        (document.getElementById("q6m2-na") as HTMLInputElement).disabled = false;
        (document.getElementById("q6m2-na") as HTMLInputElement).checked = true;
      } else {
        // Neither selected
        q6m2Radios.forEach((r) => {
          (r as HTMLInputElement).disabled = true;
          (r as HTMLInputElement).checked = false;
        });
      }
    };
    q6m1Radios.forEach((r) => r.addEventListener("change", updateQ6m2));

    // Q8: UPIN dependency
    const upinRadios = form.elements.namedItem("q8_hasUpin") as RadioNodeList;
    const upinNumberInput = document.getElementById("q8_upinNumber") as HTMLInputElement;
    const updateUpinInput = (): void => {
      const hasUpin = (document.getElementById("q8_upin-yes") as HTMLInputElement).checked;
      upinNumberInput.disabled = !hasUpin;
      if (!hasUpin) upinNumberInput.value = "";
    };
    upinRadios.forEach((r) => r.addEventListener("change", updateUpinInput));

    // Q9a: Citizenship dependency
    const q9aOtherCheckbox = document.getElementById("q9a_other") as HTMLInputElement;
    const q9aOtherText = document.getElementById("q9a_other_text") as HTMLInputElement;
    q9aOtherCheckbox.addEventListener("change", () => {
      const isOther = q9aOtherCheckbox.checked;
      q9aOtherText.disabled = !isOther;
      if (!isOther) q9aOtherText.value = "";
      if (isOther) q9aOtherText.focus();
    });

    // Q9c: Country of Birth dependency
    const q9cBirthCountryRadios = form.elements.namedItem("q9c_birthCountry") as RadioNodeList;
    const q9cOtherText = document.getElementById("q9c_other_text") as HTMLInputElement;
    const updateQ9cInput = (): void => {
      const isOther = (document.getElementById("q9c_other") as HTMLInputElement).checked;
      q9cOtherText.disabled = !isOther;
      if (!isOther) q9cOtherText.value = "";
      if (isOther) q9cOtherText.focus();
    };
    q9cBirthCountryRadios.forEach((r) => r.addEventListener("change", updateQ9cInput));

    // Fill shared blurbs from template
    const blurbTemplate = document.getElementById("blurb-prohibited-person") as HTMLElement;
    document.querySelectorAll(".blurb-content-container").forEach((container) => {
      const blurbSpan = document.createElement("span");
      blurbSpan.className = "blurb-content";
      blurbSpan.innerHTML = blurbTemplate.innerHTML;
      container.appendChild(blurbSpan);
    });

    // --- TOUCH-FRIENDLY BLURB FUNCTIONALITY ---
    const isTouchDevice = (): boolean => {
      return "ontouchstart" in window || navigator.maxTouchPoints > 0;
    };

    const initializeBlurbHandlers = (): void => {
      const blurbTriggers = document.querySelectorAll(".blurb-trigger");
      let currentlyOpenBlurb: Element | null = null;

      // Function to hide all blurbs
      const hideAllBlurbs = (): void => {
        blurbTriggers.forEach((trigger) => {
          const blurb = trigger.querySelector(".blurb-content");
          if (blurb) {
            blurb.classList.remove("touch-visible");
            trigger.setAttribute("aria-expanded", "false");
            blurb.setAttribute("aria-hidden", "true");
          }
        });
        currentlyOpenBlurb = null;
      };

      // Function to show a specific blurb
      const showBlurb = (trigger: Element): void => {
        const blurb = trigger.querySelector(".blurb-content");
        if (blurb) {
          blurb.classList.add("touch-visible");
          trigger.setAttribute("aria-expanded", "true");
          blurb.setAttribute("aria-hidden", "false");
          currentlyOpenBlurb = trigger;
        }
      };

      // Add ARIA attributes for accessibility
      blurbTriggers.forEach((trigger) => {
        const blurb = trigger.querySelector(".blurb-content");
        if (blurb) {
          // Add unique IDs for proper ARIA relationship
          const triggerId = "blurb-trigger-" + Math.random().toString(36).substr(2, 9);
          const blurbId = "blurb-content-" + Math.random().toString(36).substr(2, 9);

          trigger.setAttribute("id", triggerId);
          trigger.setAttribute("aria-describedby", blurbId);
          trigger.setAttribute("aria-expanded", "false");
          trigger.setAttribute("role", "button");
          trigger.setAttribute("tabindex", "0");

          blurb.setAttribute("id", blurbId);
          blurb.setAttribute("role", "tooltip");
          blurb.setAttribute("aria-hidden", "true");
        }
      });

      // For touch devices, use click/tap events
      if (isTouchDevice()) {
        blurbTriggers.forEach((trigger) => {
          const blurb = trigger.querySelector(".blurb-content");
          if (blurb) {
            trigger.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();

              if (currentlyOpenBlurb === trigger) {
                // If this blurb is already open, close it
                hideAllBlurbs();
              } else {
                // Close any open blurb and open this one
                hideAllBlurbs();
                showBlurb(trigger);
              }
            });

            // Handle keyboard navigation
            trigger.addEventListener("keydown", (e) => {
              const keyEvent = e as KeyboardEvent;
              if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                keyEvent.preventDefault();
                (trigger as HTMLElement).click();
              } else if (keyEvent.key === "Escape") {
                hideAllBlurbs();
              }
            });
          }
        });

        // Close blurbs when clicking outside
        document.addEventListener("click", (e) => {
          if (!(e.target as Element).closest(".blurb-trigger")) {
            hideAllBlurbs();
          }
        });

        // Close blurbs when scrolling (mobile UX improvement)
        let scrollTimer: ReturnType<typeof setTimeout>;
        window.addEventListener("scroll", () => {
          if (currentlyOpenBlurb) {
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(hideAllBlurbs, 100);
          }
        });
      } else {
        // For non-touch devices, enhance hover with keyboard support
        blurbTriggers.forEach((trigger) => {
          trigger.addEventListener("keydown", (e) => {
            const keyEvent = e as KeyboardEvent;
            if (keyEvent.key === "Enter" || keyEvent.key === " ") {
              keyEvent.preventDefault();
              const blurb = trigger.querySelector(".blurb-content") as HTMLElement;
              if (blurb) {
                blurb.style.display = blurb.style.display === "block" ? "none" : "block";
                trigger.setAttribute(
                  "aria-expanded",
                  blurb.style.display === "block" ? "true" : "false"
                );
              }
            }
          });

          trigger.addEventListener("blur", () => {
            const blurb = trigger.querySelector(".blurb-content") as HTMLElement;
            if (blurb) {
              blurb.style.display = "none";
              trigger.setAttribute("aria-expanded", "false");
            }
          });
        });
      }
    };

    // Initialize blurb handlers
    initializeBlurbHandlers();

    // Clear Form Button
    const clearFormButton = document.getElementById("clear-form") as HTMLButtonElement;
    clearFormButton.addEventListener("click", () => {
      if (confirm("Are you sure you want to clear all fields? This cannot be undone.")) {
        form.reset();
        // Reapply prefill configuration to restore locked fields
        applyPrefillConfig();
        applyReadonlyLocks();
        lockRelatedOtherFields();
        // After reset, re-run all UI update functions to correctly set disabled states etc.
        runAllUIUpdates();
        saveStateToHash(); // This will clear the hash

        // Also clear signature
        if (signatureManager) {
          signatureManager.clear();
        }
      }
    });

    // Signature buttons
    if (signatureManager) {
      const undoButton = document.getElementById("signature-undo") as HTMLButtonElement;
      const clearButton = document.getElementById("signature-clear") as HTMLButtonElement;

      if (undoButton) {
        undoButton.addEventListener("click", () => {
          signatureManager?.undo();
        });
      }

      if (clearButton) {
        clearButton.addEventListener("click", () => {
          signatureManager?.clear();
        });
      }

      // Listen to signature changes to update hash
      const canvas = document.getElementById("signature-canvas");
      if (canvas) {
        canvas.addEventListener("signaturechange", () => {
          saveStateToHash();
        });
      }
    }

    // --- Clear Section Button Logic ---
    document.querySelectorAll(".clear-question-group").forEach((button) => {
      button.addEventListener("click", (e) => {
        const fieldset = (e.target as HTMLElement).closest(".question-group");
        if (fieldset) {
          // Special handling for signature section
          if (fieldset.querySelector("#signature-canvas") && signatureManager) {
            signatureManager.clear();
            return;
          }

          const elements = fieldset.querySelectorAll<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
          >("input, textarea, select");
          elements.forEach((el) => {
            // Skip prefill-locked fields
            if (el.classList.contains("prefill-locked")) {
              return;
            }

            switch (el.type) {
              case "text":
              case "textarea":
              case "email":
              case "tel":
              case "date":
                el.value = (el as any).defaultValue;
                break;
              case "checkbox":
              case "radio":
                (el as HTMLInputElement).checked = (el as any).defaultChecked;
                break;
              case "select-one":
              case "select-multiple": {
                const selectEl = el as HTMLSelectElement;
                Array.from(selectEl.options).forEach((option) => {
                  option.selected = (option as any).defaultSelected;
                });
                break;
              }
            }
            // Trigger events to update UI (like disabled states) and save to hash
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new Event("input", { bubbles: true }));
          });
        }
      });
    });

    // Expose serializeForm function globally for TypeScript access
    // Include readonly prefill values in PDF generation
    window.serializeForm = (): NFAFormData => {
      const data = serializeForm(true);

      // Include readonly prefill values for PDF generation
      if (window.PREFILL_CONFIG) {
        for (const fieldName in window.PREFILL_CONFIG) {
          const fieldConfig = window.PREFILL_CONFIG[fieldName];
          if (fieldConfig && fieldConfig.readonly && !(fieldName in data)) {
            (data as any)[fieldName] = fieldConfig.value;
          }
        }
      }

      return data;
    };

    // Generate PDF button
    const generatePdfButton = document.getElementById("generate-pdf") as HTMLButtonElement;
    generatePdfButton.addEventListener("click", async () => {
      const isFormValid = runAllValidations();
      if (!isFormValid) {
        alert("PLEASE FIX THE HIGHLIGHTED VALIDATION ERRORS BEFORE GENERATING THE PDF.");
        const firstInvalid = form.querySelector(".invalid-field") as HTMLElement | null;
        if (firstInvalid) {
          firstInvalid
            .closest(".question-group")
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }

      // Call the TypeScript generatePDF function
      try {
        if (typeof window.generatePDF === "function") {
          await window.generatePDF();
        } else {
          alert(
            "PDF generation function not loaded. Please ensure the TypeScript module is properly loaded."
          );
        }
      } catch (error) {
        console.error("Error generating PDF:", error);
        alert(`Error generating PDF: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    // --- INITIALIZATION ---
    const runAllUIUpdates = (): void => {
      syncAddress();
      updateQ6m2();
      updateUpinInput();
      updateQ9cInput();
      q4aRadios.forEach((radio) => radio.dispatchEvent(new Event("change")));
      const q9aRadios = form.elements.namedItem("q9a_citizenship") as RadioNodeList;
      q9aRadios.forEach((cb) => cb.dispatchEvent(new Event("change")));
      form.querySelectorAll("textarea").forEach(autoResizeTextarea);
      Object.keys(validations).forEach((fieldName) =>
        validateField(form.elements.namedItem(fieldName) as HTMLInputElement)
      );

      // Set certification date if it's empty
      const certDate = document.getElementById("certificationDate") as HTMLInputElement;
      if (!certDate.value) {
        certDate.value = getTodayYYYYMMDD();
      }

      // Normalize all existing text values to uppercase on initialization
      form
        .querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement
        >('input[type="text"], input[type="email"], input[type="tel"], textarea')
        .forEach(normalizeToUppercase);
    };

    // Add blur listeners for validation
    Object.keys(validations).forEach((fieldName) => {
      const field = form.elements.namedItem(fieldName) as HTMLInputElement | null;
      if (field) {
        field.addEventListener("blur", () => validateField(field));
      }
    });

    loadStateFromHash();
    applyPrefillConfig(); // Apply prefills to empty fields
    applyReadonlyLocks(); // Lock readonly fields
    lockRelatedOtherFields(); // Lock related "other" text inputs
    runAllUIUpdates();
  };

  // Run immediately if DOM is already loaded, otherwise wait for DOMContentLoaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
