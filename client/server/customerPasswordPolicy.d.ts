export declare const CUSTOMER_PASSWORD_MIN_LENGTH = 8;
export declare const CUSTOMER_PASSWORD_HINT: string;
export declare const CUSTOMER_PASSWORD_ERROR_MESSAGES: {
  readonly minLength: string;
  readonly uppercase: string;
  readonly lowercase: string;
  readonly number: string;
};
export declare function getCustomerPasswordErrors(password: string): string[];
export declare function getCustomerPasswordValidationError(password: string): string;
export declare function isCustomerPasswordValid(password: string): boolean;
