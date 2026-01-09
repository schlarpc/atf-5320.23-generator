// Import type definitions
import type { PrefillConfig } from "./types";

/**
 * Prefill configuration for form fields.
 *
 * Example usage:
 * ```typescript
 * export const prefillConfig: PrefillConfig = {
 *   // Lock form type to Form 4 (readonly)
 *   q1_formType: { value: "ATF FORM 4", readonly: true },
 *
 *   // Prefill Q5 fields as editable defaults
 *   q5_agencyName: { value: "MY AGENCY", readonly: false },
 *   q5_officialName: { value: "JOHN DOE", readonly: false },
 *   q5_officialTitle: { value: "CEO", readonly: false },
 *   q5_address: { value: "123 MAIN ST\nANYTOWN, ST 12345", readonly: false },
 *
 *   // Lock UPIN question to "NO"
 *   q8_hasUpin: { value: "NO", readonly: true },
 * };
 * ```
 */
export const prefillConfig: PrefillConfig = {
  // Add your prefill configuration here
  // Example: q1_formType: { value: "ATF FORM 4", readonly: true },
};

// Also export as default for module compatibility
export default prefillConfig;
