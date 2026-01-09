// Form data interface matching the HTML form structure
export interface NFAFormData {
  // Question 1
  q1_formType?: string;

  // Question 2
  q2_fullName?: string;
  q2_address?: string;

  // Question 3
  q3a_fullName?: string;
  q3a_homeAddress?: string;
  q3a_sameAs2?: boolean;
  q3b_telephone?: string;
  q3c_email?: string;
  q3d_otherNames?: string;
  q3f_ssn?: string;
  q3g_dob?: string;
  q3h_ethnicity?: string;
  q3i_race?: string;

  // Question 4
  q4a_firearmType?: string;
  q4a_firearmType_other?: string;
  q4b_name?: string;
  q4b_address?: string;
  q4c_model?: string;
  q4d_caliber?: string;
  q4e_serial?: string;

  // Question 5
  q5_agencyName?: string;
  q5_officialName?: string;
  q5_officialTitle?: string;
  q5_address?: string;

  // Question 6 (prohibitors)
  q6a_intent?: string;
  q6b_sell?: string;
  q6c_indictment?: string;
  q6d_convicted?: string;
  q6e_fugitive?: string;
  q6f_user?: string;
  q6g_mental?: string;
  q6h_dishonorable?: string;
  q6i_restraining?: string;
  q6j_domestic?: string;
  q6k_renounced?: string;
  q6l_illegal?: string;
  q6m1_nonimmigrant?: string;
  q6m2_exception?: string;

  // Question 7
  q7_alienNumber?: string;

  // Question 8
  q8_hasUpin?: string;
  q8_upinNumber?: string;

  // Question 9
  q9a_citizenship?: string[] | string;
  q9a_citizenship_other?: string;
  q9b_birthState?: string;
  q9c_birthCountry?: string;
  q9c_birthCountry_other?: string;

  // Signature
  signature?: string; // Z85-encoded autopen signature

  // Certification
  certificationDate?: string;
}

// Configuration for a single prefillable field
export interface PrefillFieldConfig {
  value: string | string[] | boolean;
  readonly?: boolean; // If true: field is disabled and excluded from hash
}

// Type-safe prefill configuration using NFAFormData keys
export type PrefillConfig = {
  [K in keyof Partial<NFAFormData>]?: PrefillFieldConfig;
} & {
  [key: string]: PrefillFieldConfig | undefined;
};

// Window interface extensions for global functions
declare global {
  interface Window {
    generatePDF: () => Promise<void>;
    serializeForm: () => NFAFormData;
    PREFILL_CONFIG?: PrefillConfig;
  }
}
